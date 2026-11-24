/**
 * ตัวเรียก Write Gateway บน Google Apps Script
 *
 * ความปลอดภัยของ endpoint (ข้อ 36):
 *   - Web App ของ Apps Script ต้องเปิดให้เรียกได้โดยไม่ล็อกอิน แต่ทุกคำขอต้องมีลายเซ็น HMAC-SHA256
 *     ที่สร้างจากความลับร่วม (APPS_SCRIPT_GATEWAY_SECRET) ซึ่งอยู่ฝั่ง Server เท่านั้น
 *   - ลายเซ็นครอบคลุมเวลา (ts) และ nonce → คำขอที่ถูกดักไปส่งซ้ำจะถูกปฏิเสธ
 *   - Spreadsheet ID ทั้งหมดส่งไปกับคำขอที่ลงลายเซ็นแล้ว จึงตั้งค่าที่เดียว (environment ของ backend)
 */
import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { withRetry } from '@/lib/google/retry';
import type { CommitResult, WriteOperation } from './gateway-core';
import type { EnsureSchemaResult } from './types';

export const GATEWAY_PROTOCOL_VERSION = 1;

export type GatewayCommand = 'ping' | 'commit' | 'ensureSchema';

export interface GatewayEnvelope {
  v: number;
  ts: number;
  nonce: string;
  command: GatewayCommand;
  /** DatabaseKey → Spreadsheet ID */
  spreadsheets: Record<string, string>;
  payload: unknown;
}

export interface GatewayPingResult {
  ok: true;
  version: number;
  time: string;
  /** DatabaseKey → เปิดไฟล์ได้หรือไม่ (ตรวจจริงในฝั่ง Apps Script) */
  spreadsheets: Record<string, boolean>;
}

export interface SchemaSpec {
  /** DatabaseKey → Worksheet → หัวคอลัมน์ */
  databases: Record<string, Record<string, string[]>>;
}

export function signEnvelope(envelope: string, secret: string): string {
  return createHmac('sha256', secret).update(envelope, 'utf8').digest('hex');
}

export interface AppsScriptGatewayOptions {
  url: string;
  secret: string;
  spreadsheets: Record<string, string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

class GatewayTransportError extends Error {}

export class AppsScriptGatewayClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AppsScriptGatewayOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async call<T>(command: GatewayCommand, payload: unknown): Promise<T> {
    const envelope: GatewayEnvelope = {
      v: GATEWAY_PROTOCOL_VERSION,
      ts: Date.now(),
      nonce: randomUUID(),
      command,
      spreadsheets: this.options.spreadsheets,
      payload,
    };
    const body = JSON.stringify(envelope);
    let response: Response;
    try {
      response = await this.fetchImpl(this.options.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ envelope: body, sig: signEnvelope(body, this.options.secret) }),
        // Apps Script ตอบ 302 ไปยัง script.googleusercontent.com ก่อนคืนผลลัพธ์
        redirect: 'follow',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 45_000),
      });
    } catch (error) {
      throw new GatewayTransportError(error instanceof Error ? error.message : String(error));
    }
    const text = await response.text();
    if (!response.ok) {
      throw new GatewayTransportError(`gateway responded with HTTP ${response.status}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Apps Script คืนหน้า HTML เมื่อ deployment ผิดพลาดหรือยังไม่ได้อนุญาตสิทธิ์
      throw new GatewayTransportError('gateway did not return JSON');
    }
  }

  /**
   * ส่งคำสั่งเขียน — ลองใหม่อัตโนมัติด้วย "คำสั่งเดิมทุกประการ" เมื่อ gateway บอกว่าลองใหม่ได้
   * (ปลอดภัยเพราะ Idempotency Key เดิมจะไม่ถูกเขียนซ้ำ)
   */
  async commit(operation: WriteOperation): Promise<CommitResult> {
    return withRetry(
      async () => {
        const result = await this.call<CommitResult>('commit', operation);
        if (!result.ok && result.error.retryable) throw new RetryableGatewayResult(result);
        return result;
      },
      {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 6000,
        sleep: this.options.sleep,
        shouldRetry: (error) =>
          error instanceof RetryableGatewayResult || error instanceof GatewayTransportError,
      },
    ).catch((error: unknown) => {
      if (error instanceof RetryableGatewayResult) return error.result;
      if (error instanceof GatewayTransportError) {
        throw new AppError(
          'INTEGRATION',
          'ติดต่อ Write Gateway (Google Apps Script) ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
          { cause: error.message },
        );
      }
      throw error;
    });
  }

  async ping(): Promise<GatewayPingResult> {
    const result = await this.call<GatewayPingResult | { ok: false; error: { message: string } }>(
      'ping',
      {},
    );
    if (!result.ok) throw new AppError('INTEGRATION', undefined, { cause: result.error.message });
    return result;
  }

  async ensureSchema(spec: SchemaSpec): Promise<EnsureSchemaResult> {
    const result = await this.call<
      ({ ok: true } & EnsureSchemaResult) | { ok: false; error: { message: string } }
    >('ensureSchema', spec);
    if (!result.ok) throw new AppError('INTEGRATION', undefined, { cause: result.error.message });
    return {
      createdTables: result.createdTables,
      addedColumns: result.addedColumns,
      checkedTables: result.checkedTables,
    };
  }
}

class RetryableGatewayResult extends Error {
  constructor(readonly result: CommitResult) {
    super('retryable gateway result');
  }
}
