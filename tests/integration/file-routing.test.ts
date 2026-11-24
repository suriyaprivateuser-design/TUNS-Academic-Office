import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { APP_PROPERTY, FOLDER_MIME_TYPE } from '@/lib/drive/types';
import { FileRegistry, FolderRegistry } from '@/schemas/database/system';
import { FolderManagementService, folderKeyProperty } from '@/services/files/folders';
import { cumulativeKeys, resolveFolderPath, type FileRoute } from '@/services/files/paths';
import { FileRoutingService, type UploadRequest } from '@/services/files/routing';
import { HTML_BYTES, PDF_BYTES, createTestContext } from '../helpers/context';

const ROUTE: FileRoute = {
  moduleCode: 'CL',
  documentType: 'attachment',
  academicYear: '2569',
  semester: '2',
  recordRef: 'CL-2569-0001',
};
const ORIGIN = 'http://localhost:3000';
const noSleep = async () => {};

function request(overrides: Partial<UploadRequest> = {}): UploadRequest {
  return {
    route: ROUTE,
    filename: 'กำหนดการแข่งขัน.pdf',
    size: PDF_BYTES.byteLength,
    recordId: 'request-1',
    accessLevel: 'record',
    referenceId: '0001-A{{seq:att:2}}',
    sequence: { name: 'att', key: 'CL-2569-0001:A' },
    ...overrides,
  };
}

type Context = ReturnType<typeof createTestContext>;

async function uploadThroughSession(ctx: Context, service: FileRoutingService, actor: string, data = PDF_BYTES, overrides: Partial<UploadRequest> = {}) {
  const begun = await service.begin(actor, request({ size: data.byteLength, ...overrides }), ORIGIN);
  const sessionId = begun.uploadUrl.split('/').pop() as string;
  await ctx.drive.receiveSessionUpload(sessionId, data);
  return begun;
}

