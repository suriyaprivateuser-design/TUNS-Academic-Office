/**
 * DriveAdapter — ขอบเขตระหว่างระบบกับพื้นที่จัดเก็บไฟล์ (Google Drive)
 *
 * กติกาของทุก implementation:
 *   - อ้างอิงโฟลเดอร์/ไฟล์ด้วย ID เสมอ ไม่ค้นหาจากชื่อ (ข้อ 21.3)
 *   - การจับคู่ไฟล์/โฟลเดอร์กับ record ของระบบใช้ appProperties (ผู้ใช้มองไม่เห็นและเปลี่ยนชื่อไม่กระทบ)
 *   - ไม่มีการลบถาวร มีเพียงย้ายไปถังขยะ (trash) โดยผู้มีสิทธิ์
 *   - ไม่ตั้งค่าไฟล์เป็นสาธารณะ ผู้ใช้เข้าถึงไฟล์ผ่าน backend ที่ตรวจสิทธิ์แล้วเท่านั้น
 */

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** คีย์ของ appProperties ที่ระบบใช้ */
export const APP_PROPERTY = {
  folderKey: 'tunsFolderKey',
  fileId: 'tunsFileId',
  databaseKey: 'tunsDatabaseKey',
} as const;

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  /** ขนาดเป็นไบต์ (null สำหรับโฟลเดอร์และไฟล์ Google Docs) */
  size: number | null;
  sha256: string | null;
  appProperties: Record<string, string>;
  trashed: boolean;
}

export interface UploadSession {
  /** URL ที่ browser ส่งเนื้อไฟล์ไปด้วย PUT (ไม่มี credentials ของระบบอยู่ใน URL นอกจากสิทธิ์ของ session นี้) */
  uploadUrl: string;
  /** google = ส่งตรงไป Google Drive, app = ส่งผ่าน route ของระบบ (Development) */
  target: 'google' | 'app';
}

export interface DriveDownload {
  body: ReadableStream<Uint8Array>;
  size: number | null;
}

export interface DriveHealth {
  ok: boolean;
  message: string;
  details?: Record<string, string | number | boolean>;
}

export interface DriveAdapter {
  readonly kind: 'local' | 'google-drive';
  /** Drive Folder ID ของ Root Folder ของระบบ */
  readonly rootFolderId: string;

  createFolder(input: {
    name: string;
    parentId: string;
    appProperties?: Record<string, string>;
  }): Promise<DriveItem>;

  /** หา item ลูกของโฟลเดอร์ที่มี appProperty ตรงกัน (ไม่ค้นจากชื่อ) */
  findChildByProperty(parentId: string, key: string, value: string): Promise<DriveItem | null>;

  getItem(id: string): Promise<DriveItem | null>;

  /** อัปโหลดจากฝั่ง Server (ไฟล์ที่ระบบสร้างเอง หรือไฟล์ที่ต้องผ่านการทำให้ปลอดภัยก่อน) */
  uploadFile(input: {
    name: string;
    parentId: string;
    mimeType: string;
    data: Uint8Array;
    appProperties?: Record<string, string>;
  }): Promise<DriveItem>;

  /** เปิด upload session ให้ browser ส่งไฟล์ขนาดใหญ่โดยไม่ผ่านข้อจำกัด body ของ serverless */
  createUploadSession(input: {
    name: string;
    parentId: string;
    mimeType: string;
    size: number;
    appProperties: Record<string, string>;
    /** origin ของเว็บ (จำเป็นสำหรับ CORS ของ Google resumable upload) */
    origin: string;
  }): Promise<UploadSession>;

  /** อ่านไบต์ช่วงต้นของไฟล์เพื่อตรวจชนิดจากเนื้อไฟล์จริง */
  readHead(id: string, bytes: number): Promise<Uint8Array>;

  download(id: string): Promise<DriveDownload>;

  /** ย้ายไปถังขยะ (กู้คืนได้) — ระบบไม่ลบไฟล์ถาวรโดยอัตโนมัติ */
  trash(id: string): Promise<void>;

  /** ตรวจการเข้าถึงจริง ห้ามคืน ok โดยไม่ได้ตรวจ */
  health(): Promise<DriveHealth>;
}
