/**
 * GoogleApiClient — ตัวเรียก Google REST API กลาง (Sheets / Drive / Docs / Calendar)
 *
 * เรียก REST โดยตรงด้วย fetch แทนแพ็กเกจ `googleapis` เพื่อให้ bundle เล็ก (สำคัญกับ serverless)
 * และควบคุม retry/backoff ได้ชัดเจน การขอ access token ใช้ `google-auth-library` (Service Account)
 *
 * Credentials อยู่ฝั่ง Server เท่านั้น ไม่มีส่วนใดของไฟล์นี้ถูกส่งไป browser
 */
import 'server-only';
import { JWT } from 'google-auth-library';
import { withRetry, type RetryOptions } from './retry';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/calendar',
] as const;

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    /** reason จาก Google เช่น rateLimitExceeded, notFound, storageQuotaExceeded */
    readonly reason: string,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export function createServiceAccountTokenProvider(credentials: {
  email: string;
  privateKey: string;
  scopes?: readonly string[];
}): AccessTokenProvider {
  const jwt = new JWT({
    email: credentials.email,
    key: credentials.privateKey,
    scopes: [...(credentials.scopes ?? GOOGLE_SCOPES)],
  });
  return {
    async getAccessToken() {
      const { token } = await jwt.getAccessToken();
      if (!token) throw new GoogleApiError(401, 'noAccessToken', 'ไม่สามารถขอ access token ได้');
      return token;
    },
  };
}

export interface GoogleRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  query?: Record<string, string | number | boolean | readonly string[] | undefined>;
  /** object = ส่งเป็น JSON, อื่น ๆ ส่งตามที่ให้มา */
  body?: unknown;
  headers?: Record<string, string>;
  /** คำขอที่ทำซ้ำได้อย่างปลอดภัยเท่านั้นจึง retry (ค่าเริ่มต้น: GET = true, อื่น ๆ = false) */
  idempotent?: boolean;
  timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'backendError',
  'internalError',
]);

function buildUrl(url: string, query: GoogleRequest['query']): string {
  if (!query) return url;
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) target.searchParams.append(key, item);
    else target.searchParams.set(key, String(value));
  }
  return target.toString();
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function toError(response: Response): Promise<GoogleApiError> {
  let reason = 'unknown';
  let message = `Google API responded with HTTP ${response.status}`;
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; status?: string; errors?: { reason?: string }[] };
    };
    reason = payload.error?.errors?.[0]?.reason ?? payload.error?.status ?? reason;
    message = payload.error?.message ?? message;
  } catch {
    // เนื้อหาไม่ใช่ JSON — ใช้ข้อความตั้งต้น
  }
  return new GoogleApiError(
    response.status,
    reason,
    message,
    parseRetryAfter(response.headers.get('retry-after')),
  );
}

export function isRetryableGoogleError(error: unknown): boolean | { retryAfterMs: number } {
  if (error instanceof GoogleApiError) {
    const retryable =
      RETRYABLE_STATUS.has(error.status) ||
      (error.status === 403 && RETRYABLE_REASONS.has(error.reason));
    if (!retryable) return false;
    return error.retryAfterMs !== null ? { retryAfterMs: error.retryAfterMs } : true;
  }
  // ข้อผิดพลาดระดับเครือข่าย (fetch โยน TypeError) หรือ timeout
  return error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
}

export interface GoogleApiClientOptions {
  fetch?: typeof fetch;
  retry?: Partial<Omit<RetryOptions, 'shouldRetry'>>;
}

export class GoogleApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly tokens: AccessTokenProvider,
    private readonly options: GoogleApiClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** ส่งคำขอและคืน Response ดิบ (ใช้กับการดาวน์โหลดไฟล์แบบ stream) */
  async raw(request: GoogleRequest): Promise<Response> {
    const method = request.method ?? 'GET';
    const idempotent = request.idempotent ?? method === 'GET';
    const url = buildUrl(request.url, request.query);

    const send = async (): Promise<Response> => {
      const token = await this.tokens.getAccessToken();
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        ...request.headers,
      };
      let body: BodyInit | undefined;
      if (request.body !== undefined) {
        const isPlainObject =
          typeof request.body === 'object' &&
          request.body !== null &&
          !(request.body instanceof Uint8Array) &&
          !(request.body instanceof ArrayBuffer) &&
          !(request.body instanceof ReadableStream) &&
          !(request.body instanceof Blob);
        if (isPlainObject) {
          headers['content-type'] ??= 'application/json; charset=utf-8';
          body = JSON.stringify(request.body);
        } else {
          body = request.body as BodyInit;
        }
      }
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
        // จำเป็นเมื่อ body เป็น stream
        ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
      } as RequestInit);
      if (!response.ok) throw await toError(response);
      return response;
    };

    if (!idempotent) return send();
    return withRetry(send, { ...this.options.retry, shouldRetry: isRetryableGoogleError });
  }

  async json<T>(request: GoogleRequest): Promise<T> {
    const response = await this.raw(request);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
