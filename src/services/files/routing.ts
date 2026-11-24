/**
 * Automated File Routing Engine (ข้อ 22) — ทุก Module อัปโหลดไฟล์ผ่านบริการนี้เท่านั้น
 *
 * ขั้นตอน (เลขตรงกับข้อ 22 ของ Master Prompt)
 *   1–2  Authentication / Authorization ........ ผู้เรียก (Server Action/Route) ตรวจแล้วส่ง `actor` มา
 *                                                 และบริการนี้ตรวจซ้ำว่าเป็นเจ้าของ session อัปโหลด
 *   3–4  ประเภท ขนาด ความปลอดภัย ............... validateDeclaredFile + ตรวจเนื้อไฟล์จริงหลังอัปโหลด
 *   5–9  Module / ประเภท / ปี–ภาค / หน่วยงาน / record ... FileRoute
 *   10–11 หาและสร้างโฟลเดอร์ปลายทาง ............. FolderManagementService.ensurePath
 *   12   ตั้งชื่อไฟล์ตามมาตรฐาน ................. buildStoredFilename
 *   13   อัปโหลดลง Google Drive ................. upload session (browser → Drive) หรือ uploadFile (ฝั่ง Server)
 *   14   ตรวจผลการอัปโหลด ...................... complete(): ไฟล์อยู่ใน Drive จริง ขนาดตรง เนื้อไฟล์ตรงนามสกุล
 *   15   บันทึก Metadata ....................... FileRegistry (จองแถวก่อนอัปโหลด แล้วยืนยันหลังตรวจ)
 *   16   Audit Log ............................. อยู่ในคำสั่งเขียนเดียวกับการยืนยัน
 *   17   แจ้งผลแก่ผู้ใช้ ....................... คืนสถานะ verified เท่านั้นจึงถือว่า "อัปโหลดสำเร็จ"
 *
 * การจองแถว FileRegistry ก่อนอัปโหลดทำให้ทุกไฟล์ใน Drive มี metadata คู่กันเสมอ
 * ถ้าขั้นใดล้มเหลว แถวจะค้างสถานะ pending / pending_reconciliation และ `reconcile()` กู้คืนได้
 * โดยไม่สร้างไฟล์ซ้ำ (จับคู่ด้วย appProperty `tunsFileId`)
 */
import 'server-only';
import type { ResourceKey } from '@/config/modules';
import type { FileAccessLevel, ModuleCode } from '@/config/reference';
import { APP_PROPERTY, type DriveAdapter, type DriveItem } from '@/lib/drive/types';
import { AppError, forbidden, isAppError, notFound, validation } from '@/lib/errors';
import { newId } from '@/repositories/base';
import type { Db } from '@/repositories/db';
import { FileRegistry } from '@/schemas/database/system';
import type { RowOf } from '@/schemas/database/types';
import { FolderManagementService, type FolderRow } from './folders';
import { buildStoredFilename, sanitizeOriginalFilename } from './naming';
import { resolveFolderPath, type FileRoute } from './paths';
import {
  SNIFF_BYTES,
  assertContentMatches,
  assertSafeSvg,
  validateDeclaredFile,
  type AcceptedFile,
  type FilePolicy,
} from './validation';

export type FileRow = RowOf<typeof FileRegistry>;

export interface UploadRequest {
  route: FileRoute;
  filename: string;
  size: number;
  /** ชื่อเอกสารที่แสดงต่อผู้ใช้ */
  title?: string | null;
  recordId?: string | null;
  /** ระบุเมื่อเป็น "เวอร์ชันใหม่" ของเอกสารเดิม */
  documentId?: string | null;
  departmentId?: string | null;
  unitId?: string | null;
  accessLevel: FileAccessLevel;
  /**
   * เลขอ้างอิงในชื่อไฟล์ เช่น `0001` หรือ `0001-A{{seq:att:2}}`
   * ใช้ร่วมกับ `sequence` เมื่อต้องการเลขลำดับที่ไม่ซ้ำจาก Write Gateway
   */
  referenceId: string;
  sequence?: { name: string; key: string };
  policy?: FilePolicy;
  /** true = ไฟล์ของเอกสารที่อนุมัติแล้ว ห้ามเขียนทับ */
  locked?: boolean;
}

