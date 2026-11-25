/**
 * Library Service — คลังเอกสารกลาง / Document Explorer (ข้อ 17 / 07.1)
 *
 * ไฟล์จริงอยู่ใน Google Drive หน้าเว็บแสดงจาก File Registry และ Folder Registry ใน Google Sheets
 * ทุกรายการถูกกรองสิทธิ์ที่ Server ก่อนส่งออก และการดาวน์โหลดตรวจสิทธิ์อีกครั้งที่ endpoint ของไฟล์
 */
import 'server-only';
import { z } from 'zod';
import { isModuleCode, type FileAccessLevel } from '@/config/reference';
import type { DriveAdapter } from '@/lib/drive/types';
import { forbidden, notFound, validation } from '@/lib/errors';
import type { Db } from '@/repositories/db';
import { DocumentCategories, LibraryFavorites, LibraryFiles } from '@/schemas/database/knowledge';
import { Departments, Users } from '@/schemas/database/master';
import { FileRegistry, FolderRegistry } from '@/schemas/database/system';
import type { RowOf } from '@/schemas/database/types';
import { canReadFile, isInlinePreviewable } from './files/access';
import { ROOT_KEY } from './files/paths';
import { FileRoutingService, MODULE_RESOURCE, type BeginUploadResult, type FileRow } from './files/routing';
import type { CurrentUser } from './identity';
import { getCurrentTerm } from './settings';

type FolderRow = RowOf<typeof FolderRegistry>;

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  type: FolderRow['folder_type'];
  /** true = ผู้ใช้เปิดดูไฟล์ในโฟลเดอร์นี้ได้ (false = แสดงเพื่อนำทางไปยังโฟลเดอร์ลูกเท่านั้น) */
  accessible: boolean;
  fileCount: number;
}

export interface ExplorerFile {
  id: string;
  documentId: string;
  title: string;
  description: string | null;
  storedFilename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  version: number;
  folderId: string | null;
  moduleCode: string;
  categoryId: string | null;
  categoryName: string | null;
  departmentName: string | null;
  academicYear: string | null;
  semester: string | null;
  uploadedByName: string;
  uploadedAt: string;
  isMine: boolean;
  isFavorite: boolean;
  isPinned: boolean;
  isLocked: boolean;
  previewable: boolean;
  /** รหัสรายการในคลัง (null = ไฟล์ของ Module อื่นที่แสดงใน Explorer) */
  libraryId: string | null;
  libraryVersion: number | null;
  canManage: boolean;
}

export interface ExplorerData {
  folders: FolderNode[];
  rootId: string | null;
  files: ExplorerFile[];
  categories: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  academicYears: string[];
  canUpload: boolean;
  storage: 'google-drive' | 'local';
}

function canSeeFolder(user: CurrentUser, folder: FolderRow): boolean {
  if (folder.status === 'archived' || folder.status === 'creating') return false;
  switch (folder.access_scope) {
    case 'staff':
      return true;
    case 'system':
      return user.permissions.can('intelligence.admin', 'view');
    case 'module': {
      if (!folder.module_code) return user.permissions.can('knowledge.library', 'manage');
      return isModuleCode(folder.module_code)
        ? user.permissions.canAll(MODULE_RESOURCE[folder.module_code], 'view')
        : false;
    }
    case 'record':
      return (
        folder.owner_user_id === user.id ||
        (isModuleCode(folder.module_code ?? '')
          ? user.permissions.canAll(MODULE_RESOURCE[folder.module_code as keyof typeof MODULE_RESOURCE], 'view')
          : false)
      );
  }
}

