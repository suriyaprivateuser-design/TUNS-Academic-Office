/**
 * TUNS Academic Office — Write Gateway (Google Apps Script Web App)
 *
 * จุดเขียนข้อมูลเพียงจุดเดียวของ Google Sheets ทั้ง 9 ไฟล์
 *   1. ตรวจลายเซ็น HMAC-SHA256 ของคำขอ (ความลับร่วมเก็บใน Script Properties: GATEWAY_SHARED_SECRET)
 *   2. ตรวจเวลาและ nonce เพื่อกันการส่งซ้ำ (replay)
 *   3. ขอ LockService.getScriptLock() → ทุกคำสั่งเขียนทำงานทีละคำสั่ง ข้ามทุก serverless instance
 *   4. ดำเนินการด้วย gateway-core (ตรรกะชุดเดียวกับที่ทดสอบใน repository หลัก)
 *
 * ไฟล์นี้ถูก bundle เป็น apps-script/dist/Code.gs ด้วย `npm run apps-script:build`
 * ห้ามแก้ไข Code.gs โดยตรง
 */
import { executeCommit } from '../../src/lib/storage/gateway-core/execute';
import type {
  CommitFailure,
  GatewayEnv,
  GatewayErrorCode,
  WriteOperation,
} from '../../src/lib/storage/gateway-core/types';
import type { AppsScriptRuntime, DoPostEvent } from './globals';
import { ensureSchema, type SchemaSpec } from './schema';
import { SheetsTableStore } from './sheets-store';

export const PROTOCOL_VERSION = 1;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_SECONDS = 10 * 60;
const LOCK_WAIT_MS = 25 * 1000;
const SECRET_PROPERTY = 'GATEWAY_SHARED_SECRET';

interface Envelope {
  v: number;
  ts: number;
  nonce: string;
  command: string;
  spreadsheets: Record<string, string>;
  payload: unknown;
}

function failure(code: GatewayErrorCode, message: string, retryable = false): CommitFailure {
  return { ok: false, error: { code, message, retryable } };
}

export function toHex(bytes: number[]): string {
  let hex = '';
  for (const byte of bytes) {
    // Apps Script คืน byte แบบมีเครื่องหมาย (-128..127)
    hex += ((byte + 256) % 256).toString(16).padStart(2, '0');
  }
  return hex;
}

/** เปรียบเทียบแบบเวลาคงที่ กันการเดาลายเซ็นจากเวลาตอบสนอง */
export function constantTimeEquals(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

const UNAUTHORIZED = () => failure('UNAUTHORIZED', 'request was not authorised');

function authenticate(runtime: AppsScriptRuntime, event: DoPostEvent): Envelope | CommitFailure {
  const secret = runtime.PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  if (!secret) return failure('UNAUTHORIZED', 'gateway secret is not configured');

  let body: { envelope?: unknown; sig?: unknown };
  try {
    body = JSON.parse(event.postData?.contents ?? '') as typeof body;
  } catch {
    return UNAUTHORIZED();
  }
  if (typeof body.envelope !== 'string' || typeof body.sig !== 'string') return UNAUTHORIZED();

  const expected = toHex(
    runtime.Utilities.computeHmacSha256Signature(body.envelope, secret, runtime.Utilities.Charset.UTF_8),
  );
  if (!constantTimeEquals(expected, body.sig.toLowerCase())) return UNAUTHORIZED();

  let envelope: Envelope;
  try {
    envelope = JSON.parse(body.envelope) as Envelope;
  } catch {
    return UNAUTHORIZED();
  }
  if (envelope.v !== PROTOCOL_VERSION) {
    return failure('INVALID_OPERATION', `unsupported protocol version ${String(envelope.v)}`);
  }
  if (typeof envelope.ts !== 'number' || Math.abs(Date.now() - envelope.ts) > MAX_CLOCK_SKEW_MS) {
    return UNAUTHORIZED();
  }
  if (typeof envelope.nonce !== 'string' || envelope.nonce.length < 16) return UNAUTHORIZED();

  const cache = runtime.CacheService.getScriptCache();
  const nonceKey = `nonce:${envelope.nonce}`;
  if (cache.get(nonceKey)) return UNAUTHORIZED();
  cache.put(nonceKey, '1', NONCE_TTL_SECONDS);

  if (!envelope.spreadsheets || typeof envelope.spreadsheets !== 'object') {
    return failure('INVALID_OPERATION', 'spreadsheets map is required');
  }
  return envelope;
}

function withLock<T>(runtime: AppsScriptRuntime, task: () => T): T | CommitFailure {
  const lock = runtime.LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return failure('LOCK_TIMEOUT', 'another write is in progress', true);
  }
  try {
    return task();
  } finally {
    lock.releaseLock();
  }
}

function ping(runtime: AppsScriptRuntime, envelope: Envelope) {
  const spreadsheets: Record<string, boolean> = {};
  for (const db of Object.keys(envelope.spreadsheets)) {
    try {
      runtime.Sheets.Spreadsheets.get(envelope.spreadsheets[db] ?? '', { fields: 'spreadsheetId' });
      spreadsheets[db] = true;
    } catch {
      spreadsheets[db] = false;
    }
  }
  return { ok: true, version: PROTOCOL_VERSION, time: new Date().toISOString(), spreadsheets };
}

/** ประมวลผลคำขอหนึ่งรายการ คืน object ที่จะถูกส่งกลับเป็น JSON */
export function handle(runtime: AppsScriptRuntime, event: DoPostEvent): unknown {
  try {
    const envelope = authenticate(runtime, event);
    if ('ok' in envelope) return envelope;

    const store = new SheetsTableStore(runtime, envelope.spreadsheets);
    const env: GatewayEnv = {
      sha256Hex: (text) =>
        toHex(
          runtime.Utilities.computeDigest(
            runtime.Utilities.DigestAlgorithm.SHA_256,
            text,
            runtime.Utilities.Charset.UTF_8,
          ),
        ),
    };

    switch (envelope.command) {
      case 'ping':
        return ping(runtime, envelope);
      case 'commit':
        return withLock(runtime, () => executeCommit(store, env, envelope.payload as WriteOperation));
      case 'ensureSchema':
        return withLock(runtime, () => ensureSchema(runtime, store, envelope.payload as SchemaSpec));
      default:
        return failure('INVALID_OPERATION', `unknown command "${String(envelope.command)}"`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure('STORE_ERROR', message, true);
  }
}

declare const Sheets: AppsScriptRuntime['Sheets'];
declare const LockService: AppsScriptRuntime['LockService'];
declare const Utilities: AppsScriptRuntime['Utilities'];
declare const PropertiesService: AppsScriptRuntime['PropertiesService'];
declare const CacheService: AppsScriptRuntime['CacheService'];
declare const ContentService: AppsScriptRuntime['ContentService'];

function globalRuntime(): AppsScriptRuntime {
  return { Sheets, LockService, Utilities, PropertiesService, CacheService, ContentService };
}

export function doPost(event: DoPostEvent): unknown {
  const runtime = globalRuntime();
  return runtime.ContentService.createTextOutput(JSON.stringify(handle(runtime, event))).setMimeType(
    runtime.ContentService.MimeType.JSON,
  );
}

/** เปิด URL ด้วยเบราว์เซอร์เพื่อยืนยันว่า deploy สำเร็จ — ไม่เปิดเผยข้อมูลใด */
export function doGet(): unknown {
  const runtime = globalRuntime();
  return runtime.ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: 'TUNS Academic Office Write Gateway', version: PROTOCOL_VERSION }),
  ).setMimeType(runtime.ContentService.MimeType.JSON);
}
