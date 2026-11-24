/**
 * Authorization — ตรวจสิทธิ์ตาม Permission Matrix + ขอบเขตระดับ record
 *
 * ใช้ที่ฝั่ง Server เท่านั้น (Server Action, Route Handler, Service, Repository)
 * โมดูลนี้เป็นฟังก์ชันบริสุทธิ์ ไม่อ่านฐานข้อมูลเอง เพื่อให้ทดสอบได้ครบทุกกรณี
 */
import { forbidden } from '@/lib/errors';
import type { ResourceKey } from '@/config/modules';
import {
  ACTIONS,
  DEFAULT_PERMISSION_MATRIX,
  type Action,
  type PermissionMatrix,
  type Scope,
} from '@/config/permissions';
import type { RoleId } from '@/config/roles';

export interface RoleAssignment {
  roleId: RoleId;
  /** กลุ่มสาระที่บทบาทนี้ครอบคลุม (เช่น หัวหน้ากลุ่มสาระวิทยาศาสตร์) */
  departmentId: string | null;
  /** กลุ่มงานที่บทบาทนี้ครอบคลุม (เช่น หัวหน้างานวัดผล) */
  unitId: string | null;
}

/** ตัวตนขั้นต่ำที่ใช้ตัดสินสิทธิ์ */
export interface Principal {
  id: string;
  /** กลุ่มสาระที่สังกัด */
  departmentId: string | null;
  roles: readonly RoleAssignment[];
}

/** ความสัมพันธ์ของ record กับผู้ใช้/หน่วยงาน ที่ใช้ตัดสินขอบเขต */
export interface RecordContext {
  /** เจ้าของรายการ (ผู้สร้าง ผู้รับผิดชอบหลัก) */
  ownerIds?: readonly (string | null | undefined)[];
  /** ผู้เกี่ยวข้องโดยตรง (ผู้ร่วมรับผิดชอบ ผู้รับหนังสือ ผู้พิจารณาที่ถูกกำหนด) */
  participantIds?: readonly (string | null | undefined)[];
  departmentId?: string | null;
  unitId?: string | null;
}

interface Grant {
  scope: Scope;
  departmentIds: readonly string[];
  unitIds: readonly string[];
}

const key = (resource: ResourceKey, action: Action) => `${resource}:${action}`;

export class PermissionSet {
  private readonly grants = new Map<string, Grant[]>();

  constructor(
    readonly principal: Principal,
    matrix: PermissionMatrix = DEFAULT_PERMISSION_MATRIX,
  ) {
    for (const assignment of principal.roles) {
      const roleGrants = matrix[assignment.roleId];
      if (!roleGrants) continue;
      const departmentIds = [assignment.departmentId ?? principal.departmentId].filter(
        (id): id is string => Boolean(id),
      );
      const unitIds = [assignment.unitId].filter((id): id is string => Boolean(id));
      for (const [resource, actions] of Object.entries(roleGrants) as [
        ResourceKey,
        Partial<Record<Action, Scope>>,
      ][]) {
        for (const action of ACTIONS) {
          const scope = actions[action];
          if (!scope) continue;
          const list = this.grants.get(key(resource, action)) ?? [];
          list.push({ scope, departmentIds, unitIds });
          this.grants.set(key(resource, action), list);
        }
      }
    }
  }

  /** มีสิทธิ์ทำ action นี้กับ resource นี้ในขอบเขตใดขอบเขตหนึ่งหรือไม่ (ใช้กับเมนูและการ "สร้าง") */
  can(resource: ResourceKey, action: Action): boolean {
    return (this.grants.get(key(resource, action))?.length ?? 0) > 0;
  }

  /** มีสิทธิ์ในขอบเขต "ทั้งหมด" หรือไม่ */
  canAll(resource: ResourceKey, action: Action): boolean {
    return this.grants.get(key(resource, action))?.some((g) => g.scope === 'all') ?? false;
  }

  /** ขอบเขตกว้างที่สุดที่มี — ใช้แสดงผลเท่านั้น การตัดสินจริงใช้ canOnRecord */
  widestScope(resource: ResourceKey, action: Action): Scope | null {
    const list = this.grants.get(key(resource, action));
    if (!list?.length) return null;
    if (list.some((g) => g.scope === 'all')) return 'all';
    if (list.some((g) => g.scope === 'department')) return 'department';
    if (list.some((g) => g.scope === 'unit')) return 'unit';
    return 'own';
  }

  /**
   * ตรวจสิทธิ์ระดับ record
   * ขอบเขตที่กว้างกว่า "ของตนเอง" ครอบคลุมรายการที่ตนเป็นเจ้าของ/ผู้เกี่ยวข้องเสมอ
   */
  canOnRecord(resource: ResourceKey, action: Action, record: RecordContext): boolean {
    const list = this.grants.get(key(resource, action));
    if (!list?.length) return false;
    const userId = this.principal.id;
    const related =
      (record.ownerIds?.includes(userId) ?? false) ||
      (record.participantIds?.includes(userId) ?? false);

    return list.some((g) => {
      switch (g.scope) {
        case 'all':
          return true;
        case 'department':
          return (
            related || (!!record.departmentId && g.departmentIds.includes(record.departmentId))
          );
        case 'unit':
          return related || (!!record.unitId && g.unitIds.includes(record.unitId));
        case 'own':
          return related;
      }
    });
  }

  assertCan(resource: ResourceKey, action: Action, message?: string): void {
    if (!this.can(resource, action)) throw forbidden(message);
  }

  assertCanOnRecord(
    resource: ResourceKey,
    action: Action,
    record: RecordContext,
    message?: string,
  ): void {
    if (!this.canOnRecord(resource, action, record)) throw forbidden(message);
  }

  /** กรองรายการให้เหลือเฉพาะที่ผู้ใช้มีสิทธิ์ — ต้องเรียกก่อนส่งข้อมูลออกจาก Server เสมอ */
  filter<T>(
    resource: ResourceKey,
    action: Action,
    records: readonly T[],
    toContext: (record: T) => RecordContext,
  ): T[] {
    if (this.canAll(resource, action)) return [...records];
    if (!this.can(resource, action)) return [];
    return records.filter((record) => this.canOnRecord(resource, action, toContext(record)));
  }

  hasRole(roleId: RoleId): boolean {
    return this.principal.roles.some((r) => r.roleId === roleId);
  }

  /** resource ทั้งหมดที่ผู้ใช้ "ดู" ได้ — ใช้กรองเมนู (การกรองเมนูไม่ใช่การควบคุมสิทธิ์) */
  viewableResources(): Set<ResourceKey> {
    const result = new Set<ResourceKey>();
    for (const entry of this.grants.keys()) {
      const [resource, action] = entry.split(':') as [ResourceKey, Action];
      if (action === 'view') result.add(resource);
    }
    return result;
  }
}