describe('FolderManagementService', () => {
  let ctx: Context;
  let folders: FolderManagementService;
  const segments = resolveFolderPath(ROUTE);

  beforeEach(() => {
    ctx = createTestContext();
    folders = new FolderManagementService(ctx.db, ctx.drive, { sleep: noSleep });
  });

  const driveFolders = () => ctx.drive.listAll().filter((item) => item.mimeType === FOLDER_MIME_TYPE && item.parentId);

  it('creates the whole chain once and registers every level by Drive ID', async () => {
    const leaf = await folders.ensurePath(segments, { academicYear: '2569', semester: '2', moduleCode: 'CL', referenceId: 'CL-2569-0001', ownerUserId: 'u1' }, 'u1');
    expect(leaf.status).toBe('active');
    expect(leaf.folder_name).toBe('02_เอกสารประกอบ');
    expect(leaf.access_scope).toBe('record');
    expect(driveFolders()).toHaveLength(segments.length);

    const registry = await ctx.db.repo(FolderRegistry).all();
    expect(registry.filter((row) => row.status === 'active')).toHaveLength(segments.length + 1); // + root
    expect(registry.every((row) => row.drive_folder_id)).toBe(true);
  });

  it('is idempotent: repeated calls create nothing new', async () => {
    const first = await folders.ensurePath(segments, {}, 'u1');
    const writes = ctx.storage.store.writeCount;
    const second = await folders.ensurePath(segments, {}, 'u1');
    expect(second.id).toBe(first.id);
    expect(ctx.storage.store.writeCount).toBe(writes);
    expect(driveFolders()).toHaveLength(segments.length);
  });

  it('does not create duplicate folders when many requests arrive at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        new FolderManagementService(ctx.db, ctx.drive, { sleep: noSleep }).ensurePath(segments, {}, `user-${index}`),
      ),
    );
    expect(new Set(results.map((row) => row.drive_folder_id)).size).toBe(1);
    expect(driveFolders()).toHaveLength(segments.length);
    const keys = (await ctx.db.repo(FolderRegistry).all()).map((row) => row.folder_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shares parent folders between records', async () => {
    await folders.ensurePath(segments, {}, 'u1');
    await folders.ensurePath(resolveFolderPath({ ...ROUTE, recordRef: 'CL-2569-0002', documentType: 'letter' }), {}, 'u1');
    // 4 ระดับร่วม + (record + sub) × 2
    expect(driveFolders()).toHaveLength(4 + 2 + 2);
  });

  it('takes over a reservation abandoned by a crashed request and adopts its Drive folder', async () => {
    const keys = cumulativeKeys(segments);
    // จำลองผู้จองที่สร้างโฟลเดอร์ระดับแรกใน Drive แล้วล่มก่อนบันทึกผล
    const root = await folders.ensureRoot('u1');
    const orphan = await ctx.drive.createFolder({
      name: segments[0]?.name ?? '',
      parentId: ctx.drive.rootFolderId,
      appProperties: { [APP_PROPERTY.folderKey]: folderKeyProperty(keys[0] as string) },
    });
    const uow = ctx.db.unitOfWork({ action: 'test.reserve', actorId: 'crashed' }, new Date(Date.now() - 5 * 60_000));
    uow.add(
      ctx.db.repo(FolderRegistry).insert({
        folder_key: keys[0] as string,
        parent_folder_id: root.id,
        folder_name: segments[0]?.name ?? '',
        folder_type: 'system',
        access_scope: 'module',
        status: 'creating',
      }),
    );
    await uow.commit();

    const leaf = await folders.ensurePath(segments, {}, 'u2');
    expect(leaf.status).toBe('active');
    const first = await folders.findByKey(keys[0] as string);
    expect(first?.drive_folder_id).toBe(orphan.id);
    expect(driveFolders()).toHaveLength(segments.length);
  });

  it('waits for a fresh reservation held by another request instead of duplicating it', async () => {
    const keys = cumulativeKeys(segments);
    const root = await folders.ensureRoot('u1');
    const uow = ctx.db.unitOfWork({ action: 'test.reserve', actorId: 'other' });
    const reserved = ctx.db.repo(FolderRegistry).insert({
      folder_key: keys[0] as string,
      parent_folder_id: root.id,
      folder_name: segments[0]?.name ?? '',
      folder_type: 'system',
      access_scope: 'module',
      status: 'creating',
    });
    uow.add(reserved);
    await uow.commit();

    let waits = 0;
    const waiting = new FolderManagementService(ctx.db, ctx.drive, {
      sleep: async () => {
        waits += 1;
        if (waits === 2) {
          // ผู้จองเดิมทำงานเสร็จระหว่างที่อีกฝ่ายรอ
          const created = await ctx.drive.createFolder({
            name: segments[0]?.name ?? '',
            parentId: ctx.drive.rootFolderId,
            appProperties: { [APP_PROPERTY.folderKey]: folderKeyProperty(keys[0] as string) },
          });
          const done = ctx.db.unitOfWork({ action: 'test.activate', actorId: 'other' });
          done.add(ctx.db.repo(FolderRegistry).update(reserved.id, { drive_folder_id: created.id, status: 'active' }));
          await done.commit();
        }
      },
    });
    const leaf = await waiting.ensurePath(segments, {}, 'u2');
    expect(waits).toBeGreaterThanOrEqual(2);
    expect(leaf.status).toBe('active');
    expect(driveFolders()).toHaveLength(segments.length);
  });

  it('marks a folder missing when it disappears from Drive', async () => {
    const leaf = await folders.ensurePath(segments, {}, 'u1');
    await ctx.drive.trash(leaf.drive_folder_id as string);
    expect(await folders.verify(leaf.id, 'admin')).toBe('missing');
    expect((await ctx.db.repo(FolderRegistry).byId(leaf.id))?.status).toBe('missing');
  });
});

