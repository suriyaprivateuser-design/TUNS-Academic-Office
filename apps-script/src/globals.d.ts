/**
 * ชนิดขั้นต่ำของ Apps Script runtime ที่ Write Gateway ใช้
 * (ไม่ติดตั้ง @types/google-apps-script เพื่อไม่ให้ชนิด global ปนกับโค้ดฝั่ง Next.js)
 */
export interface ValueRange {
  range?: string;
  values?: unknown[][];
}

export interface SheetsAdvancedService {
  Spreadsheets: {
    get(
      spreadsheetId: string,
      optionalArgs?: { fields?: string },
    ): {
      spreadsheetId?: string;
      sheets?: {
        properties?: {
          sheetId?: number;
          title?: string;
          gridProperties?: { rowCount?: number; columnCount?: number };
        };
      }[];
    };
    batchUpdate(
      resource: { requests: Record<string, unknown>[] },
      spreadsheetId: string,
    ): { replies?: { addSheet?: { properties?: { sheetId?: number; title?: string } } }[] };
    Values: {
      batchGet(
        spreadsheetId: string,
        optionalArgs: {
          ranges: string[];
          valueRenderOption?: string;
          majorDimension?: 'ROWS' | 'COLUMNS';
        },
      ): { valueRanges?: ValueRange[] };
    };
  };
}

export interface AppsScriptLock {
  tryLock(timeoutInMillis: number): boolean;
  releaseLock(): void;
}

export interface AppsScriptRuntime {
  Sheets: SheetsAdvancedService;
  LockService: { getScriptLock(): AppsScriptLock };
  Utilities: {
    Charset: { UTF_8: unknown };
    DigestAlgorithm: { SHA_256: unknown };
    computeHmacSha256Signature(value: string, key: string, charset: unknown): number[];
    computeDigest(algorithm: unknown, value: string, charset: unknown): number[];
  };
  PropertiesService: {
    getScriptProperties(): { getProperty(key: string): string | null };
  };
  CacheService: {
    getScriptCache(): {
      get(key: string): string | null;
      put(key: string, value: string, expirationInSeconds: number): void;
      remove(key: string): void;
    };
  };
  ContentService: {
    MimeType: { JSON: unknown };
    createTextOutput(content: string): { setMimeType(mimeType: unknown): unknown };
  };
}

export interface DoPostEvent {
  postData?: { contents?: string };
}
