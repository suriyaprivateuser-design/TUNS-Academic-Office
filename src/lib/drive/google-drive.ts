/**
 * GoogleDriveAdapter — Google Drive API v3 (REST) ด้วยบัญชีระบบ (Service Account)
 *
 * - รองรับ Shared Drive (`supportsAllDrives`) ซึ่งเป็นรูปแบบที่แนะนำ: ไฟล์เป็นของ Shared Drive ของโรงเรียน
 *   ไม่ใช่ของ Service Account (ซึ่งไม่มีโควตาพื้นที่ของตนเองใน My Drive)
 * - ไม่มีการตั้งสิทธิ์ "Anyone with the link" และไม่มีการลบถาวร
 *
 * สถานะ: ยังไม่ได้ทดสอบกับ Google Drive จริง (ทดสอบระดับ request ด้วย fetch จำลอง)
 */
import 'server-only';
import { GoogleApiError, type GoogleApiClient } from '@/lib/google/client';
import {
  FOLDER_MIME_TYPE,
  type DriveAdapter,
  type DriveDownload,
  type DriveHealth,
  type DriveItem,
  type UploadSession,
} from './types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const ITEM_FIELDS = 'id,name,mimeType,parents,size,sha256Checksum,appProperties,trashed';

interface DriveFileResource {
  id?: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  size?: string;
  sha256Checksum?: string;
  appProperties?: Record<string, string>;
  trashed?: boolean;
}

function toItem(file: DriveFileResource): DriveItem {
  return {
    id: file.id ?? '',
    name: file.name ?? '',
    mimeType: file.mimeType ?? '',
    parentId: file.parents?.[0] ?? null,
    size: file.size !== undefined ? Number(file.size) : null,
    sha256: file.sha256Checksum ?? null,
    appProperties: file.appProperties ?? {},
    trashed: file.trashed === true,
  };
}

