/**
 * Repository กลาง — เข้าถึงหนึ่ง Worksheet แบบมีชนิดข้อมูลตาม Schema Registry
 *
 * - อ่าน: แปลงทั้งตารางเป็น object หนึ่งครั้งต่อ snapshot แล้วใช้ซ้ำ (ผลลัพธ์ถูก freeze ห้ามแก้ไข)
 * - เขียน: Repository "สร้างคำสั่ง" (mutation) เท่านั้น การเขียนจริงรวมอยู่ใน UnitOfWork.commit()
 *   เพื่อให้หนึ่งการกระทำของผู้ใช้ = หนึ่งคำสั่งไปยัง Write Gateway
 * - Repository ไม่ตรวจสิทธิ์เอง ผู้เรียก (Service) ต้องตรวจด้วย PermissionSet ก่อนส่งข้อมูลออกเสมอ
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { InsertMutation, UpdateMutation } from '@/lib/storage/gateway-core';
import { parseRows, serializeInsert, serializePatch } from '@/lib/storage/serialization';
import type { StorageAdapter, TableSnapshot } from '@/lib/storage/types';
import type { InsertOf, PatchOf, RowOf, TableDef } from '@/schemas/database/types';

const MANAGED_COLUMNS: ReadonlySet<string> = new Set([
  'version',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
]);

interface ParsedTable {
  rows: readonly unknown[];
  byId: Map<string, unknown>;
}

const parsedCache = new WeakMap<TableSnapshot, ParsedTable>();

export function newId(): string {
  return randomUUID();
}

export class Repository<T extends TableDef> {
  constructor(
    readonly table: T,
    private readonly storage: StorageAdapter,
    private readonly minFreshAt: () => Promise<number | undefined>,
  ) {}

  private async load(): Promise<ParsedTable> {
    const snapshot = await this.storage.readTable(this.table.key, {
      minFreshAt: await this.minFreshAt(),
    });
    let parsed = parsedCache.get(snapshot);
    if (!parsed) {
      const rows = parseRows(this.table, snapshot.header, snapshot.rows);
      const byId = new Map<string, unknown>();
      for (const row of rows) {
        Object.freeze(row);
        byId.set((row as { id: string }).id, row);
      }
      parsed = { rows: Object.freeze(rows), byId };
      parsedCache.set(snapshot, parsed);
    }
    return parsed;
  }

  async all(): Promise<readonly RowOf<T>[]> {
    return (await this.load()).rows as readonly RowOf<T>[];
  }

  async byId(id: string | null | undefined): Promise<RowOf<T> | null> {
    if (!id) return null;
    return ((await this.load()).byId.get(id) as RowOf<T> | undefined) ?? null;
  }

  async byIds(ids: readonly string[]): Promise<RowOf<T>[]> {
    const { byId } = await this.load();
    const result: RowOf<T>[] = [];
    for (const id of ids) {
      const row = byId.get(id) as RowOf<T> | undefined;
      if (row) result.push(row);
    }
    return result;
  }

  async filter(predicate: (row: RowOf<T>) => boolean): Promise<RowOf<T>[]> {
    return (await this.all()).filter(predicate);
  }

  async find(predicate: (row: RowOf<T>) => boolean): Promise<RowOf<T> | null> {
    return (await this.all()).find(predicate) ?? null;
  }

  async count(predicate?: (row: RowOf<T>) => boolean): Promise<number> {
    const rows = await this.all();
    return predicate ? rows.filter(predicate).length : rows.length;
  }

  /** สร้างคำสั่งเพิ่มแถว — คืน id ของแถวใหม่ด้วย (สร้าง UUID ให้ถ้าไม่ระบุ) */
  insert(values: InsertOf<T>): { id: string; mutation: InsertMutation } {
    const id = (values as { id?: string }).id ?? newId();
    const cells = serializeInsert(
      this.table,
      { ...(values as Record<string, unknown>), id },
      MANAGED_COLUMNS,
    );
    return {
      id,
      mutation: {
        op: 'insert',
        table: this.table.key,
        values: cells,
        uniqueBy: this.table.uniqueKeys?.map((group) => [...group]),
      },
    };
  }

  /**
   * สร้างคำสั่งแก้ไขแถว
   * ส่ง `expectedVersion` ทุกครั้งที่การแก้ไขขึ้นกับสถานะเดิม (เช่น อนุมัติ เปลี่ยนสถานะ) เพื่อกันการชนกัน
   */
  update(id: string, patch: PatchOf<T>, expectedVersion?: number): UpdateMutation {
    const set = serializePatch(this.table, patch as Record<string, unknown>);
    const touched = new Set(Object.keys(set));
    const uniqueBy = this.table.uniqueKeys
      ?.filter((group) => group.some((column) => touched.has(column)))
      .map((group) => [...group]);
    return {
      op: 'update',
      table: this.table.key,
      id,
      set,
      expectedVersion,
      uniqueBy: uniqueBy?.length ? uniqueBy : undefined,
    };
  }
}