export interface BeginUploadResult {
  fileId: string;
  uploadUrl: string;
  target: 'google' | 'app';
  storedFilename: string;
}

export interface CompletedUpload {
  file: FileRow;
  /** ไฟล์อื่นใน record เดียวกันที่มีเนื้อหาเหมือนกันทุกไบต์ (ถ้ามี) */
  duplicateOf: string | null;
}

export interface ReconcileReport {
  checked: number;
  recovered: string[];
  failed: string[];
  stillPending: string[];
}

/** เวลาขั้นต่ำก่อนที่ Reconciliation จะถือว่าการอัปโหลดที่ค้างอยู่ถูกทิ้ง */
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

export class FileRoutingService {
  private readonly folders: FolderManagementService;

  constructor(
    private readonly db: Db,
    private readonly drive: DriveAdapter,
    folders?: FolderManagementService,
  ) {
    this.folders = folders ?? new FolderManagementService(db, drive);
  }

  private repo() {
    return this.db.repo(FileRegistry);
  }

  /** ขั้นที่ 3–12 และ 15 (จอง metadata): คืน id ของแถวที่จอง ชื่อไฟล์มาตรฐาน และโฟลเดอร์ปลายทาง */
  private async reserve(
    actorId: string,
    request: UploadRequest,
    accepted: AcceptedFile,
  ): Promise<{ fileId: string; storedFilename: string; folder: FolderRow; version: number }> {
    const segments = resolveFolderPath(request.route);
    const folder = await this.folders.ensurePath(
      segments,
      {
        academicYear: request.route.academicYear,
        semester: request.route.semester,
        moduleCode: request.route.moduleCode,
        departmentId: request.route.department?.id ?? request.departmentId,
        referenceId: request.route.recordRef,
        ownerUserId: actorId,
      },
      actorId,
    );
    if (!folder.drive_folder_id) throw new AppError('INTEGRATION', 'ไม่พบโฟลเดอร์ปลายทางใน Drive');

    let version = 1;
    if (request.documentId) {
      const previous = await this.repo().filter(
        (row) => row.document_id === request.documentId && row.status !== 'void',
      );
      if (previous.length === 0) throw notFound('ไม่พบเอกสารเดิมที่จะเพิ่มเวอร์ชัน');
      version = Math.max(...previous.map((row) => row.file_version)) + 1;
    }

    const uow = this.db.unitOfWork({ action: 'files.reserve', actorId });
    const fileId = newId();
    if (request.sequence) uow.sequence(request.sequence.name, request.sequence.key);
    const academicYear = request.route.academicYear ?? '';
    const storedFilenameTemplate = buildStoredFilename({
      moduleCode: request.route.moduleCode,
      // ไฟล์ที่ไม่ผูกปีการศึกษา (เช่น Asset) ใช้ปี พ.ศ. ปัจจุบันในชื่อไฟล์
      academicYear: /^\d{4}$/.test(academicYear)
        ? academicYear
        : String(new Date(uow.now).getUTCFullYear() + 543),
      referenceId: request.referenceId,
      version,
      extension: accepted.extension,
    });
    uow.add(
      this.repo().insert({
        id: fileId,
        drive_folder_id: folder.drive_folder_id,
        folder_id: folder.id,
        document_id: request.documentId ?? newId(),
        record_id: request.recordId ?? null,
        module_code: request.route.moduleCode,
        document_type: request.route.documentType,
        academic_year: request.route.academicYear ?? null,
        semester: request.route.semester ?? null,
        department_id: request.departmentId ?? request.route.department?.id ?? null,
        unit_id: request.unitId ?? null,
        reference_id: request.route.recordRef ?? null,
        title: request.title?.trim() || null,
        original_filename: sanitizeOriginalFilename(request.filename),
        stored_filename: storedFilenameTemplate,
        mime_type: accepted.mimeType,
        file_size: request.size,
        file_version: version,
        // ยังไม่เป็นเวอร์ชันปัจจุบันจนกว่าจะยืนยันว่าไฟล์อยู่ใน Drive ครบถ้วน
        is_current: false,
        is_locked: request.locked === true,
        status: 'active',
        upload_status: 'pending',
        access_level: request.accessLevel,
        uploaded_by: actorId,
        uploaded_at: uow.now,
      }),
    );
    uow.data('storedFilename', storedFilenameTemplate);
    const result = await uow.commit();
    return {
      fileId,
      storedFilename: result.data.storedFilename ?? storedFilenameTemplate,
      folder,
      version,
    };
  }