/** escape ค่าที่นำไปวางในคำค้นของ Drive (`q`) */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveAdapter implements DriveAdapter {
  readonly kind = 'google-drive' as const;

  constructor(
    private readonly client: GoogleApiClient,
    readonly rootFolderId: string,
    private readonly sharedDriveId: string | null,
  ) {}

  async createFolder(input: {
    name: string;
    parentId: string;
    appProperties?: Record<string, string>;
  }): Promise<DriveItem> {
    const file = await this.client.json<DriveFileResource>({
      method: 'POST',
      url: DRIVE_API,
      query: { supportsAllDrives: true, fields: ITEM_FIELDS },
      body: {
        name: input.name,
        mimeType: FOLDER_MIME_TYPE,
        parents: [input.parentId],
        appProperties: input.appProperties ?? {},
      },
    });
    return toItem(file);
  }

  async findChildByProperty(parentId: string, key: string, value: string): Promise<DriveItem | null> {
    const q = [
      `'${escapeQueryValue(parentId)}' in parents`,
      `appProperties has { key='${escapeQueryValue(key)}' and value='${escapeQueryValue(value)}' }`,
      'trashed = false',
    ].join(' and ');
    const response = await this.client.json<{ files?: DriveFileResource[] }>({
      url: DRIVE_API,
      query: {
        q,
        fields: `files(${ITEM_FIELDS})`,
        pageSize: 2,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(this.sharedDriveId ? { corpora: 'drive', driveId: this.sharedDriveId } : {}),
      },
    });
    const [first] = response.files ?? [];
    return first ? toItem(first) : null;
  }

  async getItem(id: string): Promise<DriveItem | null> {
    try {
      const file = await this.client.json<DriveFileResource>({
        url: `${DRIVE_API}/${encodeURIComponent(id)}`,
        query: { supportsAllDrives: true, fields: ITEM_FIELDS },
      });
      return toItem(file);
    } catch (error) {
      if (error instanceof GoogleApiError && error.status === 404) return null;
      throw error;
    }
  }

  async uploadFile(input: {
    name: string;
    parentId: string;
    mimeType: string;
    data: Uint8Array;
    appProperties?: Record<string, string>;
  }): Promise<DriveItem> {
    const boundary = `tuns-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: input.name,
      parents: [input.parentId],
      appProperties: input.appProperties ?? {},
    });
    const encoder = new TextEncoder();
    const head = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
    );
    const tail = encoder.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + input.data.length + tail.length);
    body.set(head, 0);
    body.set(input.data, head.length);
    body.set(tail, head.length + input.data.length);

    const file = await this.client.json<DriveFileResource>({
      method: 'POST',
      url: UPLOAD_API,
      query: { uploadType: 'multipart', supportsAllDrives: true, fields: ITEM_FIELDS },
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body,
      timeoutMs: 120_000,
    });
    return toItem(file);
  }

  async createUploadSession(input: {
    name: string;
    parentId: string;
    mimeType: string;
    size: number;
    appProperties: Record<string, string>;
    origin: string;
  }): Promise<UploadSession> {
    const response = await this.client.raw({
      method: 'POST',
      url: UPLOAD_API,
      query: { uploadType: 'resumable', supportsAllDrives: true },
      headers: {
        'x-upload-content-type': input.mimeType,
        'x-upload-content-length': String(input.size),
        // Google อนุญาต CORS ให้ session นี้เฉพาะ origin ที่ระบุตอนเปิด session
        origin: input.origin,
      },
      body: {
        name: input.name,
        parents: [input.parentId],
        appProperties: input.appProperties,
      },
    });
    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) throw new GoogleApiError(502, 'noUploadSession', 'Drive did not return a session URL');
    return { uploadUrl, target: 'google' };
  }

  async readHead(id: string, bytes: number): Promise<Uint8Array> {
    const response = await this.client.raw({
      url: `${DRIVE_API}/${encodeURIComponent(id)}`,
      query: { alt: 'media', supportsAllDrives: true },
      headers: { range: `bytes=0-${Math.max(0, bytes - 1)}` },
    });
    return new Uint8Array(await response.arrayBuffer()).subarray(0, bytes);
  }

  async download(id: string): Promise<DriveDownload> {
    const response = await this.client.raw({
      url: `${DRIVE_API}/${encodeURIComponent(id)}`,
      query: { alt: 'media', supportsAllDrives: true },
      timeoutMs: 120_000,
    });
    if (!response.body) throw new GoogleApiError(502, 'emptyBody', 'Drive returned no content');
    const length = Number(response.headers.get('content-length'));
    return { body: response.body, size: Number.isFinite(length) && length > 0 ? length : null };
  }

  async trash(id: string): Promise<void> {
    await this.client.json({
      method: 'PATCH',
      url: `${DRIVE_API}/${encodeURIComponent(id)}`,
      query: { supportsAllDrives: true, fields: 'id' },
      body: { trashed: true },
      idempotent: true,
    });
  }

  async health(): Promise<DriveHealth> {
    try {
      const root = await this.client.json<{
        id?: string;
        name?: string;
        driveId?: string;
        capabilities?: { canAddChildren?: boolean; canListChildren?: boolean };
      }>({
        url: `${DRIVE_API}/${encodeURIComponent(this.rootFolderId)}`,
        query: {
          supportsAllDrives: true,
          fields: 'id,name,driveId,capabilities(canAddChildren,canListChildren)',
        },
      });
      const canWrite = root.capabilities?.canAddChildren === true;
      return {
        ok: canWrite,
        message: canWrite
          ? 'บัญชีระบบเข้าถึง Root Folder และสร้างไฟล์ได้'
          : 'บัญชีระบบเปิด Root Folder ได้แต่ไม่มีสิทธิ์สร้างไฟล์ กรุณาเพิ่มเป็น Content manager ของ Shared Drive',
        details: {
          sharedDrive: Boolean(root.driveId),
          rootName: root.name ?? '',
        },
      };
    } catch (error) {
      const reason =
        error instanceof GoogleApiError ? `${error.status} ${error.reason}` : 'เชื่อมต่อไม่ได้';
      return { ok: false, message: `เข้าถึง Root Folder ของ Google Drive ไม่ได้ (${reason})` };
    }
  }
}
