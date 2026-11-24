/**
 * LocalStorageAdapter — ที่เก็บข้อมูลสำหรับ Development และการทดสอบอัตโนมัติ
 *
 * - โครงสร้างข้อมูลและตรรกะการเขียนเหมือน Google Sheets ทุกประการ (ใช้ gateway-core ชุดเดียวกัน)
 * - เก็บลงไฟล์ JSON ใน LOCAL_DATA_DIR (ค่าว่าง = เก็บในหน่วยความจำอย่างเดียว)
 * - ใช้กับ Demo Data เท่านั้น ห้ามใช้เก็บข้อมูลจริงของโรงเรียน
 *
 * ข้อจำกัดที่ต้องรู้: การ serialize คำสั่งเขียนอาศัยการที่ `executeCommit` เป็น synchronous
 * ภายใน Node.js process เดียว จึงใช้ได้เฉพาะการรันแบบ process เดียว ไม่ใช่กลไกสำหรับ Production
 * (Production ใช้ LockService ของ Apps Script — ดู apps-script/)
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ALL_DATABASES, ALL_TABLES } from '@/schemas/database';
import { gatewayFailureToError } from './errors';
import {
  MemoryTableStore,
  executeCommit,
  type CommitSuccess,
  type GatewayEnv,
  type MemoryData,
  type WriteOperation,
} from './gateway-core';
import { headerOf } from './serialization';
import type {
  EnsureSchemaResult,
  ReadOptions,
  StorageAdapter,
  StorageHealth,
  TableSnapshot,
} from './types';

const DB_FILE = 'local-db.json';

const env: GatewayEnv = {
  sha256Hex: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
};

export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'local' as const;
  readonly store: MemoryTableStore;
  private readonly snapshots = new Map<string, TableSnapshot>();
  private readonly filePath: string | null;

  constructor(dataDir: string | null) {
    this.filePath = dataDir ? path.resolve(dataDir, DB_FILE) : null;
    let initial: MemoryData | undefined;
    if (this.filePath && existsSync(this.filePath)) {
      initial = JSON.parse(readFileSync(this.filePath, 'utf8')) as MemoryData;
    }
    this.store = new MemoryTableStore(initial);
    this.ensureSchemaSync();
    this.store.onChange = () => this.persist();
  }

  /** true เมื่อเพิ่งสร้างฐานข้อมูลใหม่ (ยังไม่มีไฟล์เดิม) */
  get isFresh(): boolean {
    return (this.store.snapshot('master.Users')?.rows.length ?? 0) === 0;
  }

  private persist(): void {
    if (!this.filePath) return;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    // เขียนไฟล์ชั่วคราวแล้วเปลี่ยนชื่อ เพื่อไม่ให้ไฟล์เสียหายถ้า process ถูกปิดกลางทาง
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.store.toJSON()));
    renameSync(temporary, this.filePath);
  }

  private ensureSchemaSync(): EnsureSchemaResult {
    const createdTables: string[] = [];
    const addedColumns: string[] = [];
    for (const table of ALL_TABLES) {
      const { created, added } = this.store.ensureTable(table.key, headerOf(table));
      if (created) createdTables.push(table.key);
      else for (const column of added) addedColumns.push(`${table.key}.${column}`);
    }
    for (const database of ALL_DATABASES) this.store.ensureLedger(database.key);
    if (createdTables.length > 0 || addedColumns.length > 0) {
      this.snapshots.clear();
      this.persist();
    }
    return { createdTables, addedColumns, checkedTables: ALL_TABLES.length };
  }

  async ensureSchema(): Promise<EnsureSchemaResult> {
    return this.ensureSchemaSync();
  }

  async readTable(table: string, _options?: ReadOptions): Promise<TableSnapshot> {
    const cached = this.snapshots.get(table);
    if (cached) return cached;
    const data = this.store.snapshot(table);
    if (!data) throw new Error(`Unknown table: ${table}`);
    const snapshot: TableSnapshot = {
      table,
      header: data.header,
      rows: data.rows,
      fetchedAt: Date.now(),
    };
    this.snapshots.set(table, snapshot);
    return snapshot;
  }

  async commit(operation: WriteOperation): Promise<CommitSuccess> {
    const result = executeCommit(this.store, env, operation);
    // ล้าง snapshot ของตารางที่เกี่ยวข้องเสมอ แม้ล้มเหลวกลางทาง (อาจเขียนไปบางฐานข้อมูลแล้ว)
    for (const mutation of operation.mutations) this.snapshots.delete(mutation.table);
    if (!result.ok) throw gatewayFailureToError(result.error);
    for (const table of result.touched) this.snapshots.delete(table);
    this.snapshots.delete('system.OperationLogs');
    return result;
  }

  async health(): Promise<StorageHealth> {
    const startedAt = Date.now();
    const users = this.store.snapshot('master.Users');
    return {
      ok: users !== null,
      kind: this.kind,
      message: this.filePath
        ? `ที่เก็บข้อมูลสำหรับ Development (ไฟล์ ${DB_FILE}) — ไม่ใช่ Google Sheets`
        : 'ที่เก็บข้อมูลในหน่วยความจำสำหรับการทดสอบ — ไม่ใช่ Google Sheets',
      latencyMs: Date.now() - startedAt,
      details: { tables: this.store.tableNames().length, persisted: this.filePath !== null },
    };
  }
}
