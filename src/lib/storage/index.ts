/**
 * จุดสร้าง StorageAdapter ตามการตั้งค่า (DATA_DRIVER)
 * เก็บ instance ไว้ที่ globalThis เพื่อให้ทุก bundle ของ Next.js ใน process เดียวกันใช้ชุดเดียวกัน
 */
import 'server-only';
import {
  getDataDriver,
  getGoogleWorkspaceStatus,
  getLocalDataDir,
  getSheetsCacheTtlMs,
} from '@/lib/env';
import { AppError } from '@/lib/errors';
import { GoogleApiClient, createServiceAccountTokenProvider } from '@/lib/google/client';
import { GoogleSheetsService } from '@/lib/google/sheets';
import { AppsScriptGatewayClient } from './apps-script-client';
import { GoogleSheetsAdapter } from './google-sheets-adapter';
import { LocalStorageAdapter } from './local-adapter';
import type { StorageAdapter } from './types';

interface StorageGlobals {
  __tunsStorage?: { key: string; adapter: StorageAdapter };
  __tunsGoogleClient?: { key: string; client: GoogleApiClient };
}

const globals = globalThis as typeof globalThis & StorageGlobals;

/** Google API client ของบัญชีระบบ (Service Account) — ใช้ร่วมกันทั้ง Sheets และ Drive */
export function getGoogleApiClient(): GoogleApiClient {
  const status = getGoogleWorkspaceStatus();
  if (!status.config) {
    throw new AppError(
      'SETUP_REQUIRED',
      'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Workspace กรุณาให้ผู้ดูแลระบบตั้งค่าตามคู่มือ',
      { details: { missing: status.missing } },
    );
  }
  const key = status.config.serviceAccountEmail;
  if (globals.__tunsGoogleClient?.key !== key) {
    globals.__tunsGoogleClient = {
      key,
      client: new GoogleApiClient(
        createServiceAccountTokenProvider({
          email: status.config.serviceAccountEmail,
          privateKey: status.config.serviceAccountPrivateKey,
        }),
      ),
    };
  }
  return globals.__tunsGoogleClient.client;
}

export function getStorage(): StorageAdapter {
  const driver = getDataDriver();

  if (driver === 'local') {
    const dataDir = getLocalDataDir();
    const key = `local:${dataDir ?? ':memory:'}`;
    if (globals.__tunsStorage?.key !== key) {
      globals.__tunsStorage = { key, adapter: new LocalStorageAdapter(dataDir) };
    }
    return globals.__tunsStorage.adapter;
  }

  const status = getGoogleWorkspaceStatus();
  if (!status.config) {
    throw new AppError(
      'SETUP_REQUIRED',
      'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Workspace กรุณาให้ผู้ดูแลระบบตั้งค่าตามคู่มือ',
      { details: { missing: status.missing } },
    );
  }
  const key = `google:${status.config.spreadsheetIds.system}`;
  if (globals.__tunsStorage?.key !== key) {
    globals.__tunsStorage = {
      key,
      adapter: new GoogleSheetsAdapter({
        spreadsheetIds: status.config.spreadsheetIds,
        sheets: new GoogleSheetsService(getGoogleApiClient()),
        gateway: new AppsScriptGatewayClient({
          url: status.config.gatewayUrl,
          secret: status.config.gatewaySecret,
          spreadsheets: status.config.spreadsheetIds,
        }),
        cacheTtlMs: getSheetsCacheTtlMs(),
      }),
    };
  }
  return globals.__tunsStorage.adapter;
}

/** ใช้ในการทดสอบ: ล้าง instance เพื่อเริ่มฐานข้อมูลใหม่ */
export function resetStorageForTests(): void {
  globals.__tunsStorage = undefined;
}

export type { StorageAdapter, TableSnapshot } from './types';
