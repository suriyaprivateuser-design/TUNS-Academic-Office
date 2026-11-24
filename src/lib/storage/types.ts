/**
 * StorageAdapter — ขอบเขตระหว่าง Business Logic กับเทคโนโลยีฐานข้อมูล
 *
 * Repository และ Service รู้จักเพียง interface นี้ จึงเปลี่ยนเทคโนโลยีฐานข้อมูลในอนาคตได้
 * โดยไม่ต้องรื้อ Business Logic (ข้อ 05.3)
 *
 *   read  → อ่านทั้งตารางเป็น snapshot (มี cache ฝั่ง server)
 *   write → ทุกการเขียนผ่าน `commit` ซึ่งไปที่ Write Gateway จุดเดียว
 */
import type { CommitSuccess, WriteOperation } from './gateway-core';

export interface TableSnapshot {
  readonly table: string;
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** เวลาที่อ่านจากแหล่งข้อมูลจริง (epoch ms) */
  readonly fetchedAt: number;
}

export interface ReadOptions {
  /**
   * ต้องการข้อมูลที่อ่านหลังเวลานี้ (epoch ms) — ใช้ทำ read-your-writes:
   * หลังผู้ใช้เขียนข้อมูล คำขอถัดไปของผู้ใช้คนนั้นจะไม่ได้ cache ที่เก่ากว่าการเขียน
   */
  minFreshAt?: number;
}

export interface EnsureSchemaResult {
  /** Worksheet ที่ถูกสร้างใหม่ในรอบนี้ */
  createdTables: string[];
  /** คอลัมน์ที่ถูกเพิ่มในรอบนี้ (`table.column`) */
  addedColumns: string[];
  /** จำนวน Worksheet ทั้งหมดที่ตรวจ */
  checkedTables: number;
}

export interface StorageHealth {
  ok: boolean;
  kind: StorageAdapter['kind'];
  /** ข้อความสรุปผลการตรวจจริง */
  message: string;
  latencyMs: number;
  details?: Record<string, string | number | boolean>;
}

export interface StorageAdapter {
  readonly kind: 'local' | 'google-sheets';
  readTable(table: string, options?: ReadOptions): Promise<TableSnapshot>;
  /** เขียนผ่าน Write Gateway — โยน AppError เมื่อไม่สำเร็จ (CONFLICT, NOT_FOUND, SETUP_REQUIRED, INTEGRATION) */
  commit(operation: WriteOperation): Promise<CommitSuccess>;
  /** สร้าง Worksheet/หัวคอลัมน์ที่ขาดตาม Schema Registry (idempotent ไม่ลบหรือเขียนทับข้อมูลเดิม) */
  ensureSchema(): Promise<EnsureSchemaResult>;
  /** ตรวจการอ่าน–เขียนจริง ห้ามคืน ok โดยไม่ได้ตรวจ */
  health(): Promise<StorageHealth>;
}
