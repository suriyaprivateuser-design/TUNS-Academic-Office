/**
 * ระบบนิยาม Schema ของ Google Sheets (แหล่งความจริงเดียวของโครงสร้างข้อมูล)
 *
 * นิยามในโฟลเดอร์นี้ถูกใช้โดย:
 *   - Repository: แปลงค่า cell ⇄ ค่า TypeScript และตรวจความถูกต้องก่อนเขียน
 *   - Setup Wizard: สร้าง Worksheet และหัวคอลัมน์
 *   - scripts/generate-docs.ts: สร้าง DATA_DICTIONARY.md และ GOOGLE_SHEETS_SCHEMA.md
 *
 * กติกา:
 *   - คอลัมน์แรกของทุกตารางคือ `id` (Write Gateway อาศัยคอลัมน์ A เป็น id)
 *   - ทุกค่าเก็บใน Sheets เป็น "ข้อความ" (RAW) เพื่อรักษาศูนย์นำหน้าและกัน formula injection
 *   - ห้ามใช้เลขแถวเป็น primary key
 */

export const DATABASE_KEYS = [
  'master',
  'document',
  'classLeave',
  'task',
  'meeting',
  'personnel',
  'knowledge',
  'serviceHub',
  'system',
] as const;

export type DatabaseKey = (typeof DATABASE_KEYS)[number];

export type ColumnType =
  | 'string'
  | 'int'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'enum';

/** การจัดชั้นข้อมูลส่วนบุคคลตาม PDPA — ใช้ตัดสินว่าต้องปกปิด/ห้ามส่งออกช่องทางใด */
export type PiiLevel = 'personal' | 'sensitive';

export interface ColumnOptions {
  /** ข้อมูลส่วนบุคคล */
  pii?: PiiLevel;
  /** ตารางที่อ้างอิงถึง ในรูป `database.Worksheet` */
  ref?: string;
  /** ตัวอย่างค่า (แสดงใน Data Dictionary) */
  example?: string;
}

export interface ColumnDef<
  TType extends ColumnType = ColumnType,
  TRequired extends boolean = boolean,
  TValue = unknown,
> extends ColumnOptions {
  readonly type: TType;
  readonly required: TRequired;
  readonly description: string;
  /** ค่าที่อนุญาตสำหรับคอลัมน์ชนิด enum */
  readonly values?: readonly string[];
  /** ใช้อนุมานชนิดเท่านั้น ไม่มีค่าจริงตอน runtime */
  readonly __value?: TValue;
}

export type ColumnMap = Record<string, ColumnDef>;

export interface TableOptions {
  /** ชุดคอลัมน์ที่ต้องไม่ซ้ำ (ตรวจใน Write Gateway ภายใต้ lock) */
  uniqueKeys?: readonly (readonly string[])[];
  /** ตารางแบบเพิ่มอย่างเดียว (log) — ไม่มีการแก้ไขแถวเดิม */
  appendOnly?: boolean;
  /** Phase ที่เริ่มใช้งานตารางนี้ */
  phase?: number;
}

export interface TableDef<TColumns extends ColumnMap = ColumnMap> extends TableOptions {
  readonly db: DatabaseKey;
  /** ชื่อ Worksheet */
  readonly name: string;
  /** `database.Worksheet` */
  readonly key: string;
  readonly description: string;
  readonly columns: TColumns;
}

export interface DatabaseDef {
  readonly key: DatabaseKey;
  /** ชื่อไฟล์ Spreadsheet เช่น TUNS_MASTER_DATABASE */
  readonly title: string;
  /** ชื่อที่แสดงในโฟลเดอร์ 00_ฐานข้อมูลระบบ */
  readonly displayName: string;
  /** ตัวแปร environment ที่เก็บ Spreadsheet ID */
  readonly envVar: string;
  readonly description: string;
  /** ผู้ที่ควรมีสิทธิ์เข้าไฟล์โดยตรงใน Google Drive (นอกเหนือจากบัญชีระบบ) */
  readonly directAccess: string;
  readonly tables: readonly TableDef[];
}

type ValueOf<C> = C extends ColumnDef<ColumnType, boolean, infer V> ? V : never;

