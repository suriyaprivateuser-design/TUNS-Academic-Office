/**
 * แปลงค่า TypeScript ⇄ ค่า cell ของ Google Sheets ตาม Schema Registry
 *
 * ทุก cell เก็บเป็น "ข้อความ" เสมอ (เขียนด้วยโหมด RAW / stringValue):
 *   - รหัสที่มีศูนย์นำหน้า (เช่น รหัสนักเรียน 00123) ไม่ถูกแปลงเป็นตัวเลข
 *   - ข้อความที่ขึ้นต้นด้วย = + - @ ไม่ถูกตีความเป็นสูตร (กัน Spreadsheet Formula Injection)
 * การกัน CSV Injection ตอนส่งออกไฟล์อยู่ที่ src/lib/security/csv.ts
 */
import { validation } from '@/lib/errors';
import type { ColumnDef, RowOf, TableDef } from '@/schemas/database/types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function serializeCell(column: ColumnDef, value: unknown, label = 'value'): string {
  if (value === null || value === undefined) return '';
  switch (column.type) {
    case 'string':
      if (typeof value !== 'string') throw validation(`${label} ต้องเป็นข้อความ`);
      return value;
    case 'enum':
      if (typeof value !== 'string' || !column.values?.includes(value)) {
        throw validation(`${label} มีค่าไม่อยู่ในรายการที่อนุญาต`);
      }
      return value;
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw validation(`${label} ต้องเป็นจำนวนเต็ม`);
      }
      return String(value);
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw validation(`${label} ต้องเป็นตัวเลข`);
      }
      return String(value);
    case 'boolean':
      if (typeof value !== 'boolean') throw validation(`${label} ต้องเป็น true หรือ false`);
      return value ? 'TRUE' : 'FALSE';
    case 'date':
      if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
        throw validation(`${label} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`);
      }
      return value;
    case 'datetime': {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw validation(`${label} ต้องเป็นวันเวลา ISO 8601`);
      }
      return new Date(value).toISOString();
    }
    case 'json':
      return JSON.stringify(value);
  }
}

export function parseCell(column: ColumnDef, raw: string | undefined): unknown {
  const text = raw ?? '';
  if (text === '') {
    // คอลัมน์บังคับที่ว่าง (ข้อมูลเสียหาย/แก้ชีตด้วยมือ) คืนค่าตั้งต้นของชนิดนั้น เพื่อไม่ให้ทั้งหน้าล้ม
    if (!column.required) return null;
    switch (column.type) {
      case 'int':
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'json':
        return null;
      default:
        return '';
    }
  }
  switch (column.type) {
    case 'int': {
      const value = Number.parseInt(text, 10);
      return Number.isNaN(value) ? 0 : value;
    }
    case 'number': {
      const value = Number(text);
      return Number.isNaN(value) ? 0 : value;
    }
    case 'boolean':
      return text === 'TRUE' || text === 'true' || text === '1';
    case 'json':
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    default:
      return text;
  }
}

/** ลำดับคอลัมน์ตามที่นิยามใน schema — ใช้สร้างหัวคอลัมน์ของ Worksheet */
export function headerOf(table: TableDef): string[] {
  return Object.keys(table.columns);
}

/**
 * แปลงข้อมูลเป็นค่า cell สำหรับ "สร้างแถวใหม่"
 * คืนทุกคอลัมน์ของ schema (ค่าว่างสำหรับคอลัมน์ที่ไม่ได้ส่ง) และตรวจคอลัมน์บังคับ
 */
export function serializeInsert(
  table: TableDef,
  values: Record<string, unknown>,
  managed: ReadonlySet<string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of Object.keys(values)) {
    if (!(name in table.columns)) {
      throw validation(`ตาราง ${table.key} ไม่มีคอลัมน์ ${name}`);
    }
  }
  for (const [name, column] of Object.entries(table.columns)) {
    const cell = serializeCell(column, values[name], `${table.name}.${name}`);
    if (column.required && cell === '' && !managed.has(name)) {
      throw validation(`ต้องระบุ ${table.name}.${name}`);
    }
    result[name] = cell;
  }
  return result;
}

/** แปลงเฉพาะคอลัมน์ที่แก้ไข */
export function serializePatch(
  table: TableDef,
  patch: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const column = table.columns[name];
    if (!column) throw validation(`ตาราง ${table.key} ไม่มีคอลัมน์ ${name}`);
    const cell = serializeCell(column, value, `${table.name}.${name}`);
    if (column.required && cell === '') throw validation(`${table.name}.${name} ห้ามว่าง`);
    result[name] = cell;
  }
  return result;
}

/**
 * แปลงแถวจากชีตเป็น object โดยจับคู่ตาม "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง
 * จึงทนต่อการสลับลำดับคอลัมน์หรือมีคอลัมน์เพิ่มในชีต
 */
export function parseRows<T extends TableDef>(
  table: T,
  header: readonly string[],
  rows: readonly (readonly string[])[],
): RowOf<T>[] {
  const columns = Object.entries(table.columns).map(([name, column]) => ({
    name,
    column,
    index: header.indexOf(name),
  }));
  const idIndex = header.indexOf('id');
  const result: RowOf<T>[] = [];
  for (const row of rows) {
    // ข้ามแถวว่าง (เช่น แถวที่ถูกล้างข้อมูลด้วยมือ)
    if (idIndex === -1 || !row[idIndex]) continue;
    const record: Record<string, unknown> = {};
    for (const { name, column, index } of columns) {
      record[name] = parseCell(column, index === -1 ? '' : row[index]);
    }
    result.push(record as RowOf<T>);
  }
  return result;
}