describe('FileRoutingService', () => {
  let ctx: Context;
  let service: FileRoutingService;

  beforeEach(() => {
    ctx = createTestContext();
    service = new FileRoutingService(ctx.db, ctx.drive, new FolderManagementService(ctx.db, ctx.drive, { sleep: noSleep }));
  });

  const files = () => ctx.db.repo(FileRegistry).all();

  it('stores a file in the right folder with the standard name and verified metadata', async () => {
    const begun = await uploadThroughSession(ctx, service, 'teacher-1');
    expect(begun.storedFilename).toBe('TUNS-CL-2569-0001-A01-v01.pdf');
    expect(begun.target).toBe('app');

    // ก่อนยืนยัน: ยังไม่ถือว่าสำเร็จ
    expect((await files())[0]).toMatchObject({ upload_status: 'pending', is_current: false });

    const { file, duplicateOf } = await service.complete('teacher-1', begun.fileId);
    expect(duplicateOf).toBeNull();
    expect(file).toMatchObject({
      upload_status: 'verified',
      status: 'active',
      is_current: true,
      stored_filename: 'TUNS-CL-2569-0001-A01-v01.pdf',
      original_filename: 'กำหนดการแข่งขัน.pdf',
      mime_type: 'application/pdf',
      module_code: 'CL',
      document_type: 'attachment',
      academic_year: '2569',
      semester: '2',
      record_id: 'request-1',
      file_version: 1,
      uploaded_by: 'teacher-1',
    });
    expect(file.checksum).toMatch(/^[0-9a-f]{64}$/);

    const folder = await ctx.db.repo(FolderRegistry).byId(file.folder_id);
    expect(folder?.folder_key).toBe('years/ay:2569/sem:2/mod:class-leave/ref:CL-2569-0001/sub:attachment');
    const item = await ctx.drive.getItem(file.drive_file_id as string);
    expect(item).toMatchObject({ name: 'TUNS-CL-2569-0001-A01-v01.pdf', parentId: folder?.drive_folder_id });
  });

  it('numbers attachments of the same record without collisions', async () => {
    const names: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const begun = await uploadThroughSession(ctx, service, 'teacher-1', new TextEncoder().encode(`%PDF-1.7 file ${i}`));
      names.push(begun.storedFilename);
      await service.complete('teacher-1', begun.fileId);
    }
    expect(names).toEqual([
      'TUNS-CL-2569-0001-A01-v01.pdf',
      'TUNS-CL-2569-0001-A02-v01.pdf',
      'TUNS-CL-2569-0001-A03-v01.pdf',
    ]);
  });

  it('never reports success before the bytes are in storage', async () => {
    const begun = await service.begin('teacher-1', request(), ORIGIN);
    await expect(service.complete('teacher-1', begun.fileId)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await files())[0]?.upload_status).toBe('pending');
  });

  it('rejects a disguised file, moves it to trash and voids the record', async () => {
    const begun = await uploadThroughSession(ctx, service, 'teacher-1', HTML_BYTES);
    await expect(service.complete('teacher-1', begun.fileId)).rejects.toBeInstanceOf(AppError);
    expect((await files())[0]).toMatchObject({ upload_status: 'failed', status: 'void', is_current: false });
    expect(ctx.drive.listAll().filter((item) => item.mimeType !== FOLDER_MIME_TYPE)).toHaveLength(0);
  });

  it('rejects disallowed types before creating anything', async () => {
    await expect(service.begin('teacher-1', request({ filename: 'tool.exe' }), ORIGIN)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.begin('teacher-1', request({ filename: 'logo.svg' }), ORIGIN)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await files()).toHaveLength(0);
    expect(ctx.drive.listAll()).toHaveLength(1); // เฉพาะ root
  });

  it('does not let another user complete or cancel someone else’s upload', async () => {
    const begun = await uploadThroughSession(ctx, service, 'teacher-1');
    await expect(service.complete('intruder', begun.fileId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.cancel('intruder', begun.fileId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await files())[0]?.upload_status).toBe('pending');
  });

  it('adds a new version instead of overwriting, and keeps the old one as history', async () => {
    const first = await uploadThroughSession(ctx, service, 'teacher-1', PDF_BYTES, { referenceId: '0001', sequence: undefined, route: { ...ROUTE, documentType: 'letter' } });
    const v1 = (await service.complete('teacher-1', first.fileId)).file;

    const second = await uploadThroughSession(ctx, service, 'teacher-1', new TextEncoder().encode('%PDF-1.7 revised'), {
      referenceId: '0001',
      sequence: undefined,
      route: { ...ROUTE, documentType: 'letter' },
      documentId: v1.document_id,
    });
    const v2 = (await service.complete('teacher-1', second.fileId)).file;

    expect(second.storedFilename).toBe('TUNS-CL-2569-0001-v02.pdf');
    expect(v2).toMatchObject({ file_version: 2, is_current: true, document_id: v1.document_id });
    expect(await ctx.db.repo(FileRegistry).byId(v1.id)).toMatchObject({ is_current: false, status: 'superseded', upload_status: 'verified' });
    // ไฟล์เวอร์ชันเดิมยังอยู่ใน Drive
    expect(await ctx.drive.getItem(v1.drive_file_id as string)).toMatchObject({ trashed: false });
  });

  it('flags byte-identical duplicates within the same record', async () => {
    const a = await uploadThroughSession(ctx, service, 'teacher-1');
    await service.complete('teacher-1', a.fileId);
    const b = await uploadThroughSession(ctx, service, 'teacher-1');
    const result = await service.complete('teacher-1', b.fileId);
    expect(result.duplicateOf).toBe(a.fileId);
  });

  it('recovers an upload whose metadata was never confirmed, without creating a second file', async () => {
    const begun = await uploadThroughSession(ctx, service, 'teacher-1');
    // ผู้ใช้ปิดหน้าจอก่อนเรียก complete → ไฟล์อยู่ใน Drive แต่ metadata ยัง pending
    const report = await service.reconcile(null);
    expect(report).toMatchObject({ checked: 1, recovered: [begun.fileId], failed: [] });
    expect((await files())[0]).toMatchObject({ upload_status: 'verified', is_current: true });
    expect(ctx.drive.listAll().filter((item) => item.mimeType !== FOLDER_MIME_TYPE)).toHaveLength(1);
  });

  it('closes abandoned sessions only after the grace period and never deletes Drive files', async () => {
    const begun = await service.begin('teacher-1', request(), ORIGIN);
    expect((await service.reconcile(null)).stillPending).toEqual([begun.fileId]);
    const later = await service.reconcile(null, Date.now() + 31 * 60 * 1000);
    expect(later.failed).toEqual([begun.fileId]);
    expect((await files())[0]).toMatchObject({ upload_status: 'failed', status: 'void' });
  });

  it('stores server-generated documents and locks approved copies', async () => {
    const file = await service.storeBytes(
      'system-user',
      { route: { ...ROUTE, documentType: 'approved' }, filename: 'approved.pdf', recordId: 'request-1', accessLevel: 'record', referenceId: '0001', locked: true },
      PDF_BYTES,
    );
    expect(file).toMatchObject({ upload_status: 'verified', is_locked: true, stored_filename: 'TUNS-CL-2569-0001-v01.pdf' });
    const folder = await ctx.db.repo(FolderRegistry).byId(file.folder_id);
    expect(folder?.folder_name).toBe('04_ฉบับอนุมัติ');
  });

  it('accepts a safe SVG through the server path and rejects an unsafe one', async () => {
    const svg = (inner: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
    const asset = { route: { moduleCode: 'AST', documentType: 'school_crest' } as FileRoute, filename: 'crest.svg', accessLevel: 'staff' as const, referenceId: 'CREST' };
    const stored = await service.storeBytes('admin', asset, svg('<circle r="4"/>'));
    expect(stored.mime_type).toBe('image/svg+xml');
    await expect(service.storeBytes('admin', asset, svg('<script>alert(1)</script>'))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await files()).filter((row) => row.upload_status === 'verified')).toHaveLength(1);
  });
});