  /** เริ่มอัปโหลดจาก browser: คืน URL ของ upload session ให้ browser ส่งเนื้อไฟล์ */
  async begin(actorId: string, request: UploadRequest, origin: string): Promise<BeginUploadResult> {
    const accepted = validateDeclaredFile({ filename: request.filename, size: request.size }, request.policy);
    if (accepted.extension === 'svg') {
      // SVG ต้องผ่านการตรวจเนื้อหาที่ฝั่ง Server ก่อนเก็บ จึงไม่เปิด session ให้ส่งตรงไป Drive
      throw validation('ไฟล์ SVG ต้องอัปโหลดผ่านช่องทางตรวจสอบของระบบ');
    }
    const reserved = await this.reserve(actorId, request, accepted);
    try {
      const session = await this.drive.createUploadSession({
        name: reserved.storedFilename,
        parentId: reserved.folder.drive_folder_id as string,
        mimeType: accepted.mimeType,
        size: request.size,
        appProperties: { [APP_PROPERTY.fileId]: reserved.fileId },
        origin,
      });
      return { fileId: reserved.fileId, storedFilename: reserved.storedFilename, ...session };
    } catch (error) {
      await this.markFailed(reserved.fileId, actorId);
      throw isAppError(error)
        ? error
        : new AppError('INTEGRATION', 'เปิดช่องทางอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', {
            cause: error,
          });
    }
  }

  /** อัปโหลดจากฝั่ง Server: ไฟล์ที่ระบบสร้างเอง (PDF) หรือไฟล์ที่ต้องตรวจเนื้อหาก่อน (SVG) */
  async storeBytes(actorId: string, request: Omit<UploadRequest, 'size'>, data: Uint8Array): Promise<FileRow> {
    const accepted = validateDeclaredFile(
      { filename: request.filename, size: data.byteLength },
      request.policy,
    );
    assertContentMatches(accepted.extension, data.subarray(0, SNIFF_BYTES));
    if (accepted.extension === 'svg') assertSafeSvg(data);

    const reserved = await this.reserve(actorId, { ...request, size: data.byteLength }, accepted);
    try {
      await this.drive.uploadFile({
        name: reserved.storedFilename,
        parentId: reserved.folder.drive_folder_id as string,
        mimeType: accepted.mimeType,
        data,
        appProperties: { [APP_PROPERTY.fileId]: reserved.fileId },
      });
    } catch (error) {
      await this.markFailed(reserved.fileId, actorId);
      throw isAppError(error)
        ? error
        : new AppError('INTEGRATION', 'จัดเก็บไฟล์ลง Google Drive ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', {
            cause: error,
          });
    }
    return (await this.complete(actorId, reserved.fileId)).file;
  }

