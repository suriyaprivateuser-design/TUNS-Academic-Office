/**
 * Environment configuration (ฝั่ง Server เท่านั้น)
 *
 * - อ่านค่าแบบ lazy เพื่อไม่ให้ `next build` ล้มเมื่อยังไม่ได้ตั้งค่า
 * - ไม่มีค่าใดในไฟล์นี้ถูกส่งไป Client Bundle (มี `server-only` กำกับ)
 * - ถ้าการตั้งค่า Google ไม่ครบ ระบบจะรายงาน "ยังไม่ได้ตั้งค่า" ตามจริง ไม่แสดงสถานะเชื่อมต่อปลอม
 */
import 'server-only';
import { DATABASES, DATABASE_KEYS, type DatabaseKey } from '@/schemas/database';

export type DataDriver = 'local' | 'google';

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * ที่เก็บข้อมูลที่ใช้งาน
 *   local  = ไฟล์ในเครื่องสำหรับ Development/ทดสอบ (Demo Data เท่านั้น)
 *   google = Google Sheets + Google Drive ของโรงเรียน
 * ถ้าไม่ระบุ: production ใช้ google, นอกนั้นใช้ local
 */
export function getDataDriver(): DataDriver {
  const explicit = read('DATA_DRIVER');
  if (explicit === 'local' || explicit === 'google') return explicit;
  return isProduction() ? 'google' : 'local';
}

/** โหมดสาธิต = ใช้ที่เก็บข้อมูล local ซึ่งมีได้เฉพาะ Demo Data */
export function isDemoMode(): boolean {
  return getDataDriver() === 'local';
}

/**
 * Demo login เปิดได้เฉพาะเมื่อใช้ที่เก็บข้อมูล local เท่านั้น
 * จึงเป็นไปไม่ได้ที่บัญชีสาธิตจะเข้าถึงข้อมูลจริงของโรงเรียน ไม่ว่าจะตั้งค่า environment อย่างไร
 */
export function isDemoLoginEnabled(): boolean {
  if (!isDemoMode()) return false;
  const setting = read('DEMO_LOGIN');
  if (setting === 'enabled') return true;
  if (setting === 'disabled') return false;
  return !isProduction();
}

export function getLocalDataDir(): string | null {
  const dir = process.env.LOCAL_DATA_DIR;
  if (dir === '') return null; // ค่าว่าง = เก็บในหน่วยความจำอย่างเดียว (ใช้ในการทดสอบ)
  return dir?.trim() || '.data';
}

export function getAppUrl(): string {
  return read('APP_URL') ?? read('AUTH_URL') ?? 'http://localhost:3000';
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** โดเมน Google Workspace ของโรงเรียน (ถ้ามี) — ไม่มีการสมมติค่า */
  workspaceDomain: string | null;
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = read('GOOGLE_CLIENT_ID');
  const clientSecret = read('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    workspaceDomain: read('GOOGLE_WORKSPACE_DOMAIN')?.toLowerCase() ?? null,
  };
}

export function getBootstrapAdminEmail(): string | null {
  return read('BOOTSTRAP_ADMIN_EMAIL')?.toLowerCase() ?? null;
}

export interface GoogleWorkspaceConfig {
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  spreadsheetIds: Record<DatabaseKey, string>;
  calendarId: string | null;
  gatewayUrl: string;
  gatewaySecret: string;
}

export interface GoogleWorkspaceStatus {
  configured: boolean;
  /** ชื่อตัวแปร environment ที่ยังไม่ได้ตั้งค่า (ไม่มีค่าของตัวแปร) */
  missing: string[];
  config: GoogleWorkspaceConfig | null;
}

const REQUIRED_GOOGLE_VARS = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID',
  'APPS_SCRIPT_GATEWAY_URL',
  'APPS_SCRIPT_GATEWAY_SECRET',
] as const;

export function getGoogleWorkspaceStatus(): GoogleWorkspaceStatus {
  const missing: string[] = REQUIRED_GOOGLE_VARS.filter((name) => !read(name));
  const spreadsheetIds = {} as Record<DatabaseKey, string>;
  for (const key of DATABASE_KEYS) {
    const envVar = DATABASES[key].envVar;
    const value = read(envVar);
    if (value) spreadsheetIds[key] = value;
    else missing.push(envVar);
  }
  if (missing.length > 0) return { configured: false, missing, config: null };

  return {
    configured: true,
    missing: [],
    config: {
      serviceAccountEmail: read('GOOGLE_SERVICE_ACCOUNT_EMAIL') as string,
      // ค่าที่วางใน Vercel มักมี "\n" เป็นข้อความ ต้องแปลงกลับเป็นขึ้นบรรทัดใหม่
      serviceAccountPrivateKey: (read('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') as string).replace(
        /\\n/g,
        '\n',
      ),
      sharedDriveId: read('GOOGLE_SHARED_DRIVE_ID') ?? null,
      rootFolderId: read('GOOGLE_DRIVE_ROOT_FOLDER_ID') as string,
      spreadsheetIds,
      calendarId: read('GOOGLE_CALENDAR_ID') ?? null,
      gatewayUrl: read('APPS_SCRIPT_GATEWAY_URL') as string,
      gatewaySecret: read('APPS_SCRIPT_GATEWAY_SECRET') as string,
    },
  };
}

/** ข้อมูลประจำตัวของ Service Account + ตำแหน่ง Drive โดยไม่ต้องมี Spreadsheet ID ครบ (ใช้ใน Setup Wizard) */
export function getGoogleBootstrapConfig(): {
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  sharedDriveId: string | null;
  rootFolderId: string | null;
} | null {
  const email = read('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const key = read('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (!email || !key) return null;
  return {
    serviceAccountEmail: email,
    serviceAccountPrivateKey: key.replace(/\\n/g, '\n'),
    sharedDriveId: read('GOOGLE_SHARED_DRIVE_ID') ?? null,
    rootFolderId: read('GOOGLE_DRIVE_ROOT_FOLDER_ID') ?? null,
  };
}

export function getSheetsCacheTtlMs(): number {
  const value = Number(read('SHEETS_CACHE_TTL_MS'));
  return Number.isFinite(value) && value >= 0 ? value : 20_000;
}

export function hasAuthSecret(): boolean {
  return Boolean(read('AUTH_SECRET'));
}