/** ชนิดของหนึ่งแถวหลังแปลงค่าแล้ว — คอลัมน์ที่ไม่บังคับเป็น `null` ได้ */
export type RowOf<T extends TableDef> = {
  -readonly [K in keyof T['columns']]: T['columns'][K] extends { required: true }
    ? ValueOf<T['columns'][K]>
    : ValueOf<T['columns'][K]> | null;
};

/** คอลัมน์ที่ Write Gateway เติมให้อัตโนมัติ ผู้เรียกไม่ต้องส่ง */
export type ManagedColumn =
  | 'version'
  | 'created_at'
  | 'created_by'
  | 'updated_at'
  | 'updated_by';

/** ชนิดของข้อมูลที่ใช้สร้างแถวใหม่: คอลัมน์ไม่บังคับและคอลัมน์ที่ระบบเติมให้ ละได้ */
export type InsertOf<T extends TableDef> = {
  [K in keyof RowOf<T> as K extends ManagedColumn | 'id'
    ? never
    : null extends RowOf<T>[K]
      ? never
      : K]: RowOf<T>[K];
} & {
  [K in keyof RowOf<T> as K extends ManagedColumn | 'id'
    ? never
    : null extends RowOf<T>[K]
      ? K
      : never]?: RowOf<T>[K];
} & { id?: string };

export type PatchOf<T extends TableDef> = Partial<Omit<RowOf<T>, 'id' | ManagedColumn>>;

// ── Column builders ────────────────────────────────────────────────────────────

function define<TType extends ColumnType, TRequired extends boolean, TValue>(
  type: TType,
  required: TRequired,
  description: string,
  options?: ColumnOptions & { values?: readonly string[] },
): ColumnDef<TType, TRequired, TValue> {
  return { type, required, description, ...options };
}

function builders<TRequired extends boolean>(required: TRequired) {
  return {
    /** ข้อความ — ใช้กับรหัสทุกชนิดด้วย (รหัสนักเรียน เลขเอกสาร) เพื่อรักษาศูนย์นำหน้า */
    string: (description: string, options?: ColumnOptions) =>
      define<'string', TRequired, string>('string', required, description, options),
    int: (description: string, options?: ColumnOptions) =>
      define<'int', TRequired, number>('int', required, description, options),
    number: (description: string, options?: ColumnOptions) =>
      define<'number', TRequired, number>('number', required, description, options),
    boolean: (description: string, options?: ColumnOptions) =>
      define<'boolean', TRequired, boolean>('boolean', required, description, options),
    /** วันที่ตามปฏิทินโรงเรียน รูปแบบ YYYY-MM-DD (ค.ศ.) แสดงผลเป็น พ.ศ. ที่หน้าจอ */
    date: (description: string, options?: ColumnOptions) =>
      define<'date', TRequired, string>('date', required, description, options),
    /** วันเวลา ISO 8601 (UTC) เช่น 2026-11-24T03:15:00.000Z */
    datetime: (description: string, options?: ColumnOptions) =>
      define<'datetime', TRequired, string>('datetime', required, description, options),
    /** ค่าโครงสร้างที่เก็บเป็น JSON ใน cell เดียว (ไม่เกิน 50,000 อักขระต่อ cell) */
    json: <TValue = unknown>(description: string, options?: ColumnOptions) =>
      define<'json', TRequired, TValue>('json', required, description, options),
    enum: <const TValues extends readonly string[]>(
      values: TValues,
      description: string,
      options?: ColumnOptions,
    ) =>
      define<'enum', TRequired, TValues[number]>('enum', required, description, {
        ...options,
        values,
      }),
  };
}

/** คอลัมน์ที่ไม่บังคับ (ว่างได้) */
export const col = builders(false);
/** คอลัมน์ที่บังคับ (ห้ามว่าง) */
export const req = builders(true);

export function defineTable<const TColumns extends ColumnMap>(
  db: DatabaseKey,
  name: string,
  description: string,
  columns: TColumns,
  options: TableOptions = {},
): TableDef<TColumns> {
  const names = Object.keys(columns);
  if (names[0] !== 'id') {
    throw new Error(`Table ${db}.${name}: first column must be "id"`);
  }
  return { db, name, key: `${db}.${name}`, description, columns, ...options };
}
