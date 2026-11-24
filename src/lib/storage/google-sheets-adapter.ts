/**
 * GoogleSheetsAdapter — StorageAdapter สำหรับ Production
 *
 *   read  : Sheets REST API (`values:batchGet`) + cache ฝั่ง server
 *           - คำขออ่านหลายตารางของไฟล์เดียวกันในจังหวะเดียวกันถูกรวมเป็นคำขอเดียว (ลดโควตา)
 *           - cache เก็บ "ทั้งตาราง" ซึ่งไม่ขึ้นกับผู้ใช้ การกรองสิทธิ์ทำหลังอ่านทุกครั้ง
 *             จึงไม่มีข้อมูลรั่วข้ามสิทธิ์ผ่าน cache
 *   write : Write Gateway บน Apps Script เท่านั้น ไม่มีเส้นทางเขียนตรงไปที่ Sheets จาก backend
 *
 * สถานะ: ยังไม่ได้ทดสอบกับ Google Workspace จริง (ทดสอบระดับ request ด้วย fetch จำลอง)
 */
import 'server-only';
import { AppError } from '@/lib/errors';
import { GoogleApiError } from '@/lib/google/client';
import type { GoogleSheetsService } from '@/lib/google/sheets';
import { ALL_DATABASES, type DatabaseKey } from '@/schemas/database';
import type { AppsScriptGatewayClient, SchemaSpec } from './apps-script-client';
import { gatewayFailureToError } from './errors';
import { LEDGER_HEADER, LEDGER_SHEET, dbOf, sheetOf, type CommitSuccess } from './gateway-core';
import type { WriteOperation } from './gateway-core';
import { headerOf } from './serialization';
import type {
  EnsureSchemaResult,
  ReadOptions,
  StorageAdapter,
  StorageHealth,
  TableSnapshot,
} from './types';

interface PendingRead {
  resolve: (snapshot: TableSnapshot) => void;
  reject: (error: unknown) => void;
}

export interface GoogleSheetsAdapterOptions {
  spreadsheetIds: Record<DatabaseKey, string>;
  sheets: GoogleSheetsService;
  gateway: AppsScriptGatewayClient;
  cacheTtlMs: number;
  now?: () => number;
}

export function buildSchemaSpec(): SchemaSpec {
  const databases: SchemaSpec['databases'] = {};
  for (const database of ALL_DATABASES) {
    const sheets: Record<string, string[]> = {};
    for (const table of database.tables) sheets[table.name] = headerOf(table);
    sheets[LEDGER_SHEET] = [...LEDGER_HEADER];
    databases[database.key] = sheets;
  }
  return { databases };
}

function toIntegrationError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof GoogleApiError) {
    const message =
      error.status === 429 || error.reason.includes('RateLimit')
        ? 'Google Sheets มีการใช้งานหนาแน่น กรุณารอสักครู่แล้วลองใหม่'
        : error.status === 403 || error.status === 404
          ? 'บัญชีระบบเข้าถึงฐานข้อมูล Google Sheets ไม่ได้ กรุณาให้ผู้ดูแลตรวจสิทธิ์ของ Service Account'
          : 'อ่านข้อมูลจาก Google Sheets ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    return new AppError('INTEGRATION', message, { cause: `${error.status} ${error.reason}` });
  }
  return new AppError('INTEGRATION', undefined, { cause: error });
}

export class GoogleSheetsAdapter implements StorageAdapter {
  readonly kind = 'google-sheets' as const;
  private readonly cache = new Map<string, TableSnapshot>();
  private readonly queue = new Map<string, Map<string, PendingRead[]>>();
  private flushScheduled = false;
  private readonly now: () => number;

  constructor(private readonly options: GoogleSheetsAdapterOptions) {
    this.now = options.now ?? Date.now;
  }

  async readTable(table: string, options: ReadOptions = {}): Promise<TableSnapshot> {
    const cached = this.cache.get(table);
    const now = this.now();
    if (
      cached &&
      now - cached.fetchedAt <= this.options.cacheTtlMs &&
      (options.minFreshAt === undefined || cached.fetchedAt >= options.minFreshAt)
    ) {
      return cached;
    }
    return new Promise<TableSnapshot>((resolve, reject) => {
      const db = dbOf(table);
      const perDb = this.queue.get(db) ?? new Map<string, PendingRead[]>();
      const waiters = perDb.get(table) ?? [];
      waiters.push({ resolve, reject });
      perDb.set(table, waiters);
      this.queue.set(db, perDb);
      if (!this.flushScheduled) {
        this.flushScheduled = true;
        // รวมคำขอที่เกิดในจังหวะเดียวกัน (เช่น Promise.all ของหลาย repository) เป็น batchGet เดียวต่อไฟล์
        queueMicrotask(() => void this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    this.flushScheduled = false;
    const batches = Array.from(this.queue.entries());
    this.queue.clear();
    await Promise.all(
      batches.map(async ([db, perDb]) => {
        const tables = Array.from(perDb.keys());
        try {
          const spreadsheetId = this.options.spreadsheetIds[db as DatabaseKey];
          if (!spreadsheetId) throw new AppError('SETUP_REQUIRED');
          const fetchedAt = this.now();
          const values = await this.options.sheets.batchGetSheets(spreadsheetId, tables.map(sheetOf));
          tables.forEach((table, index) => {
            const [header = [], ...rows] = values[index] ?? [];
            const snapshot: TableSnapshot = { table, header, rows, fetchedAt };
            this.cache.set(table, snapshot);
            for (const waiter of perDb.get(table) ?? []) waiter.resolve(snapshot);
          });
        } catch (error) {
          const mapped = toIntegrationError(error);
          for (const table of tables) {
            for (const waiter of perDb.get(table) ?? []) waiter.reject(mapped);
          }
        }
      }),
    );
  }

  async commit(operation: WriteOperation): Promise<CommitSuccess> {
    const result = await this.options.gateway.commit(operation);
    // ล้าง cache ของตารางที่เกี่ยวข้องเสมอ แม้ล้มเหลว (อาจเขียนไปบางไฟล์แล้ว)
    for (const mutation of operation.mutations) this.cache.delete(mutation.table);
    if (!result.ok) throw gatewayFailureToError(result.error);
    for (const table of result.touched) this.cache.delete(table);
    return result;
  }

  async ensureSchema(): Promise<EnsureSchemaResult> {
    const result = await this.options.gateway.ensureSchema(buildSchemaSpec());
    this.cache.clear();
    return result;
  }

  async health(): Promise<StorageHealth> {
    const startedAt = this.now();
    try {
      const ping = await this.options.gateway.ping();
      const unreachable = Object.entries(ping.spreadsheets)
        .filter(([, reachable]) => !reachable)
        .map(([db]) => db);
      // อ่านจริงหนึ่งตารางด้วยบัญชี Service Account เพื่อยืนยันสิทธิ์ฝั่งอ่าน
      await this.options.sheets.batchGetSheets(this.options.spreadsheetIds.system, ['SystemSettings']);
      return {
        ok: unreachable.length === 0,
        kind: this.kind,
        message:
          unreachable.length === 0
            ? 'อ่านผ่าน Sheets API และเขียนผ่าน Write Gateway ได้'
            : `Write Gateway เปิด Spreadsheet บางไฟล์ไม่ได้: ${unreachable.join(', ')}`,
        latencyMs: this.now() - startedAt,
        details: { gatewayVersion: ping.version },
      };
    } catch (error) {
      return {
        ok: false,
        kind: this.kind,
        message: toIntegrationError(error).message,
        latencyMs: this.now() - startedAt,
      };
    }
  }
}
