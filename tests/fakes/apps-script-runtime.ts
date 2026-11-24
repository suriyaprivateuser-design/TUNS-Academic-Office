/**
 * Apps Script runtime จำลองสำหรับทดสอบ Write Gateway โดยไม่ต้องต่อ Google
 *
 * จำลองเฉพาะส่วนที่ gateway ใช้ และเลียนแบบพฤติกรรมของ Sheets API ที่มีผลต่อความถูกต้อง:
 *   - values.batchGet ตัด cell ว่างท้ายแถว/ท้ายคอลัมน์ออก
 *   - batchUpdate เป็น atomic: คำขอใดไม่ถูกต้อง ไม่มีการเขียนเลย
 *   - stringValue เก็บเป็นข้อความตรงตัว
 * ข้อจำกัด: เป็นแบบจำลองที่เขียนตามเอกสาร API ไม่ได้ทดแทนการทดสอบกับ Google Sheets จริง
 */
import { createHash, createHmac } from 'node:crypto';
import type { AppsScriptRuntime, ValueRange } from '../../apps-script/src/globals';

interface FakeSheet {
  sheetId: number;
  title: string;
  /** grid[row][column] */
  grid: string[][];
  columnCount: number;
  textFormatted: boolean;
}

interface FakeSpreadsheet {
  sheets: FakeSheet[];
}

const toSignedBytes = (buffer: Buffer): number[] => Array.from(buffer).map((b) => (b > 127 ? b - 256 : b));

function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function trimTrailing(values: string[]): string[] {
  const result = [...values];
  while (result.length > 0 && (result[result.length - 1] ?? '') === '') result.pop();
  return result;
}

export interface FakeRuntimeControls {
  runtime: AppsScriptRuntime;
  spreadsheets: Map<string, FakeSpreadsheet>;
  properties: Map<string, string>;
  /** เรียงลำดับเหตุการณ์ lock/API ไว้ตรวจว่าการเขียนเกิดภายใต้ lock */
  log: string[];
  lock: { held: boolean; available: boolean };
  /** โยน error ก่อน batchUpdate ของ spreadsheet ที่ระบุ (จำลอง API ล่ม) */
  failBatchUpdate: ((spreadsheetId: string) => boolean) | null;
  createSpreadsheet(id: string): void;
  grid(spreadsheetId: string, title: string): string[][];
  records(spreadsheetId: string, title: string): Record<string, string>[];
  apiCalls: number;
}

