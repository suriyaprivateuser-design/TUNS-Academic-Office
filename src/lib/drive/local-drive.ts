/**
 * LocalDriveAdapter — พื้นที่จัดเก็บไฟล์สำหรับ Development/การทดสอบ
 *
 * เลียนแบบ Google Drive: โครงสร้าง item + parent + appProperties และ ID ที่ไม่ขึ้นกับชื่อ
 * ไฟล์เก็บใน LOCAL_DATA_DIR/drive (หรือในหน่วยความจำเมื่อไม่ได้กำหนดโฟลเดอร์)
 * ใช้กับ Demo Data เท่านั้น ไม่ใช่ที่เก็บไฟล์ถาวรของระบบจริง
 */
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  FOLDER_MIME_TYPE,
  type DriveAdapter,
  type DriveDownload,
  type DriveHealth,
  type DriveItem,
  type UploadSession,
} from './types';

const INDEX_FILE = 'index.json';
export const LOCAL_ROOT_ID = 'local-root';

interface PendingUpload {
  name: string;
  parentId: string;
  mimeType: string;
  size: number;
  appProperties: Record<string, string>;
}

export class LocalDriveAdapter implements DriveAdapter {
  readonly kind = 'local' as const;
  readonly rootFolderId = LOCAL_ROOT_ID;
  private readonly items = new Map<string, DriveItem>();
  private readonly memoryFiles = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, PendingUpload>();
  private readonly directory: string | null;

  constructor(dataDir: string | null) {
    this.directory = dataDir ? path.resolve(dataDir, 'drive') : null;
    if (this.directory && existsSync(path.join(this.directory, INDEX_FILE))) {
      const saved = JSON.parse(
        readFileSync(path.join(this.directory, INDEX_FILE), 'utf8'),
      ) as DriveItem[];
      for (const item of saved) this.items.set(item.id, item);
    }
    if (!this.items.has(LOCAL_ROOT_ID)) {
      this.items.set(LOCAL_ROOT_ID, {
        id: LOCAL_ROOT_ID,
        name: 'TUNS Academic Office (local development)',
        mimeType: FOLDER_MIME_TYPE,
        parentId: null,
        size: null,
        sha256: null,
        appProperties: {},
        trashed: false,
      });
      this.persist();
    }
  }

  private persist(): void {
    if (!this.directory) return;
    mkdirSync(this.directory, { recursive: true });
    const target = path.join(this.directory, INDEX_FILE);
    writeFileSync(`${target}.tmp`, JSON.stringify(Array.from(this.items.values())));
    renameSync(`${target}.tmp`, target);
  }

  private filePath(id: string): string {
    // id สร้างโดยระบบ (UUID) เท่านั้น — ตรวจรูปแบบซ้ำเพื่อกัน path traversal
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('invalid local drive id');
    return path.join(this.directory ?? '', `${id}.bin`);
  }

  private writeBytes(id: string, data: Uint8Array): void {
    if (!this.directory) {
      this.memoryFiles.set(id, data);
      return;
    }
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(this.filePath(id), data);
  }

  private readBytes(id: string): Uint8Array {
    if (!this.directory) {
      const data = this.memoryFiles.get(id);
      if (!data) throw new Error('local drive file not found');
      return data;
    }
    return new Uint8Array(readFileSync(this.filePath(id)));
  }

  private requireFolder(id: string): DriveItem {
    const folder = this.items.get(id);
    if (!folder || folder.trashed || folder.mimeType !== FOLDER_MIME_TYPE) {
      throw new Error(`local drive folder not found: ${id}`);
    }
    return folder;
  }

  async createFolder(input: {
    name: string;
    parentId: string;
    appProperties?: Record<string, string>;
  }): Promise<DriveItem> {
    this.requireFolder(input.parentId);
    const item: DriveItem = {
      id: `local-${randomUUID()}`,
      name: input.name,
      mimeType: FOLDER_MIME_TYPE,
      parentId: input.parentId,
      size: null,
      sha256: null,
      appProperties: { ...input.appProperties },
      trashed: false,
    };
    this.items.set(item.id, item);
    this.persist();
    return { ...item };
  }

  async findChildByProperty(parentId: string, key: string, value: string): Promise<DriveItem | null> {
    for (const item of this.items.values()) {
      if (item.parentId === parentId && !item.trashed && item.appProperties[key] === value) {
        return { ...item };
      }
    }
    return null;
  }

  async getItem(id: string): Promise<DriveItem | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  private store(meta: PendingUpload, data: Uint8Array): DriveItem {
    this.requireFolder(meta.parentId);
    const item: DriveItem = {
      id: `local-${randomUUID()}`,
      name: meta.name,
      mimeType: meta.mimeType,
      parentId: meta.parentId,
      size: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
      appProperties: { ...meta.appProperties },
      trashed: false,
    };
    this.writeBytes(item.id, data);
    this.items.set(item.id, item);
    this.persist();
    return { ...item };
  }

  async uploadFile(input: {
    name: string;
    parentId: string;
    mimeType: string;
    data: Uint8Array;
    appProperties?: Record<string, string>;
  }): Promise<DriveItem> {
    return this.store(
      { ...input, size: input.data.byteLength, appProperties: input.appProperties ?? {} },
      input.data,
    );
  }

  async createUploadSession(input: {
    name: string;
    parentId: string;
    mimeType: string;
    size: number;
    appProperties: Record<string, string>;
    origin: string;
  }): Promise<UploadSession> {
    this.requireFolder(input.parentId);
    const sessionId = randomUUID();
    this.pending.set(sessionId, {
      name: input.name,
      parentId: input.parentId,
      mimeType: input.mimeType,
      size: input.size,
      appProperties: input.appProperties,
    });
    return { uploadUrl: `/api/files/upload-sessions/${sessionId}`, target: 'app' };
  }

  /** รับเนื้อไฟล์ของ upload session (เรียกจาก route ของระบบใน Development เท่านั้น) */
  async receiveSessionUpload(sessionId: string, data: Uint8Array): Promise<DriveItem> {
    const meta = this.pending.get(sessionId);
    if (!meta) throw new Error('upload session not found or already used');
    if (data.byteLength !== meta.size) {
      throw new Error(`upload size mismatch: expected ${meta.size}, received ${data.byteLength}`);
    }
    this.pending.delete(sessionId);
    return this.store(meta, data);
  }

  async readHead(id: string, bytes: number): Promise<Uint8Array> {
    return this.readBytes(id).subarray(0, bytes);
  }

  async download(id: string): Promise<DriveDownload> {
    const item = this.items.get(id);
    if (!item || item.trashed) throw new Error('local drive file not found');
    const data = this.readBytes(id);
    return {
      size: data.byteLength,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }),
    };
  }

  async trash(id: string): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      item.trashed = true;
      this.persist();
    }
  }

  async health(): Promise<DriveHealth> {
    return {
      ok: true,
      message: this.directory
        ? 'พื้นที่จัดเก็บไฟล์สำหรับ Development (โฟลเดอร์ในเครื่อง) — ไม่ใช่ Google Drive'
        : 'พื้นที่จัดเก็บไฟล์ในหน่วยความจำสำหรับการทดสอบ — ไม่ใช่ Google Drive',
      details: { items: this.items.size },
    };
  }

  /** ใช้ในการทดสอบ/Reconciliation: รายการทั้งหมดที่ยังไม่ถูกทิ้ง */
  listAll(): DriveItem[] {
    return Array.from(this.items.values())
      .filter((item) => !item.trashed)
      .map((item) => ({ ...item }));
  }
}