  /**
   * ขั้นที่ 14–16: ยืนยันว่าไฟล์อยู่ใน Drive จริงและถูกต้อง แล้วจึงเปลี่ยนสถานะเป็น verified
   * ห้ามรายงานว่าอัปโหลดสำเร็จก่อนฟังก์ชันนี้คืนค่า
   */
  async complete(actorId: string, fileId: string): Promise<CompletedUpload> {
    const row = await this.repo().byId(fileId);
    if (!row) throw notFound('ไม่พบรายการอัปโหลด');
    if (row.uploaded_by !== actorId) throw forbidden();
    if (row.upload_status === 'verified') return { file: row, duplicateOf: null };
    if (row.upload_status === 'failed' || row.status === 'void') {
      throw validation('การอัปโหลดนี้ถูกยกเลิกแล้ว กรุณาอัปโหลดใหม่');
    }

    const verification = await this.verifyInDrive(row);
    if (verification.outcome === 'unavailable') {
      // ตรวจกับ Drive ไม่ได้ในตอนนี้ — ไม่รายงานว่าสำเร็จ และปล่อยให้ Reconciliation ตรวจซ้ำ
      await this.setUploadStatus(row, 'pending_reconciliation', actorId);
      throw new AppError(
        'INTEGRATION',
        'ยังยืนยันไฟล์กับ Google Drive ไม่ได้ ระบบจะตรวจซ้ำให้อัตโนมัติ กรุณาตรวจสถานะอีกครั้งภายหลัง',
      );
    }
    if (verification.outcome === 'missing') {
      throw validation('ยังไม่พบไฟล์ในพื้นที่จัดเก็บ การอัปโหลดอาจยังไม่เสร็จ กรุณาลองใหม่');
    }
    if (verification.outcome === 'invalid') {
      await this.drive.trash(verification.item.id).catch(() => undefined);
      await this.markFailed(row.id, actorId);
      throw validation(verification.reason);
    }
    return this.confirm(row, verification.item, actorId);
  }

  private async verifyInDrive(
    row: FileRow,
  ): Promise<
    | { outcome: 'ok'; item: DriveItem }
    | { outcome: 'missing' }
    | { outcome: 'unavailable' }
    | { outcome: 'invalid'; item: DriveItem; reason: string }
  > {
    try {
      const item = row.drive_file_id
        ? await this.drive.getItem(row.drive_file_id)
        : await this.drive.findChildByProperty(row.drive_folder_id ?? '', APP_PROPERTY.fileId, row.id);
      if (!item || item.trashed) return { outcome: 'missing' };
      if (item.size !== row.file_size) {
        return {
          outcome: 'invalid',
          item,
          reason: 'ขนาดไฟล์ที่ได้รับไม่ตรงกับที่แจ้งไว้ ระบบจึงไม่รับไฟล์นี้ กรุณาอัปโหลดใหม่',
        };
      }
      const extension = row.stored_filename.split('.').pop() ?? '';
      try {
        assertContentMatches(extension, await this.drive.readHead(item.id, SNIFF_BYTES));
      } catch (error) {
        if (isAppError(error) && error.code === 'VALIDATION') {
          return { outcome: 'invalid', item, reason: error.message };
        }
        throw error;
      }
      return { outcome: 'ok', item };
    } catch {
      return { outcome: 'unavailable' };
    }
  }

  private async confirm(row: FileRow, item: DriveItem, actorId: string | null): Promise<CompletedUpload> {
    const siblings = await this.repo().filter(
      (other) =>
        other.id !== row.id && other.upload_status === 'verified' && other.status !== 'void',
    );
    const duplicate =
      item.sha256 === null
        ? null
        : (siblings.find(
            (other) =>
              other.checksum === item.sha256 &&
              other.module_code === row.module_code &&
              (other.record_id ?? '') === (row.record_id ?? '') &&
              other.document_id !== row.document_id,
          ) ?? null);

    const uow = this.db.unitOfWork({ action: 'files.confirm', actorId });
    // เวอร์ชันก่อนหน้าของเอกสารเดียวกันถูกแทนที่ (ยังเก็บไว้เป็นประวัติ ไม่ลบ)
    for (const previous of siblings) {
      if (previous.document_id === row.document_id && previous.is_current) {
        uow.add(this.repo().update(previous.id, { is_current: false, status: 'superseded' }));
      }
    }
    uow.add(
      this.repo().update(
        row.id,
        {
          drive_file_id: item.id,
          checksum: item.sha256,
          upload_status: 'verified',
          verified_at: uow.now,
          is_current: true,
        },
        row.version,
      ),
    );
    uow.audit({
      action: 'files.upload',
      category: 'file',
      entityType: 'file',
      entityId: row.id,
      summary: `จัดเก็บไฟล์ ${row.stored_filename} (${row.module_code})`,
      metadata: { moduleCode: row.module_code, recordId: row.record_id, version: row.file_version },
    });
    try {
      await uow.commit();
    } catch (error) {
      if (isAppError(error) && error.code === 'CONFLICT') {
        // มีคำขออื่นยืนยันไฟล์เดียวกันไปก่อน — ใช้ผลนั้น
        const latest = await this.repo().byId(row.id);
        if (latest?.upload_status === 'verified') return { file: latest, duplicateOf: null };
      }
      throw error;
    }
    const confirmed = await this.repo().byId(row.id);
    if (!confirmed) throw notFound();
    return { file: confirmed, duplicateOf: duplicate?.id ?? null };
  }