/** ข้อมูลทั้งหมดของ Document Explorer สำหรับผู้ใช้หนึ่งคน (กรองสิทธิ์แล้ว) */
export async function getExplorer(db: Db, user: CurrentUser, drive: DriveAdapter): Promise<ExplorerData> {
  user.permissions.assertCan('knowledge.library', 'view');
  const [folders, files, library, favorites, categories, departments, users] = await Promise.all([
    db.repo(FolderRegistry).all(),
    db.repo(FileRegistry).all(),
    db.repo(LibraryFiles).all(),
    db.repo(LibraryFavorites).filter((f) => f.user_id === user.id && f.is_active),
    db.repo(DocumentCategories).all(),
    db.repo(Departments).all(),
    db.repo(Users).all(),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  const departmentName = new Map(departments.map((d) => [d.id, d.name_th]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name_th]));
  const libraryByDocument = new Map(library.map((entry) => [entry.document_id, entry]));
  const favoriteIds = new Set(favorites.map((f) => f.library_file_id));
  const canManageLibrary = user.permissions.can('knowledge.library', 'manage');

  const visibleFiles: ExplorerFile[] = [];
  for (const file of files) {
    if (!file.is_current || file.status !== 'active' || file.archived_at) continue;
    const entry = libraryByDocument.get(file.document_id) ?? null;
    if (entry && entry.status !== 'active') continue;
    if (!(await canReadFile(db, user, file))) continue;
    visibleFiles.push({
      id: file.id,
      documentId: file.document_id,
      title: entry?.title ?? file.title ?? file.original_filename,
      description: entry?.description ?? null,
      storedFilename: file.stored_filename,
      originalFilename: file.original_filename,
      mimeType: file.mime_type,
      size: file.file_size,
      version: file.file_version,
      folderId: file.folder_id,
      moduleCode: file.module_code,
      categoryId: entry?.category_id ?? null,
      categoryName: entry ? (categoryName.get(entry.category_id) ?? null) : null,
      departmentName: file.department_id ? (departmentName.get(file.department_id) ?? null) : null,
      academicYear: entry?.academic_year ?? file.academic_year,
      semester: entry?.semester ?? file.semester,
      uploadedByName: nameById.get(file.uploaded_by) ?? 'ไม่ทราบชื่อ',
      uploadedAt: file.uploaded_at,
      isMine: file.uploaded_by === user.id,
      isFavorite: entry ? favoriteIds.has(entry.id) : false,
      isPinned: entry?.is_pinned ?? false,
      isLocked: file.is_locked,
      previewable: isInlinePreviewable(file.mime_type),
      libraryId: entry?.id ?? null,
      libraryVersion: entry?.version ?? null,
      canManage: entry !== null && (canManageLibrary || entry.owner_id === user.id),
    });
  }
  visibleFiles.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.uploadedAt.localeCompare(a.uploadedAt));

  // โฟลเดอร์: แสดงโฟลเดอร์ที่เข้าถึงได้ และโฟลเดอร์แม่ของมัน (เพื่อให้โครงสร้างต่อเนื่อง)
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const counts = new Map<string, number>();
  for (const file of visibleFiles) {
    if (file.folderId) counts.set(file.folderId, (counts.get(file.folderId) ?? 0) + 1);
  }
  const accessible = new Set(folders.filter((folder) => canSeeFolder(user, folder)).map((f) => f.id));
  // โฟลเดอร์ที่มีไฟล์ซึ่งผู้ใช้เปิดได้ ถือว่าเข้าถึงได้
  for (const id of counts.keys()) accessible.add(id);
  const shown = new Set<string>();
  for (const id of accessible) {
    let current: FolderRow | undefined = byId.get(id);
    while (current && !shown.has(current.id)) {
      shown.add(current.id);
      current = byId.get(current.parent_folder_id ?? '');
    }
  }
  const root = folders.find((folder) => folder.folder_key === ROOT_KEY) ?? null;
  return {
    rootId: root?.id ?? null,
    folders: folders
      .filter((folder) => shown.has(folder.id) && folder.id !== root?.id)
      .map((folder) => ({
        id: folder.id,
        name: folder.folder_name,
        parentId: folder.parent_folder_id === root?.id ? null : folder.parent_folder_id,
        type: folder.folder_type,
        accessible: accessible.has(folder.id),
        fileCount: counts.get(folder.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true })),
    files: visibleFiles,
    categories: categories
      .filter((c) => c.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, name: c.name_th })),
    departments: departments
      .filter((d) => d.status === 'active')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => ({ id: d.id, name: d.name_th })),
    academicYears: Array.from(
      new Set(visibleFiles.map((file) => file.academicYear).filter((y): y is string => !!y)),
    ).sort((a, b) => b.localeCompare(a)),
    canUpload: user.permissions.can('knowledge.library', 'create'),
    storage: drive.kind === 'google-drive' ? 'google-drive' : 'local',
  };
}

export const libraryUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  title: z.string().trim().min(2, 'กรุณาระบุชื่อเอกสาร').max(200),
  description: z.string().trim().max(500),
  categoryId: z.string().min(1, 'กรุณาเลือกหมวดหมู่').max(64),
  accessLevel: z.enum(['staff', 'department', 'restricted']),
  departmentId: z.string().max(64).nullable(),
  /** ระบุเมื่ออัปโหลด “เวอร์ชันใหม่” ของเอกสารเดิม */
  libraryId: z.string().max(64).nullable(),
});

