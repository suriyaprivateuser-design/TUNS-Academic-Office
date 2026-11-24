/**
 * Write Gateway — ชนิดข้อมูลกลาง
 *
 * โค้ดในโฟลเดอร์ gateway-core เป็น TypeScript ล้วน ไม่พึ่ง Node.js / Next.js / Apps Script API
 * เพราะถูกใช้ 2 ที่ด้วยตรรกะชุดเดียวกัน:
 *   1) bundle ไปเป็น Google Apps Script (apps-script/dist/Code.gs) ทำงานภายใต้ LockService
 *   2) Local Storage Adapter สำหรับ Development และการทดสอบ
 * ห้าม import โมดูลอื่นของโปรเจกต์เข้ามาในโฟลเดอร์นี้
 */

/** ฐานข้อมูลที่เก็บ Operation Journal, ตัวนับเลข และ Audit Log */
export const SYSTEM_DB = 'system';
export const JOURNAL_TABLE = 'system.OperationLogs';
export const SEQUENCE_TABLE = 'system.DocumentSequences';
export const AUDIT_TABLE = 'system.AuditLogs';
export const AUDIT_CHAIN_TABLE = 'system.AuditChain';
export const AUDIT_CHAIN_HEAD_ID = 'head';

/**
 * Worksheet ภายในของทุก Spreadsheet: บันทึกว่า operation ใดถูกเขียนลงไฟล์นี้แล้ว
 * แถวนี้ถูกเขียนในคำสั่ง atomic เดียวกับข้อมูล จึงใช้ตัดสินได้ว่าต้องเขียนซ้ำหรือไม่เมื่อกู้คืน
 */
export const LEDGER_SHEET = '_Ledger';
export const LEDGER_HEADER = ['op_id', 'applied_at'] as const;

/** คอลัมน์ของ Audit Log ที่นำมาคำนวณ hash (ลำดับคงที่ ห้ามเปลี่ยนโดยไม่เพิ่มเวอร์ชัน) */
export const AUDIT_HASH_FIELDS = [
  'id',
  'created_at',
  'actor_id',
  'action',
  'category',
  'resource',
  'entity_type',
  'entity_id',
  'outcome',
  'summary',
  'metadata',
] as const;

export const AUDIT_GENESIS_HASH = 'GENESIS';

export const MAX_MUTATIONS_PER_OPERATION = 5000;
/** ขีดจำกัดของ Google Sheets คือ 50,000 อักขระต่อ cell — เผื่อระยะไว้ */
export const MAX_CELL_LENGTH = 45000;

export interface InsertMutation {
  op: 'insert';
  /** `database.Worksheet` */
  table: string;
  /** ค่าทุกคอลัมน์ในรูปข้อความ ต้องมี `id` */
  values: Record<string, string>;
  /** ชุดคอลัมน์ที่ต้องไม่ซ้ำกับแถวอื่น (ข้ามการตรวจเมื่อค่าใดในชุดว่าง) */
  uniqueBy?: string[][];
}

export interface UpdateMutation {
  op: 'update';
  table: string;
  id: string;
  /** เฉพาะคอลัมน์ที่เปลี่ยน */
  set: Record<string, string>;
  /** ถ้าระบุ เวอร์ชันปัจจุบันของแถวต้องตรง มิฉะนั้นได้ VERSION_CONFLICT */
  expectedVersion?: number;
  uniqueBy?: string[][];
}

export type Mutation = InsertMutation | UpdateMutation;

export interface SequenceRequest {
  /** ชื่อที่ใช้อ้างใน token `{{seq:name}}` หรือ `{{seq:name:4}}` (เติมศูนย์ให้ครบ 4 หลัก) */
  name: string;
  /** คีย์ของชุดเลข เช่น `CL-2569` */
  key: string;
}

