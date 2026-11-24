/**
 * จุดสร้าง DriveAdapter ตามการตั้งค่า (คู่กับ src/lib/storage/index.ts)
 */
import 'server-only';
import { getDataDriver, getGoogleWorkspaceStatus, getLocalDataDir } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { getGoogleApiClient } from '@/lib/storage';
import { GoogleDriveAdapter } from './google-drive';
import { LocalDriveAdapter } from './local-drive';
import type { DriveAdapter } from './types';

interface DriveGlobals {
  __tunsDrive?: { key: string; adapter: DriveAdapter };
}

const globals = globalThis as typeof globalThis & DriveGlobals;

export function getDrive(): DriveAdapter {
  if (getDataDriver() === 'local') {
    const dataDir = getLocalDataDir();
    const key = `local:${dataDir ?? ':memory:'}`;
    if (globals.__tunsDrive?.key !== key) {
      globals.__tunsDrive = { key, adapter: new LocalDriveAdapter(dataDir) };
    }
    return globals.__tunsDrive.adapter;
  }

  const status = getGoogleWorkspaceStatus();
  if (!status.config) {
    throw new AppError(
      'SETUP_REQUIRED',
      'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive กรุณาให้ผู้ดูแลระบบตั้งค่าตามคู่มือ',
      { details: { missing: status.missing } },
    );
  }
  const key = `google:${status.config.rootFolderId}`;
  if (globals.__tunsDrive?.key !== key) {
    globals.__tunsDrive = {
      key,
      adapter: new GoogleDriveAdapter(
        getGoogleApiClient(),
        status.config.rootFolderId,
        status.config.sharedDriveId,
      ),
    };
  }
  return globals.__tunsDrive.adapter;
}

export function resetDriveForTests(): void {
  globals.__tunsDrive = undefined;
}

export type { DriveAdapter, DriveItem } from './types';
