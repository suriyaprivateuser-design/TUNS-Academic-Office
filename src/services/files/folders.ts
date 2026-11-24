/**
 * Folder Management Service (ข้อ 21.3 — Smart Folder Manager)
 *
 * สร้างโฟลเดอร์ตามความจำเป็น แบบ idempotent และทนต่อการทำงานพร้อมกัน:
 *
 *   1. ตรวจ Folder Registry ด้วย folder_key (ไม่ค้นจากชื่อโฟลเดอร์)
 *   2. "จอง" ระดับที่ยังไม่มีด้วยคำสั่งเดียวผ่าน Write Gateway (folder_key ต้องไม่ซ้ำ)
 *      → คำขอที่เข้ามาพร้อมกันมีเพียงรายเดียวที่จองสำเร็จ รายอื่นรอผลของผู้จอง
 *   3. ผู้จองสร้างโฟลเดอร์ใน Drive โดยติด appProperty ของ folder_key
 *      ก่อนสร้างจะตรวจว่ามีโฟลเดอร์ที่ติด property เดียวกันอยู่แล้วหรือไม่ (กรณีผู้จองเดิมล่มกลางทาง) แล้วรับช่วงต่อ
 *   4. บันทึก Drive Folder ID และเปลี่ยนสถานะเป็น active
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { APP_PROPERTY, type DriveAdapter } from '@/lib/drive/types';
import { AppError, isAppError } from '@/lib/errors';
import type { Db } from '@/repositories/db';
import { FolderRegistry } from '@/schemas/database/system';
import type { RowOf } from '@/schemas/database/types';
import { ROOT_KEY, cumulativeKeys, type FolderSegment } from './paths';

export type FolderRow = RowOf<typeof FolderRegistry>;

/** การจองที่ค้างนานกว่านี้ถือว่าผู้จองล่ม ผู้อื่นรับช่วงต่อได้ */
const STALE_RESERVATION_MS = 60_000;
const WAIT_STEP_MS = 400;
const MAX_ATTEMPTS = 20;

export interface FolderContext {
  academicYear?: string | null;
  semester?: string | null;
  moduleCode?: string | null;
  departmentId?: string | null;
  referenceId?: string | null;
  ownerUserId?: string | null;
}

export interface FolderServiceOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function folderKeyProperty(folderKey: string): string {
  // appProperties จำกัดความยาว key+value ไว้ 124 ไบต์ จึงเก็บเป็น hash
  return createHash('sha256').update(folderKey, 'utf8').digest('hex').slice(0, 40);
}

