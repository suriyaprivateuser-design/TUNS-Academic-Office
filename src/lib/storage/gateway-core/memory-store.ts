/**
 * TableStore ในหน่วยความจำ — ใช้โดย Local Storage Adapter (Development) และ unit tests
 * โครงสร้างข้อมูลเหมือน Google Sheets ทุกประการ: หัวคอลัมน์ 1 แถว + แถวข้อมูลที่เป็นข้อความทั้งหมด
 */
import { LEDGER_HEADER, LEDGER_SHEET, dbOf, type DbBatch, type TableStore } from './types';

export interface MemoryTable {
  header: string[];
  rows: string[][];
}

export type MemoryData = Record<string, MemoryTable>;

export class MemoryTableStore implements TableStore {
  private readonly tables = new Map<string, MemoryTable>();

  /** จำนวนครั้งที่ applyBatch ถูกเรียก — ใช้ในการทดสอบว่าคำสั่งซ้ำไม่ถูกเขียนอีก */
  writeCount = 0;

  /** ใช้จำลองความล้มเหลวกลางทางในการทดสอบ: โยน error เพื่อให้ batch ของฐานข้อมูลนั้นล้มเหลว */
  beforeApply: ((db: string, batch: DbBatch) => void) | null = null;

  /** ถูกเรียกหลังเขียนสำเร็จทุกครั้ง (Local Adapter ใช้บันทึกลงไฟล์) */
  onChange: (() => void) | null = null;

  constructor(initial?: MemoryData) {
    if (initial) {
      for (const [name, table] of Object.entries(initial)) {
        this.tables.set(name, {
          header: [...table.header],
          rows: table.rows.map((row) => [...row]),
        });
      }
    }
  }

  /** สร้างตารางถ้ายังไม่มี และเพิ่มคอลัมน์ที่ขาดไว้ท้ายสุด (ไม่ลบ/ไม่ย้ายคอลัมน์เดิม) */
  ensureTable(name: string, header: readonly string[]): { created: boolean; added: string[] } {
    const existing = this.tables.get(name);
    if (!existing) {
      this.tables.set(name, { header: [...header], rows: [] });
      return { created: true, added: [...header] };
    }
    const added = header.filter((column) => !existing.header.includes(column));
    if (added.length > 0) {
      existing.header.push(...added);
      for (const row of existing.rows) while (row.length < existing.header.length) row.push('');
    }
    return { created: false, added };
  }

  ensureLedger(db: string): void {
    this.ensureTable(`${db}.${LEDGER_SHEET}`, LEDGER_HEADER);
  }

  hasTable(name: string): boolean {
    return this.tables.has(name);
  }

  tableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  /** สำเนาของตาราง (แก้ไขผลลัพธ์ได้โดยไม่กระทบข้อมูลจริง) */
  snapshot(name: string): MemoryTable | null {
    const table = this.tables.get(name);
    if (!table) return null;
    return { header: [...table.header], rows: table.rows.map((row) => [...row]) };
  }

  toJSON(): MemoryData {
    const data: MemoryData = {};
    for (const [name, table] of this.tables) data[name] = table;
    return data;
  }

  readHeaders(tables: string[]): Record<string, string[] | null> {
    const result: Record<string, string[] | null> = {};
    for (const name of tables) {
      const table = this.tables.get(name);
      result[name] = table ? [...table.header] : null;
    }
    return result;
  }

  readColumns(requests: { table: string; column: string }[]): string[][] {
    return requests.map(({ table: name, column }) => {
      const table = this.tables.get(name);
      if (!table) return [];
      const index = table.header.indexOf(column);
      if (index === -1) return [];
      return table.rows.map((row) => row[index] ?? '');
    });
  }

  readRows(requests: { table: string; rowIndex: number }[]): string[][] {
    return requests.map(({ table: name, rowIndex }) => {
      const table = this.tables.get(name);
      const row = table?.rows[rowIndex];
      if (!table || !row) return [];
      return table.header.map((_, index) => row[index] ?? '');
    });
  }

  applyBatch(db: string, batch: DbBatch): void {
    this.beforeApply?.(db, batch);

    // ตรวจทั้งชุดก่อน แล้วจึงเขียน เพื่อให้เป็น atomic เหมือน spreadsheets.batchUpdate
    for (const entry of [...batch.appends, ...batch.updates]) {
      if (dbOf(entry.table) !== db) {
        throw new Error(`batch for "${db}" contains table ${entry.table}`);
      }
      if (!this.tables.has(entry.table)) throw new Error(`table ${entry.table} does not exist`);
    }
    for (const update of batch.updates) {
      const table = this.tables.get(update.table);
      if (!table || update.rowIndex < 0 || update.rowIndex >= table.rows.length) {
        throw new Error(`row ${update.rowIndex} of ${update.table} is out of range`);
      }
    }

    for (const update of batch.updates) {
      const table = this.tables.get(update.table);
      if (table) table.rows[update.rowIndex] = [...update.row];
    }
    for (const append of batch.appends) {
      const table = this.tables.get(append.table);
      if (table) for (const row of append.rows) table.rows.push([...row]);
    }
    this.writeCount += 1;
    this.onChange?.();
  }
}
