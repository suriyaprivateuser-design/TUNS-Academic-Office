/**
 * ensureSchema — สร้าง Worksheet และหัวคอลัมน์ที่ขาดตาม Schema Registry
 *
 * Idempotent และไม่ทำลายข้อมูล:
 *   - Worksheet ที่มีอยู่แล้วไม่ถูกสร้างซ้ำ ไม่ถูกลบ ไม่ถูกเปลี่ยนชื่อ
 *   - คอลัมน์ที่ขาดถูกเพิ่ม "ต่อท้าย" เท่านั้น ไม่ย้ายหรือลบคอลัมน์เดิม
 *   - ไม่แตะแถวข้อมูล
 */
import type { AppsScriptRuntime } from './globals';
import { columnLetter, quoteSheet, toCell, toText, type SheetsTableStore } from './sheets-store';

export interface SchemaSpec {
  databases: Record<string, Record<string, string[]>>;
}

export interface EnsureSchemaOutcome {
  ok: true;
  createdTables: string[];
  addedColumns: string[];
  checkedTables: number;
}

const DEFAULT_ROWS = 1000;

export function ensureSchema(
  runtime: AppsScriptRuntime,
  store: SheetsTableStore,
  spec: SchemaSpec,
): EnsureSchemaOutcome {
  const createdTables: string[] = [];
  const addedColumns: string[] = [];
  let checkedTables = 0;

  for (const db of Object.keys(spec.databases)) {
    const sheets = spec.databases[db] ?? {};
    const spreadsheetId = store.spreadsheetId(db);
    const titles = Object.keys(sheets);
    checkedTables += titles.length;

    const meta = runtime.Sheets.Spreadsheets.get(spreadsheetId, {
      fields: 'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))',
    });
    const existing = new Map<string, { sheetId: number; columnCount: number }>();
    for (const sheet of meta.sheets ?? []) {
      const properties = sheet.properties;
      if (properties?.title !== undefined && properties.sheetId !== undefined) {
        existing.set(properties.title, {
          sheetId: properties.sheetId,
          columnCount: properties.gridProperties?.columnCount ?? 26,
        });
      }
    }

    // 1) สร้าง Worksheet ที่ยังไม่มี
    const missing = titles.filter((title) => !existing.has(title));
    if (missing.length > 0) {
      const response = runtime.Sheets.Spreadsheets.batchUpdate(
        {
          requests: missing.map((title) => ({
            addSheet: {
              properties: {
                title,
                gridProperties: {
                  rowCount: DEFAULT_ROWS,
                  columnCount: Math.max((sheets[title] ?? []).length, 1),
                  frozenRowCount: 1,
                },
              },
            },
          })),
        },
        spreadsheetId,
      );
      missing.forEach((title, index) => {
        const sheetId = response.replies?.[index]?.addSheet?.properties?.sheetId;
        if (sheetId === undefined) throw new Error(`could not create worksheet ${db}.${title}`);
        existing.set(title, { sheetId, columnCount: Math.max((sheets[title] ?? []).length, 1) });
        createdTables.push(`${db}.${title}`);
      });
    }

    // 2) หัวคอลัมน์ปัจจุบันของทุก Worksheet
    const current = runtime.Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
      ranges: titles.map((title) => `${quoteSheet(title)}!1:1`),
      valueRenderOption: 'UNFORMATTED_VALUE',
      majorDimension: 'ROWS',
    });

    // 3) เติมหัวคอลัมน์ที่ขาด และจัดรูปแบบ Worksheet ใหม่เป็น "ข้อความธรรมดา"
    const requests: Record<string, unknown>[] = [];
    titles.forEach((title, index) => {
      const wanted = sheets[title] ?? [];
      const sheet = existing.get(title);
      if (!sheet) return;
      const header = (current.valueRanges?.[index]?.values?.[0] ?? []).map(toText);
      const isNew = missing.indexOf(title) !== -1;
      const toAdd = wanted.filter((column) => header.indexOf(column) === -1);

      if (toAdd.length > 0) {
        const start = header.length;
        const needed = start + toAdd.length;
        if (needed > sheet.columnCount) {
          requests.push({
            appendDimension: {
              sheetId: sheet.sheetId,
              dimension: 'COLUMNS',
              length: needed - sheet.columnCount,
            },
          });
        }
        requests.push({
          updateCells: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: start,
              endColumnIndex: needed,
            },
            rows: [{ values: toAdd.map(toCell) }],
            fields: 'userEnteredValue',
          },
        });
        if (!isNew) for (const column of toAdd) addedColumns.push(`${db}.${title}.${column}`);
      }

      if (isNew) {
        // ทุก cell เป็นข้อความธรรมดา: ผู้ดูแลที่พิมพ์ 00123 ในชีตจะไม่ถูกแปลงเป็นตัวเลข
        requests.push({
          repeatCell: {
            range: { sheetId: sheet.sheetId },
            cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        });
        requests.push({
          repeatCell: {
            range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        });
      }
    });

    if (requests.length > 0) runtime.Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheetId);
    store.forgetSheetIds(db);
  }

  return { ok: true, createdTables, addedColumns, checkedTables };
}

/** ใช้ในข้อความ debug เท่านั้น */
export function describeRange(title: string, columns: number): string {
  return `${quoteSheet(title)}!A1:${columnLetter(Math.max(columns, 1) - 1)}1`;
}