export class FolderManagementService {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly drive: DriveAdapter,
    options: FolderServiceOptions = {},
  ) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  private repo() {
    return this.db.repo(FolderRegistry);
  }

  async findByKey(folderKey: string): Promise<FolderRow | null> {
    return this.repo().find((row) => row.folder_key === folderKey);
  }

  /** แถวของ Root Folder ใน Registry (สร้างครั้งแรกที่ใช้ โดยผูกกับ Root Folder ID ที่ตั้งค่าไว้) */
  async ensureRoot(actorId: string | null): Promise<FolderRow> {
    const existing = await this.findByKey(ROOT_KEY);
    if (existing?.status === 'active' && existing.drive_folder_id) return existing;
    if (!existing) {
      try {
        const uow = this.db.unitOfWork({ action: 'folders.registerRoot', actorId });
        uow.add(
          this.repo().insert({
            folder_key: ROOT_KEY,
            drive_folder_id: this.drive.rootFolderId,
            folder_name: 'TUNS Academic Office',
            folder_type: 'root',
            access_scope: 'system',
            last_verified_at: uow.now,
            status: 'active',
          }),
        );
        await uow.commit();
      } catch (error) {
        // มีคำขออื่นลงทะเบียน root ไปก่อน — ใช้แถวนั้น
        if (!isAppError(error) || error.code !== 'CONFLICT') throw error;
      }
    }
    const row = await this.findByKey(ROOT_KEY);
    if (!row?.drive_folder_id) {
      throw new AppError('SETUP_REQUIRED', 'ยังไม่ได้ลงทะเบียน Root Folder ของระบบ');
    }
    return row;
  }

  /**
   * ทำให้มั่นใจว่าโฟลเดอร์ทุกระดับของเส้นทางมีอยู่จริง แล้วคืนแถว Registry ของโฟลเดอร์ปลายทาง
   * เรียกซ้ำกี่ครั้งก็ได้ผลเดิม และไม่สร้างโฟลเดอร์ซ้ำแม้ถูกเรียกพร้อมกัน
   */
  async ensurePath(
    segments: readonly FolderSegment[],
    context: FolderContext,
    actorId: string | null,
  ): Promise<FolderRow> {
    if (segments.length === 0) return this.ensureRoot(actorId);
    const keys = cumulativeKeys(segments);
    const leafKey = keys[keys.length - 1] as string;

    /** แถวที่คำขอนี้เป็นผู้จองหรือรับช่วงต่อ — สร้างโฟลเดอร์ใน Drive ได้เฉพาะแถวเหล่านี้ */
    const owned = new Set<string>();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const root = await this.ensureRoot(actorId);
      const rows = await this.repo().all();
      const byKey = new Map(rows.map((row) => [row.folder_key, row]));
      const leaf = byKey.get(leafKey);
      if (leaf?.status === 'active' && leaf.drive_folder_id) return leaf;

      // ระดับที่ผู้อื่นจองไว้และยังสร้างไม่เสร็จ
      const foreign = keys
        .map((key) => byKey.get(key))
        .filter((row): row is FolderRow => !!row && row.status !== 'active' && !owned.has(row.id));

      if (foreign.length > 0) {
        const stale = foreign.every((row) => {
          const touched = Date.parse(row.updated_at ?? row.created_at);
          return this.now() - touched > STALE_RESERVATION_MS;
        });
        if (!stale) {
          await this.sleep(WAIT_STEP_MS); // ผู้จองยังทำงานอยู่ รอผลแล้วอ่านใหม่
          continue;
        }
        // ผู้จองเดิมค้างนานเกินกำหนด → รับช่วงต่อ (ผู้ที่เวอร์ชันตรงเท่านั้นที่ได้สิทธิ์)
        try {
          const uow = this.db.unitOfWork({ action: 'folders.takeOver', actorId });
          for (const row of foreign) {
            uow.add(this.repo().update(row.id, { status: 'creating' }, row.version));
          }
          await uow.commit();
          for (const row of foreign) owned.add(row.id);
        } catch (error) {
          if (isAppError(error) && error.code === 'CONFLICT') continue;
          throw error;
        }
      }

      const missing = keys.filter((key) => !byKey.has(key));
      if (missing.length > 0) {
        const reserved = await this.reserve(segments, keys, missing, byKey, root, context, actorId);
        if (!reserved) {
          await this.sleep(WAIT_STEP_MS); // ผู้อื่นจองไปก่อน รอแล้วอ่านใหม่
          continue;
        }
        for (const id of reserved) owned.add(id);
      }

      await this.materialise(keys, owned, actorId);
    }
    throw new AppError('INTEGRATION', 'สร้างโฟลเดอร์ปลายทางไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  /** จองทุกระดับที่ยังไม่มีในคำสั่งเดียว คืน id ของแถวที่จองได้ หรือ null เมื่อมีผู้อื่นจองระดับใดระดับหนึ่งไปก่อน */
  private async reserve(
    segments: readonly FolderSegment[],
    keys: string[],
    missing: string[],
    byKey: Map<string, FolderRow>,
    root: FolderRow,
    context: FolderContext,
    actorId: string | null,
  ): Promise<string[] | null> {
    const uow = this.db.unitOfWork({ action: 'folders.reserve', actorId });
    const newIds = new Map<string, string>();
    keys.forEach((key, index) => {
      if (!missing.includes(key)) return;
      const segment = segments[index] as FolderSegment;
      const parentKey = index === 0 ? null : (keys[index - 1] as string);
      const parentId = parentKey ? (byKey.get(parentKey)?.id ?? newIds.get(parentKey)) : root.id;
      const insert = this.repo().insert({
        folder_key: key,
        parent_folder_id: parentId ?? null,
        folder_name: segment.name,
        folder_type: segment.type,
        academic_year: context.academicYear ?? null,
        semester: context.semester ?? null,
        module_code: context.moduleCode ?? null,
        department_id: segment.type === 'department' ? (context.departmentId ?? null) : null,
        reference_id:
          segment.type === 'record' || segment.type === 'sub' ? (context.referenceId ?? null) : null,
        access_scope: segment.accessScope,
        owner_user_id: segment.accessScope === 'record' ? (context.ownerUserId ?? null) : null,
        status: 'creating',
      });
      newIds.set(key, insert.id);
      uow.add(insert);
    });
    try {
      await uow.commit();
      return Array.from(newIds.values());
    } catch (error) {
      if (isAppError(error) && error.code === 'CONFLICT') return null;
      throw error;
    }
  }

  /** สร้าง (หรือรับโฟลเดอร์ที่ค้างอยู่มาใช้ต่อ) ใน Drive เฉพาะระดับที่คำขอนี้เป็นเจ้าของ แล้วบันทึกผลในคำสั่งเดียว */
  private async materialise(
    keys: string[],
    owned: ReadonlySet<string>,
    actorId: string | null,
  ): Promise<void> {
    const rows = await this.repo().all();
    const byKey = new Map(rows.map((row) => [row.folder_key, row]));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const driveIds = new Map<string, string>();
    const uow = this.db.unitOfWork({ action: 'folders.activate', actorId });

    for (const key of keys) {
      const row = byKey.get(key);
      if (!row) return; // แถวหายระหว่างทาง — ให้รอบถัดไปจัดการ
      if (row.status === 'active' && row.drive_folder_id) {
        driveIds.set(row.id, row.drive_folder_id);
        continue;
      }
      // ระดับที่ผู้อื่นจองไว้: ห้ามสร้างแทน ให้รอบถัดไปรอผล
      if (!owned.has(row.id)) break;
      const parent = byId.get(row.parent_folder_id ?? '');
      const parentDriveId = driveIds.get(parent?.id ?? '') ?? parent?.drive_folder_id;
      if (!parentDriveId) return;

      const property = folderKeyProperty(key);
      const existing = await this.drive.findChildByProperty(
        parentDriveId,
        APP_PROPERTY.folderKey,
        property,
      );
      const folder =
        existing ??
        (await this.drive.createFolder({
          name: row.folder_name,
          parentId: parentDriveId,
          appProperties: { [APP_PROPERTY.folderKey]: property },
        }));
      driveIds.set(row.id, folder.id);
      uow.add(
        this.repo().update(
          row.id,
          { drive_folder_id: folder.id, status: 'active', last_verified_at: uow.now },
          row.version,
        ),
      );
    }
    if (uow.size === 0) return;
    try {
      await uow.commit();
    } catch (error) {
      // ผู้อื่นบันทึกผลไปก่อน (เวอร์ชันไม่ตรง) — โฟลเดอร์ใน Drive เป็นชุดเดียวกันเพราะจับคู่ด้วย appProperty
      if (!isAppError(error) || error.code !== 'CONFLICT') throw error;
    }
  }

  /** ตรวจกับ Drive ว่าโฟลเดอร์ยังอยู่ และปรับสถานะใน Registry ตามจริง */
  async verify(folderId: string, actorId: string | null): Promise<'active' | 'missing' | 'unknown'> {
    const row = await this.repo().byId(folderId);
    if (!row?.drive_folder_id) return 'unknown';
    const item = await this.drive.getItem(row.drive_folder_id);
    const found = item !== null && !item.trashed;
    const uow = this.db.unitOfWork({ action: 'folders.verify', actorId });
    uow.add(
      this.repo().update(
        row.id,
        found
          ? { status: 'active', last_verified_at: uow.now }
          : { status: 'missing', last_verified_at: uow.now },
      ),
    );
    await uow.commit();
    return found ? 'active' : 'missing';
  }
}
