/**
 * GoogleSheetsService — การ "อ่าน" Google Sheets ผ่าน REST API
 * (การเขียนทั้งหมดไปที่ Write Gateway — ดู src/lib/storage/apps-script-client.ts)
 */
import 'server-only';
import type { GoogleApiClient } from './client';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** ใส่เครื่องหมายคำพูดรอบชื่อ Worksheet ตามไวยากรณ์ A1 */
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/** ค่าจาก API (UNFORMATTED_VALUE) อาจเป็นตัวเลขหรือ boolean ถ้ามีคนแก้ชีตด้วยมือ — แปลงเป็นข้อความเสมอ */
export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export interface SheetProperties {
  sheetId: number;
  title: string;
}

export class GoogleSheetsService {
  constructor(private readonly client: GoogleApiClient) {}

  /** อ่านหลาย Worksheet ในคำขอเดียว (นับโควตาเป็น 1 ครั้ง) คืนตารางตามลำดับที่ขอ */
  async batchGetSheets(spreadsheetId: string, sheetNames: readonly string[]): Promise<string[][][]> {
    if (sheetNames.length === 0) return [];
    const response = await this.client.json<{ valueRanges?: { values?: unknown[][] }[] }>({
      url: `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet`,
      query: {
        ranges: sheetNames.map(quoteSheetName),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
        majorDimension: 'ROWS',
      },
    });
    return sheetNames.map((_, index) =>
      (response.valueRanges?.[index]?.values ?? []).map((row) => row.map(normalizeCell)),
    );
  }

  async listSheets(spreadsheetId: string): Promise<SheetProperties[]> {
    const response = await this.client.json<{
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    }>({
      url: `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}`,
      query: { fields: 'sheets.properties(sheetId,title)' },
    });
    return (response.sheets ?? []).map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? 0,
      title: sheet.properties?.title ?? '',
    }));
  }
}