export interface WriteOperation {
  /** รหัสของคำสั่ง (UUID) — ใช้เป็น id ใน Operation Journal และ Ledger */
  id: string;
  /** คีย์กันการทำซ้ำ: คำสั่งที่คีย์ซ้ำจะไม่ถูกเขียนอีกครั้ง */
  idempotencyKey: string;
  /** ชื่อคำสั่ง เช่น `classLeave.submit` */
  action: string;
  actorId: string | null;
  /** เวลาของคำสั่ง (ISO 8601) กำหนดโดย backend ครั้งเดียว ใช้กับทุกแถว */
  now: string;
  mutations: Mutation[];
  sequences?: SequenceRequest[];
  /** ข้อมูลที่ต้องการให้ส่งกลับเมื่อมีการเรียกซ้ำด้วยคีย์เดิม (เช่น id ของ record ที่สร้าง) รองรับ token ของ sequence */
  data?: Record<string, string>;
}

export type GatewayErrorCode =
  | 'INVALID_OPERATION'
  | 'UNKNOWN_TABLE'
  | 'UNKNOWN_COLUMN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'UNIQUE_VIOLATION'
  | 'INCOMPLETE_OPERATION'
  | 'LOCK_TIMEOUT'
  | 'UNAUTHORIZED'
  | 'STORE_ERROR';

export interface CommitSuccess {
  ok: true;
  opId: string;
  /** true = คำสั่งนี้เคยสำเร็จแล้ว ผลลัพธ์นี้คือของครั้งแรก ไม่มีการเขียนซ้ำ */
  replayed: boolean;
  /** เลขที่จองได้ตามชื่อใน SequenceRequest */
  sequences: Record<string, number>;
  /** เวอร์ชันใหม่ของแถวที่ถูกแก้ไข (`table:id` → version) */
  versions: Record<string, number>;
  /** ตารางที่ถูกเขียน ใช้ล้าง cache ฝั่ง backend */
  touched: string[];
  data: Record<string, string>;
}

export interface CommitFailure {
  ok: false;
  error: {
    code: GatewayErrorCode;
    message: string;
    table?: string;
    id?: string;
    columns?: string[];
    /** true = ลองใหม่ด้วยคำสั่งเดิมได้อย่างปลอดภัย */
    retryable: boolean;
  };
}

export type CommitResult = CommitSuccess | CommitFailure;

export interface DbBatch {
  appends: { table: string; rows: string[][] }[];
  /** rowIndex = ลำดับแถวข้อมูลแบบ 0-based (ไม่นับแถวหัวคอลัมน์) */
  updates: { table: string; rowIndex: number; row: string[] }[];
}

/**
 * ตัวกลางเข้าถึงตาราง — ทุกค่าเป็นข้อความ
 * `applyBatch` ต้องเป็น atomic ต่อหนึ่งฐานข้อมูล (สำเร็จทั้งหมดหรือไม่เขียนเลย)
 */
export interface TableStore {
  /** คืนหัวคอลัมน์ของแต่ละตาราง หรือ null เมื่อไม่มี Worksheet นั้น */
  readHeaders(tables: string[]): Record<string, string[] | null>;
  /** คืนค่าของคอลัมน์ทั้งคอลัมน์ (เรียงตามแถวข้อมูล) ตามลำดับคำขอ */
  readColumns(requests: { table: string; column: string }[]): string[][];
  /** คืนแถวเต็มตามลำดับคำขอ */
  readRows(requests: { table: string; rowIndex: number }[]): string[][];
  applyBatch(db: string, batch: DbBatch): void;
}

export interface GatewayEnv {
  /** SHA-256 ของข้อความ UTF-8 ในรูป hex ตัวพิมพ์เล็ก */
  sha256Hex(text: string): string;
}

export function dbOf(table: string): string {
  const index = table.indexOf('.');
  return index === -1 ? '' : table.slice(0, index);
}

export function sheetOf(table: string): string {
  const index = table.indexOf('.');
  return index === -1 ? table : table.slice(index + 1);
}

export function ledgerTable(db: string): string {
  return `${db}.${LEDGER_SHEET}`;
}