export function createFakeRuntime(): FakeRuntimeControls {
  const spreadsheets = new Map<string, FakeSpreadsheet>();
  const properties = new Map<string, string>();
  const cache = new Map<string, string>();
  const log: string[] = [];
  const lock = { held: false, available: true };
  let nextSheetId = 1000;

  const controls: FakeRuntimeControls = {
    runtime: undefined as unknown as AppsScriptRuntime,
    spreadsheets,
    properties,
    log,
    lock,
    failBatchUpdate: null,
    apiCalls: 0,
    createSpreadsheet(id) {
      // ไฟล์ใหม่ของ Google Sheets มี Worksheet ตั้งต้นหนึ่งแผ่นเสมอ
      spreadsheets.set(id, {
        sheets: [{ sheetId: 0, title: 'Sheet1', grid: [], columnCount: 26, textFormatted: false }],
      });
    },
    grid(spreadsheetId, title) {
      return findSheet(spreadsheetId, title).grid;
    },
    records(spreadsheetId, title) {
      const [header = [], ...rows] = findSheet(spreadsheetId, title).grid;
      return rows.map((row) =>
        Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])),
      );
    },
  };

  function getSpreadsheet(id: string): FakeSpreadsheet {
    const spreadsheet = spreadsheets.get(id);
    if (!spreadsheet) throw new Error(`Requested entity was not found: ${id}`);
    return spreadsheet;
  }

  function findSheet(spreadsheetId: string, title: string): FakeSheet {
    const sheet = getSpreadsheet(spreadsheetId).sheets.find((s) => s.title === title);
    if (!sheet) throw new Error(`Unable to parse range: ${title}`);
    return sheet;
  }

  function parseRange(range: string): { title: string; a1: string } {
    const match = /^'((?:[^']|'')*)'!(.+)$/.exec(range);
    if (!match) throw new Error(`Unable to parse range: ${range}`);
    return { title: (match[1] ?? '').replace(/''/g, "'"), a1: match[2] ?? '' };
  }

  function readRange(spreadsheetId: string, range: string, majorDimension: 'ROWS' | 'COLUMNS'): ValueRange {
    const { title, a1 } = parseRange(range);
    const sheet = findSheet(spreadsheetId, title);
    const rowOnly = /^(\d+):(\d+)$/.exec(a1);
    const cells = /^([A-Z]+)(\d+):([A-Z]+)(\d+)?$/.exec(a1);

    let rows: string[][];
    if (rowOnly) {
      const from = Number(rowOnly[1]) - 1;
      const to = Number(rowOnly[2]) - 1;
      rows = sheet.grid.slice(from, to + 1).map((row) => [...row]);
    } else if (cells) {
      const startColumn = columnIndex(cells[1] ?? 'A');
      const startRow = Number(cells[2]) - 1;
      const endColumn = columnIndex(cells[3] ?? 'A');
      const endRow = cells[4] ? Number(cells[4]) - 1 : sheet.grid.length - 1;
      rows = [];
      for (let r = startRow; r <= endRow; r += 1) {
        const row = sheet.grid[r] ?? [];
        const slice: string[] = [];
        for (let c = startColumn; c <= endColumn; c += 1) slice.push(row[c] ?? '');
        rows.push(slice);
      }
    } else {
      throw new Error(`Unsupported range in fake: ${a1}`);
    }

    // Sheets API ตัด cell ว่างท้ายแถว และแถวว่างท้ายช่วงออก
    let values = rows.map(trimTrailing);
    while (values.length > 0 && (values[values.length - 1] ?? []).length === 0) values.pop();

    if (majorDimension === 'COLUMNS') {
      const width = Math.max(0, ...values.map((row) => row.length));
      const columns: string[][] = [];
      for (let c = 0; c < width; c += 1) {
        columns.push(trimTrailing(values.map((row) => row[c] ?? '')));
      }
      values = columns;
    }
    return values.length > 0 ? { range, values } : { range };
  }

  function cellText(cell: unknown): string {
    const value = (cell as { userEnteredValue?: { stringValue?: unknown; formulaValue?: unknown } })
      .userEnteredValue;
    if (!value) return '';
    if ('formulaValue' in value) throw new Error('fake does not accept formulas');
    if (typeof value.stringValue !== 'string') throw new Error('Invalid value: expected stringValue');
    return value.stringValue;
  }

  const Sheets: AppsScriptRuntime['Sheets'] = {
    Spreadsheets: {
      get(spreadsheetId) {
        controls.apiCalls += 1;
        const spreadsheet = getSpreadsheet(spreadsheetId);
        return {
          spreadsheetId,
          sheets: spreadsheet.sheets.map((sheet) => ({
            properties: {
              sheetId: sheet.sheetId,
              title: sheet.title,
              gridProperties: { rowCount: 1000, columnCount: sheet.columnCount },
            },
          })),
        };
      },
      batchUpdate(resource, spreadsheetId) {
        controls.apiCalls += 1;
        log.push(`batchUpdate:${spreadsheetId}:${lock.held ? 'locked' : 'UNLOCKED'}`);
        if (controls.failBatchUpdate?.(spreadsheetId)) throw new Error('Service unavailable: Sheets');
        const spreadsheet = getSpreadsheet(spreadsheetId);
        // ทำงานบนสำเนา แล้วสลับเข้าเมื่อทุกคำขอผ่าน → atomic
        const draft: FakeSpreadsheet = {
          sheets: spreadsheet.sheets.map((sheet) => ({
            ...sheet,
            grid: sheet.grid.map((row) => [...row]),
          })),
        };
        const byId = (sheetId: unknown): FakeSheet => {
          const sheet = draft.sheets.find((s) => s.sheetId === sheetId);
          if (!sheet) throw new Error(`No grid with id: ${String(sheetId)}`);
          return sheet;
        };
        const replies: { addSheet?: { properties?: { sheetId?: number; title?: string } } }[] = [];

        for (const request of resource.requests) {
          if ('addSheet' in request) {
            const properties = (request.addSheet as { properties: { title: string; gridProperties?: { columnCount?: number } } })
              .properties;
            if (draft.sheets.some((s) => s.title === properties.title)) {
              throw new Error(`A sheet with the name "${properties.title}" already exists`);
            }
            const sheet: FakeSheet = {
              sheetId: (nextSheetId += 1),
              title: properties.title,
              grid: [],
              columnCount: properties.gridProperties?.columnCount ?? 26,
              textFormatted: false,
            };
            draft.sheets.push(sheet);
            replies.push({ addSheet: { properties: { sheetId: sheet.sheetId, title: sheet.title } } });
          } else if ('appendDimension' in request) {
            const args = request.appendDimension as { sheetId: number; length: number };
            byId(args.sheetId).columnCount += args.length;
            replies.push({});
          } else if ('updateCells' in request) {
            const args = request.updateCells as {
              range: { sheetId: number; startRowIndex: number; startColumnIndex: number; endColumnIndex: number };
              rows: { values: unknown[] }[];
              fields: string;
            };
            if (args.fields !== 'userEnteredValue') throw new Error('unexpected fields mask');
            const sheet = byId(args.range.sheetId);
            if (args.range.endColumnIndex > sheet.columnCount) {
              throw new Error('Range exceeds grid limits');
            }
            args.rows.forEach((row, offset) => {
              const rowIndex = args.range.startRowIndex + offset;
              while (sheet.grid.length <= rowIndex) sheet.grid.push([]);
              const target = sheet.grid[rowIndex] ?? [];
              row.values.forEach((cell, columnOffset) => {
                const column = args.range.startColumnIndex + columnOffset;
                while (target.length <= column) target.push('');
                target[column] = cellText(cell);
              });
              sheet.grid[rowIndex] = target;
            });
            replies.push({});
          } else if ('appendCells' in request) {
            const args = request.appendCells as { sheetId: number; rows: { values: unknown[] }[]; fields: string };
            if (args.fields !== 'userEnteredValue') throw new Error('unexpected fields mask');
            const sheet = byId(args.sheetId);
            // ต่อท้ายหลังแถวสุดท้ายที่มีข้อมูล
            let last = sheet.grid.length;
            while (last > 0 && trimTrailing(sheet.grid[last - 1] ?? []).length === 0) last -= 1;
            sheet.grid.length = last;
            for (const row of args.rows) sheet.grid.push(row.values.map(cellText));
            replies.push({});
          } else if ('repeatCell' in request) {
            const args = request.repeatCell as { range: { sheetId: number; startRowIndex?: number } };
            if (args.range.startRowIndex === undefined) byId(args.range.sheetId).textFormatted = true;
            replies.push({});
          } else {
            throw new Error(`fake does not support request: ${Object.keys(request).join(',')}`);
          }
        }
        spreadsheets.set(spreadsheetId, draft);
        return { replies };
      },
      Values: {
        batchGet(spreadsheetId, optionalArgs) {
          controls.apiCalls += 1;
          if (optionalArgs.valueRenderOption !== 'UNFORMATTED_VALUE') {
            throw new Error('gateway must read UNFORMATTED_VALUE');
          }
          return {
            valueRanges: optionalArgs.ranges.map((range) =>
              readRange(spreadsheetId, range, optionalArgs.majorDimension ?? 'ROWS'),
            ),
          };
        },
      },
    },
  };

  controls.runtime = {
    Sheets,
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (!lock.available || lock.held) return false;
          lock.held = true;
          log.push('lock:acquired');
          return true;
        },
        releaseLock() {
          lock.held = false;
          log.push('lock:released');
        },
      }),
    },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeHmacSha256Signature: (value, key) =>
        toSignedBytes(createHmac('sha256', key).update(value, 'utf8').digest()),
      computeDigest: (_algorithm, value) =>
        toSignedBytes(createHash('sha256').update(value, 'utf8').digest()),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key) => properties.get(key) ?? null }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => void cache.set(key, value),
        remove: (key) => void cache.delete(key),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (content) => ({ setMimeType: () => ({ content }) }),
    },
  };

  return controls;
}