export type LibraryUploadInput = z.infer<typeof libraryUploadSchema>;

function parseUpload(input: unknown): LibraryUploadInput {
  const parsed = libraryUploadSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw validation('ข้อมูลไม่ถูกต้อง', fieldErrors);
  }
  return parsed.data;
}

/** เริ่มอัปโหลดเอกสารเข้าคลัง: ระบบเลือกโฟลเดอร์และตั้งชื่อไฟล์ให้ ผู้ใช้ไม่ต้องจัดการเอง */
export async function beginLibraryUpload(
  db: Db,
  drive: DriveAdapter,
  user: CurrentUser,
  input: unknown,
  origin: string,
): Promise<BeginUploadResult> {
  const data = parseUpload(input);
  const category = await db.repo(DocumentCategories).byId(data.categoryId);
  if (!category?.is_active) throw validation('ไม่พบหมวดหมู่ที่เลือก', { categoryId: 'ไม่พบหมวดหมู่ที่เลือก' });

  let documentId: string | null = null;
  if (data.libraryId) {
    const entry = await db.repo(LibraryFiles).byId(data.libraryId);
    if (!entry || entry.status !== 'active') throw notFound('ไม่พบเอกสารเดิม');
    if (!user.permissions.can('knowledge.library', 'manage') && entry.owner_id !== user.id) {
      throw forbidden('คุณไม่มีสิทธิ์อัปโหลดเวอร์ชันใหม่ของเอกสารนี้');
    }
    documentId = entry.document_id;
  } else {
    user.permissions.assertCan('knowledge.library', 'create');
  }
  if (data.accessLevel === 'department' && !data.departmentId) {
    throw validation('กรุณาเลือกกลุ่มสาระ', { departmentId: 'กรุณาเลือกกลุ่มสาระ' });
  }
  const term = await getCurrentTerm(db);
  if (!term) throw validation('ยังไม่ได้ตั้งค่าปีการศึกษาปัจจุบัน กรุณาติดต่อผู้ดูแลระบบ');

  const sequenceKey = `LIB-${term.year}`;
  let referenceId = '{{seq:lib:4}}';
  if (documentId) {
    // เวอร์ชันใหม่ใช้เลขอ้างอิงเดิมของเอกสาร
    const previous = await db
      .repo(FileRegistry)
      .find((file) => file.document_id === documentId && file.status !== 'void');
    const match = /^TUNS-LIB-\d{4}-(.+)-v\d{2}\./.exec(previous?.stored_filename ?? '');
    if (match?.[1]) referenceId = match[1];
  }
  return new FileRoutingService(db, drive).begin(
    user.id,
    {
      route: {
        moduleCode: 'LIB',
        documentType: 'library',
        academicYear: term.year,
        semester: term.semester,
        category: { key: category.code, name: category.folder_name },
      },
      filename: data.filename,
      size: data.size,
      title: data.title,
      documentId,
      departmentId: data.departmentId,
      accessLevel: data.accessLevel as FileAccessLevel,
      referenceId,
      sequence: referenceId.includes('{{seq:') ? { name: 'lib', key: sequenceKey } : undefined,
      // SVG ต้องผ่านการตรวจที่ Server จึงไม่รับผ่านช่องทางนี้
      policy: { allowedExtensions: ['pdf', 'docx', 'xlsx', 'pptx', 'jpg', 'jpeg', 'png'] },
    },
    origin,
  );
}

