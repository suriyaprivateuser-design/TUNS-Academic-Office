/**
 * Schema Registry — รวมนิยามของ Google Spreadsheet ทั้ง 9 ไฟล์ (ข้อ 24)
 */
import { classLeaveDatabase } from './class-leave';
import { documentDatabase } from './document';
import { knowledgeDatabase } from './knowledge';
import { masterDatabase } from './master';
import { meetingDatabase } from './meeting';
import { personnelDatabase } from './personnel';
import { serviceHubDatabase } from './service-hub';
import { systemDatabase } from './system';
import { taskDatabase } from './task';
import { DATABASE_KEYS, type DatabaseDef, type DatabaseKey, type TableDef } from './types';

export * from './types';

export const DATABASES: Record<DatabaseKey, DatabaseDef> = {
  master: masterDatabase,
  document: documentDatabase,
  classLeave: classLeaveDatabase,
  task: taskDatabase,
  meeting: meetingDatabase,
  personnel: personnelDatabase,
  knowledge: knowledgeDatabase,
  serviceHub: serviceHubDatabase,
  system: systemDatabase,
};

export const ALL_DATABASES: readonly DatabaseDef[] = DATABASE_KEYS.map((key) => DATABASES[key]);

export const ALL_TABLES: readonly TableDef[] = ALL_DATABASES.flatMap((db) => db.tables);

const TABLE_BY_KEY = new Map<string, TableDef>(ALL_TABLES.map((table) => [table.key, table]));

export function getTableDef(key: string): TableDef {
  const table = TABLE_BY_KEY.get(key);
  if (!table) throw new Error(`Unknown table: ${key}`);
  return table;
}

export function hasTable(key: string): boolean {
  return TABLE_BY_KEY.has(key);
}

/** เวอร์ชันของ schema — เพิ่มทุกครั้งที่เพิ่ม Worksheet หรือคอลัมน์ (บันทึกลง SchemaVersions ตอน setup) */
export const SCHEMA_VERSION = 1;
