/**
 * TableStore บน Google Sheets (Advanced Sheets Service ของ Apps Script)
 *
 * - อ่านด้วย valueRenderOption = UNFORMATTED_VALUE แล้วแปลงเป็นข้อความทั้งหมด
 * - เขียนด้วย spreadsheets.batchUpdate + userEnteredValue.stringValue:
 *     · หนึ่งคำสั่ง batchUpdate เป็น atomic ต่อหนึ่งไฟล์ (ผิดข้อใดข้อหนึ่ง ไม่เขียนเลย)
 *     · stringValue ถูกเก็บเป็นข้อความตรงตัว ไม่ถูกตีความเป็นสูตรหรือตัวเลข
 */
import {
  dbOf,
  sheetOf,
  type DbBatch,
  type TableStore,
} from '../../src/lib/storage/gateway-core/types';
import type { AppsScriptRuntime } from './globals';

export function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export function toCell(value: string): Record<string, unknown> {
  // ค่าว่าง = ล้าง cell (เมื่อใช้คู่กับ fields: 'userEnteredValue')
  return value === '' ? {} : { userEnteredValue: { stringValue: value } };
}

const SHEET_ID_CACHE_SECONDS = 6 * 60 * 60;

export class SheetsTableStore implements TableStore {
  private readonly headers = new Map<string, string[]>();
  private readonly sheetIds = new Map<string, Map<string, number>>();

  constructor(
    private readonly runtime: AppsScriptRuntime,
    private readonly spreadsheets: Record<string, string>,
  ) {}

  spreadsheetId(db: string): string {
    const id = this.spreadsheets[db];
    if (!id) throw new Error(`spreadsheet id for database "${db}" was not provided`);
    return id;
  }

  private cacheKey(db: string): string {
    return `sheetIds:${this.spreadsheetId(db)}`;
  }

  /** ชื่อ Worksheet → sheetId ของไฟล์ (sheetId ไม่เปลี่ยนตลอดอายุของ Worksheet จึง cache ได้) */
  loadSheetIds(db: string, refresh = false): Map<string, number> {
    const existing = this.sheetIds.get(db);
    if (existing && !refresh) return existing;
    const cache = this.runtime.CacheService.getScriptCache();
    if (!refresh) {
      const cached = cache.get(this.cacheKey(db));
      if (cached) {
        const map = new Map<string, number>(JSON.parse(cached) as [string, number][]);
        this.sheetIds.set(db, map);
        return map;
      }
    }
    const response = this.runtime.Sheets.Spreadsheets.get(this.spreadsheetId(db), {
      fields: 'sheets.properties(sheetId,title)',
    });
    const map = new Map<string, number>();
    for (const sheet of response.sheets ?? []) {
      const title = sheet.properties?.title;
      const sheetId = sheet.properties?.sheetId;
      if (title !== undefined && sheetId !== undefined) map.set(title, sheetId);
    }
    this.sheetIds.set(db, map);
    cache.put(this.cacheKey(db), JSON.stringify(Array.from(map.entries())), SHEET_ID_CACHE_SECONDS);
    return map;
  }

  forgetSheetIds(db: string): void {
    this.sheetIds.delete(db);
    this.runtime.CacheService.getScriptCache().remove(this.cacheKey(db));
  }

  private sheetId(table: string): number {
    const db = dbOf(table);
    let id = this.loadSheetIds(db).get(sheetOf(table));
    if (id === undefined) id = this.loadSheetIds(db, true).get(sheetOf(table));
    if (id === undefined) throw new Error(`worksheet ${table} does not exist`);
    return id;
  }

  private batchGet(db: string, ranges: string[], majorDimension: 'ROWS' | 'COLUMNS'): string[][][] {
    if (ranges.length === 0) return [];
    const response = this.runtime.Sheets.Spreadsheets.Values.batchGet(this.spreadsheetId(db), {
      ranges,
      valueRenderOption: 'UNFORMATTED_VALUE',
      majorDimension,
    });
    return ranges.map((_, index) =>
      (response.valueRanges?.[index]?.values ?? []).map((line) => line.map(toText)),
    );
  }