/** ยืนยันการอัปโหลดและลงทะเบียนเอกสารในคลัง — ถึงขั้นนี้จึงถือว่า “อัปโหลดสำเร็จ” */
export async function completeLibraryUpload(
  db: Db,
  drive: DriveAdapter,
  user: CurrentUser,
  fileId: string,
  input: unknown,
): Promise<{ libraryId: string; duplicateOf: string | null; version: number }> {
  const data = parseUpload(input);
  const { file, duplicateOf } = await new FileRoutingService(db, drive).complete(user.id, fileId);
  const repo = db.repo(LibraryFiles);
  const existing = await repo.find((entry) => entry.document_id === file.document_id);
  const term = await getCurrentTerm(db);
  const uow = db.unitOfWork({ action: 'library.register', actorId: user.id, idempotencyKey: fileId });
  let libraryId: string;
  if (existing) {
    libraryId = existing.id;
    uow.add(
      repo.update(existing.id, {
        current_file_id: file.id,
        current_version: file.file_version,
        title: data.title,
        description: data.description || null,
      }),
    );
  } else {
    const created = repo.insert({
      document_id: file.document_id,
      current_file_id: file.id,
      title: data.title,
      description: data.description || null,
      category_id: data.categoryId,
      academic_year: term?.year ?? null,
      semester: term?.semester ?? null,
      department_id: data.departmentId,
      access_level: data.accessLevel,
      owner_id: user.id,
      is_pinned: false,
      current_version: file.file_version,
      status: 'active',
    });
    libraryId = created.id;
    uow.add(created);
  }
  uow.audit({
    action: existing ? 'library.newVersion' : 'library.add',
    category: existing ? 'update' : 'create',
    resource: 'knowledge.library',
    entityType: 'library_file',
    entityId: libraryId,
    summary: `${existing ? 'เพิ่มเวอร์ชันใหม่ของ' : 'นำเข้า'}เอกสาร “${data.title}” (${file.stored_filename})`,
  });
  await uow.commit();
  return { libraryId, duplicateOf, version: file.file_version };
}

async function loadEntry(db: Db, user: CurrentUser, libraryId: string) {
  const entry = await db.repo(LibraryFiles).byId(libraryId);
  const file = entry ? await db.repo(FileRegistry).byId(entry.current_file_id) : null;
  // ผู้ที่เปิดไฟล์ไม่ได้ จะได้ "ไม่พบ" เหมือนรหัสที่ไม่มีอยู่จริง
  if (!entry || !file || !(await canReadFile(db, user, file))) throw notFound('ไม่พบเอกสาร');
  return { entry, file };
}

export async function setLibraryFavorite(db: Db, user: CurrentUser, libraryId: string, favorite: boolean) {
  await loadEntry(db, user, libraryId);
  const repo = db.repo(LibraryFavorites);
  const existing = await repo.find((f) => f.user_id === user.id && f.library_file_id === libraryId);
  if (existing?.is_active === favorite || (!existing && !favorite)) return;
  const uow = db.unitOfWork({ action: 'library.favorite', actorId: user.id });
  uow.add(
    existing
      ? repo.update(existing.id, { is_active: favorite })
      : repo.insert({ user_id: user.id, library_file_id: libraryId, is_active: true }),
  );
  await uow.commit();
}

/** จัดเก็บถาวร: ซ่อนจากคลัง ไฟล์ใน Google Drive ยังอยู่ครบ (ระบบไม่ลบไฟล์) */
export async function archiveLibraryFile(db: Db, user: CurrentUser, libraryId: string, expectedVersion: number) {
  const { entry } = await loadEntry(db, user, libraryId);
  if (!user.permissions.can('knowledge.library', 'archive') && entry.owner_id !== user.id) throw forbidden();
  const uow = db.unitOfWork({ action: 'library.archive', actorId: user.id });
  uow.add(
    db.repo(LibraryFiles).update(
      libraryId,
      { status: 'archived', archived_at: uow.now, archived_by: user.id },
      expectedVersion,
    ),
  );
  uow.audit({
    action: 'library.archive',
    category: 'archive',
    resource: 'knowledge.library',
    entityType: 'library_file',
    entityId: libraryId,
    summary: `จัดเก็บถาวรเอกสาร “${entry.title}”`,
  });
  await uow.commit();
}

export interface FileVersion {
  fileId: string;
  version: number;
  storedFilename: string;
  size: number;
  uploadedByName: string;
  uploadedAt: string;
  isCurrent: boolean;
}

export async function listVersions(db: Db, user: CurrentUser, fileId: string): Promise<FileVersion[]> {
  const file = await db.repo(FileRegistry).byId(fileId);
  if (!file || !(await canReadFile(db, user, file))) throw notFound('ไม่พบเอกสาร');
  const [versions, users] = await Promise.all([
    db
      .repo(FileRegistry)
      .filter((row) => row.document_id === file.document_id && row.upload_status === 'verified'),
    db.repo(Users).all(),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  return versions
    .sort((a, b) => b.file_version - a.file_version)
    .map((row) => ({
      fileId: row.id,
      version: row.file_version,
      storedFilename: row.stored_filename,
      size: row.file_size,
      uploadedByName: nameById.get(row.uploaded_by) ?? 'ไม่ทราบชื่อ',
      uploadedAt: row.uploaded_at,
      isCurrent: row.is_current,
    }));
}

export type { FileRow };