  private async setUploadStatus(
    row: FileRow,
    status: FileRow['upload_status'],
    actorId: string | null,
  ): Promise<void> {
    try {
      const uow = this.db.unitOfWork({ action: 'files.status', actorId });
      uow.add(this.repo().update(row.id, { upload_status: status }));
      await uow.commit();
    } catch {
      // ถ้าบันทึกสถานะไม่ได้ แถวยังเป็น pending ซึ่ง Reconciliation ตรวจให้เช่นกัน
    }
  }

  private async markFailed(fileId: string, actorId: string | null): Promise<void> {
    try {
      const uow = this.db.unitOfWork({ action: 'files.fail', actorId });
      uow.add(this.repo().update(fileId, { upload_status: 'failed', status: 'void' }));
      await uow.commit();
    } catch {
      // แถวค้าง pending — Reconciliation จัดการต่อ
    }
  }

  /** ผู้ใช้ยกเลิกการอัปโหลดที่ยังไม่เสร็จ */
  async cancel(actorId: string, fileId: string): Promise<void> {
    const row = await this.repo().byId(fileId);
    if (!row) return;
    if (row.uploaded_by !== actorId) throw forbidden();
    if (row.upload_status === 'verified') throw validation('ไฟล์นี้จัดเก็บเรียบร้อยแล้ว');
    await this.markFailed(fileId, actorId);
  }

  /**
   * Reconciliation: ตรวจแถวที่ค้าง (pending / pending_reconciliation) กับ Drive
   *   - พบไฟล์และถูกต้อง → ยืนยันให้ (ไม่ต้องอัปโหลดใหม่ ไม่เกิดไฟล์ซ้ำ)
   *   - ไม่พบไฟล์และค้างนานเกินกำหนด → ปิดเป็น failed
   * ไม่ลบไฟล์ใด ๆ ใน Drive โดยอัตโนมัติ
   */
  async reconcile(actorId: string | null, now: number = Date.now()): Promise<ReconcileReport> {
    const candidates = await this.repo().filter(
      (row) =>
        row.status !== 'void' &&
        (row.upload_status === 'pending' || row.upload_status === 'pending_reconciliation'),
    );
    const report: ReconcileReport = { checked: candidates.length, recovered: [], failed: [], stillPending: [] };
    for (const row of candidates) {
      const verification = await this.verifyInDrive(row);
      if (verification.outcome === 'ok') {
        await this.confirm(row, verification.item, actorId);
        report.recovered.push(row.id);
      } else if (
        verification.outcome === 'missing' &&
        now - Date.parse(row.uploaded_at) > ABANDONED_AFTER_MS
      ) {
        await this.markFailed(row.id, actorId);
        report.failed.push(row.id);
      } else if (verification.outcome === 'invalid') {
        await this.markFailed(row.id, actorId);
        report.failed.push(row.id);
      } else {
        report.stillPending.push(row.id);
      }
    }
    return report;
  }
}

/** Module ของไฟล์ → ระบบย่อยที่ใช้ตัดสินสิทธิ์ */
export const MODULE_RESOURCE: Record<ModuleCode, ResourceKey> = {
  IN: 'documents.incoming',
  OUT: 'documents.outgoing',
  MEMO: 'documents.memos',
  ORDER: 'documents.orders',
  CL: 'classLeave.requests',
  LP: 'tasks.submissions',
  RES: 'tasks.submissions',
  SUB: 'tasks.submissions',
  MTG: 'meetings.minutes',
  CERT: 'documents.certificates',
  ANN: 'documents.announcements',
  RPT: 'intelligence.reports',
  LIB: 'knowledge.library',
  TPL: 'intelligence.admin',
  AST: 'intelligence.admin',
  SVC: 'services.manage',
  SVY: 'knowledge.surveys',
};