  private groupByDb<T extends { table: string }>(items: T[]): Map<string, { item: T; position: number }[]> {
    const groups = new Map<string, { item: T; position: number }[]>();
    items.forEach((item, position) => {
      const db = dbOf(item.table);
      const group = groups.get(db) ?? [];
      group.push({ item, position });
      groups.set(db, group);
    });
    return groups;
  }

  readHeaders(tables: string[]): Record<string, string[] | null> {
    const result: Record<string, string[] | null> = {};
    const unknown = tables.filter((table) => !this.headers.has(table));
    for (const [db, group] of this.groupByDb(unknown.map((table) => ({ table })))) {
      let titles = this.loadSheetIds(db);
      if (group.some(({ item }) => !titles.has(sheetOf(item.table)))) {
        titles = this.loadSheetIds(db, true);
      }
      const present = group.filter(({ item }) => titles.has(sheetOf(item.table)));
      const values = this.batchGet(
        db,
        present.map(({ item }) => `${quoteSheet(sheetOf(item.table))}!1:1`),
        'ROWS',
      );
      present.forEach(({ item }, index) => {
        this.headers.set(item.table, values[index]?.[0] ?? []);
      });
    }
    for (const table of tables) result[table] = this.headers.get(table) ?? null;
    return result;
  }

  private header(table: string): string[] {
    const cached = this.headers.get(table);
    if (cached) return cached;
    return this.readHeaders([table])[table] ?? [];
  }

  readColumns(requests: { table: string; column: string }[]): string[][] {
    const result: string[][] = requests.map(() => []);
    for (const [db, group] of this.groupByDb(requests)) {
      const wanted = group
        .map(({ item, position }) => ({
          position,
          table: item.table,
          index: this.header(item.table).indexOf(item.column),
        }))
        .filter((entry) => entry.index !== -1);
      const values = this.batchGet(
        db,
        wanted.map(({ table, index }) => {
          const letter = columnLetter(index);
          return `${quoteSheet(sheetOf(table))}!${letter}2:${letter}`;
        }),
        'COLUMNS',
      );
      wanted.forEach(({ position }, index) => {
        result[position] = values[index]?.[0] ?? [];
      });
    }
    return result;
  }

  readRows(requests: { table: string; rowIndex: number }[]): string[][] {
    const result: string[][] = requests.map(() => []);
    for (const [db, group] of this.groupByDb(requests)) {
      const values = this.batchGet(
        db,
        group.map(({ item }) => {
          const width = Math.max(1, this.header(item.table).length);
          const sheetRow = item.rowIndex + 2;
          return `${quoteSheet(sheetOf(item.table))}!A${sheetRow}:${columnLetter(width - 1)}${sheetRow}`;
        }),
        'ROWS',
      );
      group.forEach(({ item, position }, index) => {
        const header = this.header(item.table);
        const row = values[index]?.[0] ?? [];
        result[position] = header.map((_, columnIndex) => row[columnIndex] ?? '');
      });
    }
    return result;
  }

  applyBatch(db: string, batch: DbBatch): void {
    const requests: Record<string, unknown>[] = [];
    for (const update of batch.updates) {
      if (dbOf(update.table) !== db) throw new Error(`batch for "${db}" contains ${update.table}`);
      requests.push({
        updateCells: {
          range: {
            sheetId: this.sheetId(update.table),
            startRowIndex: update.rowIndex + 1,
            endRowIndex: update.rowIndex + 2,
            startColumnIndex: 0,
            endColumnIndex: update.row.length,
          },
          rows: [{ values: update.row.map(toCell) }],
          fields: 'userEnteredValue',
        },
      });
    }
    for (const append of batch.appends) {
      if (dbOf(append.table) !== db) throw new Error(`batch for "${db}" contains ${append.table}`);
      if (append.rows.length === 0) continue;
      requests.push({
        appendCells: {
          sheetId: this.sheetId(append.table),
          rows: append.rows.map((row) => ({ values: row.map(toCell) })),
          fields: 'userEnteredValue',
        },
      });
    }
    if (requests.length === 0) return;
    this.runtime.Sheets.Spreadsheets.batchUpdate({ requests }, this.spreadsheetId(db));
  }
}
