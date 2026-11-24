/**
 * Write Gateway — ตัวดำเนินการคำสั่งเขียน
 *
 * ผู้เรียกต้องรับประกันว่า `executeCommit` ทำงานทีละคำสั่ง (serialized):
 *   - Apps Script: เรียกภายใต้ LockService.getScriptLock()
 *   - Local adapter: ฟังก์ชันนี้เป็น synchronous ทั้งหมด จึงไม่ถูกแทรกใน Node.js process เดียว
 *
 * ลำดับการทำงาน
 *   1. ตรวจรูปแบบคำสั่ง
 *   2. ตรวจ Idempotency Key ใน Operation Journal → เคยสำเร็จแล้วคืนผลเดิม / ค้างอยู่ทำต่อ
 *   3. ตรวจทุกเงื่อนไขก่อนเขียน (แถวมีอยู่จริง, เวอร์ชันตรง, ค่าไม่ซ้ำ) — ไม่ผ่านข้อใด ไม่เขียนอะไรเลย
 *   4. จองเลขอ้างอิง และบันทึก journal สถานะ pending (atomic ในไฟล์ system)
 *   5. เขียนทีละฐานข้อมูล แต่ละไฟล์เป็น atomic และมีแถว Ledger กำกับ
 *   6. เขียนไฟล์ system เป็นลำดับสุดท้ายพร้อมเปลี่ยน journal เป็น applied
 */
import {
  AUDIT_CHAIN_HEAD_ID,
  AUDIT_CHAIN_TABLE,
  AUDIT_GENESIS_HASH,
  AUDIT_HASH_FIELDS,
  AUDIT_TABLE,
  JOURNAL_TABLE,
  MAX_CELL_LENGTH,
  MAX_MUTATIONS_PER_OPERATION,
  SEQUENCE_TABLE,
  SYSTEM_DB,
  dbOf,
  ledgerTable,
  type CommitFailure,
  type CommitResult,
  type CommitSuccess,
  type DbBatch,
  type GatewayEnv,
  type GatewayErrorCode,
  type Mutation,
  type TableStore,
  type WriteOperation,
} from './types';

class GatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    message: string,
    readonly extra: { table?: string; id?: string; columns?: string[]; retryable?: boolean } = {},
  ) {
    super(message);
  }
}

function fail(error: GatewayError): CommitFailure {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      table: error.extra.table,
      id: error.extra.id,
      columns: error.extra.columns,
      retryable: error.extra.retryable ?? false,
    },
  };
}

const SEQ_TOKEN = /\{\{seq:([A-Za-z0-9_]+)(?::(\d{1,2}))?\}\}/g;

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (typeof (value as Record<string, unknown>)[key] !== 'string') return false;
  }
  return true;
}

function isUniqueBy(value: unknown): value is string[][] | undefined {
  if (value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.every(
      (group) => Array.isArray(group) && group.length > 0 && group.every((c) => typeof c === 'string'),
    )
  );
}

function validateOperation(op: WriteOperation): void {
  const invalid = (message: string) => new GatewayError('INVALID_OPERATION', message);
  if (!op || typeof op !== 'object') throw invalid('operation must be an object');
  if (typeof op.id !== 'string' || !op.id) throw invalid('operation.id is required');
  if (typeof op.idempotencyKey !== 'string' || !op.idempotencyKey) {
    throw invalid('operation.idempotencyKey is required');
  }
  if (typeof op.action !== 'string' || !op.action) throw invalid('operation.action is required');
  if (typeof op.now !== 'string' || Number.isNaN(Date.parse(op.now))) {
    throw invalid('operation.now must be an ISO timestamp');
  }
  if (op.actorId !== null && typeof op.actorId !== 'string') {
    throw invalid('operation.actorId must be a string or null');
  }
  if (!Array.isArray(op.mutations)) throw invalid('operation.mutations must be an array');
  if (op.mutations.length > MAX_MUTATIONS_PER_OPERATION) {
    throw invalid(`operation has more than ${MAX_MUTATIONS_PER_OPERATION} mutations`);
  }
  if (op.data !== undefined && !isRecordOfStrings(op.data)) {
    throw invalid('operation.data must be a record of strings');
  }

  const seen = new Set<string>();
  for (const mutation of op.mutations) {
    if (!mutation || typeof mutation !== 'object') throw invalid('mutation must be an object');
    if (typeof mutation.table !== 'string' || !dbOf(mutation.table)) {
      throw invalid('mutation.table must look like "database.Worksheet"');
    }
    if (!isUniqueBy(mutation.uniqueBy)) throw invalid('mutation.uniqueBy must be string[][]');
    let id: string;
    if (mutation.op === 'insert') {
      if (!isRecordOfStrings(mutation.values)) {
        throw invalid('insert.values must be a record of strings');
      }
      id = mutation.values.id ?? '';
      if (!id) throw invalid(`insert into ${mutation.table} requires values.id`);
    } else if (mutation.op === 'update') {
      if (!isRecordOfStrings(mutation.set)) throw invalid('update.set must be a record of strings');
      if (typeof mutation.id !== 'string' || !mutation.id) throw invalid('update.id is required');
      if ('id' in mutation.set) throw invalid('update.set must not change id');
      if (
        mutation.expectedVersion !== undefined &&
        (!Number.isInteger(mutation.expectedVersion) || mutation.expectedVersion < 1)
      ) {
        throw invalid('update.expectedVersion must be a positive integer');
      }
      id = mutation.id;
    } else {
      throw invalid('mutation.op must be "insert" or "update"');
    }
    // หนึ่งคำสั่งแตะแถวเดียวกันได้ครั้งเดียว เพื่อให้การตรวจเวอร์ชันและการกู้คืนตีความได้ทางเดียว
    const ref = `${mutation.table}:${id}`;
    if (seen.has(ref)) {
      throw invalid(`operation touches ${ref} more than once`);
    }
    seen.add(ref);
  }

  const names = new Set<string>();
  for (const sequence of op.sequences ?? []) {
    if (!sequence || typeof sequence.name !== 'string' || !/^[A-Za-z0-9_]+$/.test(sequence.name)) {
      throw invalid('sequence.name must be alphanumeric');
    }
    if (typeof sequence.key !== 'string' || !sequence.key) throw invalid('sequence.key is required');
    if (names.has(sequence.name)) throw invalid(`duplicate sequence name "${sequence.name}"`);
    names.add(sequence.name);
  }
}

function substitute(value: string, sequences: Record<string, number>): string {
  if (value.indexOf('{{seq:') === -1) return value;
  return value.replace(SEQ_TOKEN, (match, name: string, pad?: string) => {
    const number = sequences[name];
    if (number === undefined) {
      throw new GatewayError('INVALID_OPERATION', `unknown sequence token ${match}`);
    }
    const text = String(number);
    return pad ? text.padStart(Number(pad), '0') : text;
  });
}

function substituteRecord(
  record: Record<string, string>,
  sequences: Record<string, number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(record)) result[key] = substitute(record[key] ?? '', sequences);
  return result;
}

function requireColumns(table: string, header: string[], columns: string[]): void {
  const missing = columns.filter((column) => header.indexOf(column) === -1);
  if (missing.length > 0) {
    throw new GatewayError(
      'UNKNOWN_COLUMN',
      `table ${table} has no column(s): ${missing.join(', ')}`,
      { table, columns: missing },
    );
  }
}

function assertCellSizes(table: string, values: Record<string, string>): void {
  for (const key of Object.keys(values)) {
    if ((values[key] ?? '').length > MAX_CELL_LENGTH) {
      throw new GatewayError(
        'INVALID_OPERATION',
        `value of ${table}.${key} exceeds ${MAX_CELL_LENGTH} characters`,
        { table, columns: [key] },
      );
    }
  }
}

function safeParse<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** ต่อค่าของชุดคอลัมน์เป็นคีย์เดียว คืน null เมื่อมีค่าใดว่าง (ไม่ตรวจความซ้ำ) */
function tupleKey(parts: (string | undefined)[]): string | null {
  for (const part of parts) if (!part) return null;
  return parts.join('\u001f');
}

interface PlannedWrite {
  table: string;
  id: string;
  kind: 'insert' | 'update';
  row: string[];
  rowIndex?: number;
  version?: number;
}

function ensureBatch(batches: Map<string, DbBatch>, db: string): DbBatch {
  let batch = batches.get(db);
  if (!batch) {
    batch = { appends: [], updates: [] };
    batches.set(db, batch);
  }
  return batch;
}

function addAppend(batch: DbBatch, table: string, row: string[]): void {
  const existing = batch.appends.find((entry) => entry.table === table);
  if (existing) existing.rows.push(row);
  else batch.appends.push({ table, rows: [row] });
}

function run(store: TableStore, env: GatewayEnv, op: WriteOperation): CommitResult {
  validateOperation(op);

  const mutationTables = Array.from(new Set(op.mutations.map((m) => m.table)));
  const hasSequences = (op.sequences?.length ?? 0) > 0;
  const hasAudit = op.mutations.some((m) => m.op === 'insert' && m.table === AUDIT_TABLE);

  const dataDbs = Array.from(new Set(mutationTables.map(dbOf)));
  const otherDbs = dataDbs.filter((db) => db !== SYSTEM_DB).sort();

  // ── 1. หัวคอลัมน์ของทุกตารางที่เกี่ยวข้อง ────────────────────────────────────
  const neededTables = new Set<string>(mutationTables);
  neededTables.add(JOURNAL_TABLE);
  if (hasSequences) neededTables.add(SEQUENCE_TABLE);
  if (hasAudit) neededTables.add(AUDIT_CHAIN_TABLE);
  for (const db of otherDbs) neededTables.add(ledgerTable(db));

  const headers = store.readHeaders(Array.from(neededTables));
  const headerOf = (table: string): string[] => {
    const header = headers[table];
    if (!header || header.length === 0) {
      throw new GatewayError(
        'UNKNOWN_TABLE',
        `worksheet for ${table} does not exist or has no header row`,
        { table },
      );
    }
    return header;
  };
  for (const table of neededTables) headerOf(table);

  const journalHeader = headerOf(JOURNAL_TABLE);
  requireColumns(JOURNAL_TABLE, journalHeader, [
    'id',
    'created_at',
    'idempotency_key',
    'action',
    'actor_id',
    'status',
    'databases',
    'applied_databases',
    'row_refs',
    'result_json',
    'error',
    'completed_at',
  ]);
  const journalCol = (name: string) => journalHeader.indexOf(name);

  // ── 2. ตรวจ Idempotency Key ───────────────────────────────────────────────
  const [journalKeys = []] = store.readColumns([
    { table: JOURNAL_TABLE, column: 'idempotency_key' },
  ]);
  const existingIndex = journalKeys.indexOf(op.idempotencyKey);
  let resumeRow: string[] | null = null;

  if (existingIndex !== -1) {
    const [row = []] = store.readRows([{ table: JOURNAL_TABLE, rowIndex: existingIndex }]);
    const status = row[journalCol('status')] ?? '';
    if (status === 'applied') {
      const stored = safeParse<CommitSuccess | null>(row[journalCol('result_json')], null);
      if (stored && stored.ok) return { ...stored, replayed: true };
      return {
        ok: true,
        opId: row[journalCol('id')] ?? op.id,
        replayed: true,
        sequences: {},
        versions: {},
        touched: [],
        data: {},
      };
    }
    if (status !== 'pending' || (row[journalCol('id')] ?? '') !== op.id) {
      // คำสั่งก่อนหน้าที่ใช้คีย์นี้เขียนค้างไว้และไม่ใช่คำสั่งชุดเดียวกัน — ต้องให้ผู้ดูแลตรวจ (Reconciliation)
      throw new GatewayError(
        'INCOMPLETE_OPERATION',
        `a previous operation with idempotency key "${op.idempotencyKey}" did not complete`,
        { id: row[journalCol('id')] },
      );
    }
    resumeRow = row;
  }

  const resuming = resumeRow !== null;
  const journalRowIndex = resuming ? existingIndex : journalKeys.length;
  const priorResult = resuming
    ? safeParse<CommitSuccess | null>(resumeRow?.[journalCol('result_json')], null)
    : null;

  // ── 3. ฐานข้อมูลที่เขียนไปแล้ว (เฉพาะกรณีทำต่อ) ──────────────────────────────
  const appliedDbs = new Set<string>();
  if (resuming && otherDbs.length > 0) {
    const ledgers = store.readColumns(
      otherDbs.map((db) => ({ table: ledgerTable(db), column: 'op_id' })),
    );
    otherDbs.forEach((db, index) => {
      if ((ledgers[index] ?? []).indexOf(op.id) !== -1) appliedDbs.add(db);
    });
  }

  // ── 4. จองเลขอ้างอิง ────────────────────────────────────────────────────────
  const sequences: Record<string, number> = {};
  const sequenceWrites: PlannedWrite[] = [];
  if (hasSequences) {
    if (resuming) {
      // เลขถูกจองและบันทึกไว้แล้วในรอบแรก ใช้เลขเดิมเท่านั้น
      Object.assign(sequences, priorResult?.sequences ?? {});
      for (const request of op.sequences ?? []) {
        if (sequences[request.name] === undefined) {
          throw new GatewayError(
            'INCOMPLETE_OPERATION',
            `sequence "${request.name}" was not reserved by the previous attempt`,
          );
        }
      }
    } else {
      const header = headerOf(SEQUENCE_TABLE);
      requireColumns(SEQUENCE_TABLE, header, ['id', 'version', 'current_value']);
      const [ids = [], values = [], versions = []] = store.readColumns([
        { table: SEQUENCE_TABLE, column: 'id' },
        { table: SEQUENCE_TABLE, column: 'current_value' },
        { table: SEQUENCE_TABLE, column: 'version' },
      ]);
      const state = new Map<string, { rowIndex: number; value: number; version: number }>();
      for (const request of op.sequences ?? []) {
        let entry = state.get(request.key);
        if (!entry) {
          const rowIndex = ids.indexOf(request.key);
          entry = {
            rowIndex,
            value: rowIndex === -1 ? 0 : Number(values[rowIndex] ?? '0') || 0,
            version: rowIndex === -1 ? 0 : Number(versions[rowIndex] ?? '0') || 0,
          };
          state.set(request.key, entry);
        }
        entry.value += 1;
        sequences[request.name] = entry.value;
      }
      const existing = Array.from(state.entries()).filter(([, entry]) => entry.rowIndex !== -1);
      const currentRows = store.readRows(
        existing.map(([, entry]) => ({ table: SEQUENCE_TABLE, rowIndex: entry.rowIndex })),
      );
      const rowByKey = new Map(existing.map(([key], index) => [key, currentRows[index] ?? []]));
      for (const [key, entry] of state) {
        const base = entry.rowIndex === -1 ? [] : (rowByKey.get(key) ?? []);
        const row = header.map((column, index) => {
          switch (column) {
            case 'id':
              return key;
            case 'version':
              return String(entry.version + 1);
            case 'current_value':
              return String(entry.value);
            case 'created_at':
              return entry.rowIndex === -1 ? op.now : (base[index] ?? '');
            case 'created_by':
              return entry.rowIndex === -1 ? (op.actorId ?? '') : (base[index] ?? '');
            case 'updated_at':
              return op.now;
            case 'updated_by':
              return op.actorId ?? '';
            default:
              return base[index] ?? '';
          }
        });
        sequenceWrites.push({
          table: SEQUENCE_TABLE,
          id: key,
          kind: entry.rowIndex === -1 ? 'insert' : 'update',
          row,
          rowIndex: entry.rowIndex === -1 ? undefined : entry.rowIndex,
        });
      }
    }
  }

  // ── 5. แทนค่า token ของ sequence ────────────────────────────────────────────
  const mutations: Mutation[] = op.mutations.map((mutation) =>
    mutation.op === 'insert'
      ? { ...mutation, values: substituteRecord(mutation.values, sequences) }
      : { ...mutation, set: substituteRecord(mutation.set, sequences) },
  );
  const data = substituteRecord(op.data ?? {}, sequences);

  // ── 6. ตรวจทุกเงื่อนไขก่อนเขียน (เฉพาะฐานข้อมูลที่ยังไม่ได้เขียน) ─────────────────
  const pending = mutations.filter((mutation) => !appliedDbs.has(dbOf(mutation.table)));

  for (const mutation of pending) {
    const header = headerOf(mutation.table);
    const fields = mutation.op === 'insert' ? mutation.values : mutation.set;
    requireColumns(mutation.table, header, Object.keys(fields));
    assertCellSizes(mutation.table, fields);
    for (const group of mutation.uniqueBy ?? []) requireColumns(mutation.table, header, group);
  }

  const updates = pending.filter((m): m is Extract<Mutation, { op: 'update' }> => m.op === 'update');
  const updateTables = Array.from(new Set(updates.map((m) => m.table)));
  const idColumns = store.readColumns(updateTables.map((table) => ({ table, column: 'id' })));
  const idsByTable = new Map(updateTables.map((table, index) => [table, idColumns[index] ?? []]));

  const rowRequests = updates.map((mutation) => {
    const rowIndex = (idsByTable.get(mutation.table) ?? []).indexOf(mutation.id);
    if (rowIndex === -1) {
      throw new GatewayError('NOT_FOUND', `row ${mutation.table}:${mutation.id} does not exist`, {
        table: mutation.table,
        id: mutation.id,
      });
    }
    return { table: mutation.table, rowIndex };
  });
  const currentRows = store.readRows(rowRequests);

  const versions: Record<string, number> = {};
  const planned: PlannedWrite[] = [];
  const currentByRef = new Map<string, string[]>();

  updates.forEach((mutation, index) => {
    const header = headerOf(mutation.table);
    const current = currentRows[index] ?? [];
    const rowIndex = rowRequests[index]?.rowIndex ?? -1;
    const versionIndex = header.indexOf('version');
    const currentVersion = versionIndex === -1 ? 0 : Number(current[versionIndex] ?? '0') || 0;
    if (mutation.expectedVersion !== undefined && currentVersion !== mutation.expectedVersion) {
      throw new GatewayError(
        'VERSION_CONFLICT',
        `row ${mutation.table}:${mutation.id} is at version ${currentVersion}, expected ${mutation.expectedVersion}`,
        { table: mutation.table, id: mutation.id },
      );
    }
    const nextVersion = currentVersion + 1;
    const row = header.map((column, columnIndex) => {
      if (column === 'version') return String(nextVersion);
      if (column === 'updated_at') return op.now;
      if (column === 'updated_by') return op.actorId ?? '';
      const next = mutation.set[column];
      return next !== undefined ? next : (current[columnIndex] ?? '');
    });
    if (versionIndex !== -1) versions[`${mutation.table}:${mutation.id}`] = nextVersion;
    currentByRef.set(`${mutation.table}:${mutation.id}`, row);
    planned.push({ table: mutation.table, id: mutation.id, kind: 'update', row, rowIndex });
  });

  const inserts = pending.filter((m): m is Extract<Mutation, { op: 'insert' }> => m.op === 'insert');
  for (const mutation of inserts) {
    const header = headerOf(mutation.table);
    const row = header.map((column) => {
      const value = mutation.values[column];
      if (value !== undefined && value !== '') return value;
      if (column === 'version') return '1';
      if (column === 'created_at') return op.now;
      if (column === 'created_by') return op.actorId ?? '';
      return value ?? '';
    });
    currentByRef.set(`${mutation.table}:${mutation.values.id}`, row);
    planned.push({ table: mutation.table, id: mutation.values.id ?? '', kind: 'insert', row });
  }

  // ความไม่ซ้ำ: เทียบกับข้อมูลเดิมและกับแถวอื่นในคำสั่งเดียวกัน
  const uniqueChecks = pending.flatMap((mutation) =>
    (mutation.uniqueBy ?? []).map((group) => ({ mutation, group })),
  );
  if (uniqueChecks.length > 0) {
    const columnRequests: { table: string; column: string }[] = [];
    const requestIndex = new Map<string, number>();
    const want = (table: string, column: string) => {
      const key = `${table}\u001f${column}`;
      if (!requestIndex.has(key)) {
        requestIndex.set(key, columnRequests.length);
        columnRequests.push({ table, column });
      }
    };
    for (const { mutation, group } of uniqueChecks) {
      want(mutation.table, 'id');
      for (const column of group) want(mutation.table, column);
    }
    const columnValues = store.readColumns(columnRequests);
    const columnOf = (table: string, column: string) =>
      columnValues[requestIndex.get(`${table}\u001f${column}`) ?? -1] ?? [];

    const claimed = new Map<string, string>();
    for (const { mutation, group } of uniqueChecks) {
      const id = mutation.op === 'insert' ? (mutation.values.id ?? '') : mutation.id;
      const header = headerOf(mutation.table);
      const row = currentByRef.get(`${mutation.table}:${id}`) ?? [];
      const key = tupleKey(group.map((column) => row[header.indexOf(column)]));
      if (key === null) continue;

      const scope = `${mutation.table}\u001f${group.join(',')}\u001f${key}`;
      const violation = () =>
        new GatewayError(
          'UNIQUE_VIOLATION',
          `${mutation.table} already has a row with the same ${group.join(' + ')}`,
          { table: mutation.table, id, columns: group },
        );
      const claimedBy = claimed.get(scope);
      if (claimedBy !== undefined && claimedBy !== id) throw violation();
      claimed.set(scope, id);

      const ids = columnOf(mutation.table, 'id');
      const columns = group.map((column) => columnOf(mutation.table, column));
      for (let rowIndex = 0; rowIndex < ids.length; rowIndex += 1) {
        const otherId = ids[rowIndex] ?? '';
        if (!otherId || otherId === id) continue;
        // แถวเดิมที่กำลังถูกแก้ไขในคำสั่งเดียวกัน ให้เทียบกับค่า "หลังแก้ไข" ไม่ใช่ค่าที่เก็บอยู่
        const rewritten = currentByRef.get(`${mutation.table}:${otherId}`);
        const otherKey = rewritten
          ? tupleKey(group.map((column) => rewritten[header.indexOf(column)]))
          : tupleKey(columns.map((values) => values[rowIndex]));
        if (otherKey === key) throw violation();
      }
    }
  }

  // ── 7. สาย hash ของ Audit Log ──────────────────────────────────────────────
  const auditWrites = planned.filter((write) => write.table === AUDIT_TABLE && write.kind === 'insert');
  let chainWrite: PlannedWrite | null = null;
  if (auditWrites.length > 0) {
    const auditHeader = headerOf(AUDIT_TABLE);
    requireColumns(AUDIT_TABLE, auditHeader, ['prev_hash', 'row_hash']);
    const chainHeader = headerOf(AUDIT_CHAIN_TABLE);
    requireColumns(AUDIT_CHAIN_TABLE, chainHeader, ['id', 'version', 'last_hash', 'entry_count']);
    const [chainIds = []] = store.readColumns([{ table: AUDIT_CHAIN_TABLE, column: 'id' }]);
    const headIndex = chainIds.indexOf(AUDIT_CHAIN_HEAD_ID);
    const headRow =
      headIndex === -1
        ? []
        : (store.readRows([{ table: AUDIT_CHAIN_TABLE, rowIndex: headIndex }])[0] ?? []);
    let lastHash = headRow[chainHeader.indexOf('last_hash')] || AUDIT_GENESIS_HASH;
    let count = Number(headRow[chainHeader.indexOf('entry_count')] ?? '0') || 0;
    const headVersion = Number(headRow[chainHeader.indexOf('version')] ?? '0') || 0;

    for (const write of auditWrites) {
      const fields = AUDIT_HASH_FIELDS.map((field) => write.row[auditHeader.indexOf(field)] ?? '');
      const hash = env.sha256Hex([lastHash, ...fields].join('\u001f'));
      write.row[auditHeader.indexOf('prev_hash')] = lastHash;
      write.row[auditHeader.indexOf('row_hash')] = hash;
      lastHash = hash;
      count += 1;
    }

    const row = chainHeader.map((column, index) => {
      switch (column) {
        case 'id':
          return AUDIT_CHAIN_HEAD_ID;
        case 'version':
          return String(headVersion + 1);
        case 'last_hash':
          return lastHash;
        case 'entry_count':
          return String(count);
        case 'created_at':
          return headIndex === -1 ? op.now : (headRow[index] ?? '');
        case 'updated_at':
          return op.now;
        default:
          return headRow[index] ?? '';
      }
    });
    chainWrite = {
      table: AUDIT_CHAIN_TABLE,
      id: AUDIT_CHAIN_HEAD_ID,
      kind: headIndex === -1 ? 'insert' : 'update',
      row,
      rowIndex: headIndex === -1 ? undefined : headIndex,
    };
  }

  // ── 8. จัดกลุ่มการเขียนตามฐานข้อมูล ───────────────────────────────────────────
  const batches = new Map<string, DbBatch>();
  const place = (write: PlannedWrite) => {
    const batch = ensureBatch(batches, dbOf(write.table));
    if (write.kind === 'insert') addAppend(batch, write.table, write.row);
    else batch.updates.push({ table: write.table, rowIndex: write.rowIndex ?? -1, row: write.row });
  };
  for (const write of planned) place(write);
  if (chainWrite) place(chainWrite);

  const touched = Array.from(
    new Set([
      ...mutationTables,
      ...(hasSequences ? [SEQUENCE_TABLE] : []),
      ...(hasAudit ? [AUDIT_CHAIN_TABLE] : []),
    ]),
  ).sort();

  const result: CommitSuccess = {
    ok: true,
    opId: op.id,
    replayed: false,
    sequences,
    versions: { ...(priorResult?.versions ?? {}), ...versions },
    touched,
    data,
  };

  const refs = op.mutations.map((m) => `${m.table}:${m.op === 'insert' ? m.values.id : m.id}`);
  let rowRefs = JSON.stringify(refs);
  if (rowRefs.length > MAX_CELL_LENGTH) {
    const kept: string[] = [];
    let length = 2;
    for (const ref of refs) {
      if (length + ref.length + 3 > MAX_CELL_LENGTH - 40) break;
      kept.push(ref);
      length += ref.length + 3;
    }
    rowRefs = JSON.stringify([...kept, `…+${refs.length - kept.length}`]);
  }
  let resultJson = JSON.stringify(result);
  if (resultJson.length > MAX_CELL_LENGTH) {
    resultJson = JSON.stringify({ ...result, versions: {} });
  }

  const allDbs = [...otherDbs, SYSTEM_DB];
  const journalRow = (status: 'pending' | 'applied'): string[] =>
    journalHeader.map((column) => {
      switch (column) {
        case 'id':
          return op.id;
        case 'created_at':
          return resuming ? (resumeRow?.[journalCol('created_at')] ?? op.now) : op.now;
        case 'idempotency_key':
          return op.idempotencyKey;
        case 'action':
          return op.action;
        case 'actor_id':
          return op.actorId ?? '';
        case 'status':
          return status;
        case 'databases':
          return JSON.stringify(allDbs);
        case 'applied_databases':
          return status === 'applied' ? JSON.stringify(allDbs) : JSON.stringify([]);
        case 'row_refs':
          return rowRefs;
        case 'result_json':
          return resultJson;
        case 'completed_at':
          return status === 'applied' ? op.now : '';
        default:
          return '';
      }
    });

  // ── 9. เขียน ───────────────────────────────────────────────────────────────
  const systemBatch = ensureBatch(batches, SYSTEM_DB);

  if (otherDbs.length === 0 && !resuming) {
    // ทุกอย่างอยู่ในไฟล์ system → เขียนครั้งเดียวแบบ atomic พร้อม journal สถานะ applied
    for (const write of sequenceWrites) place(write);
    addAppend(systemBatch, JOURNAL_TABLE, journalRow('applied'));
    store.applyBatch(SYSTEM_DB, systemBatch);
    return result;
  }

  if (!resuming) {
    // 9.1 จอง: journal (pending) + ตัวนับเลข ในคำสั่ง atomic เดียว
    const reserve: DbBatch = { appends: [], updates: [] };
    addAppend(reserve, JOURNAL_TABLE, journalRow('pending'));
    for (const write of sequenceWrites) {
      if (write.kind === 'insert') addAppend(reserve, write.table, write.row);
      else reserve.updates.push({ table: write.table, rowIndex: write.rowIndex ?? -1, row: write.row });
    }
    store.applyBatch(SYSTEM_DB, reserve);
  }

  // 9.2 ฐานข้อมูลอื่นทีละไฟล์ แต่ละไฟล์มีแถว Ledger ในคำสั่งเดียวกัน
  for (const db of otherDbs) {
    if (appliedDbs.has(db)) continue;
    const batch = ensureBatch(batches, db);
    addAppend(batch, ledgerTable(db), [op.id, op.now]);
    store.applyBatch(db, batch);
  }

  // 9.3 ไฟล์ system เป็นลำดับสุดท้าย พร้อมปิด journal
  systemBatch.updates.push({
    table: JOURNAL_TABLE,
    rowIndex: journalRowIndex,
    row: journalRow('applied'),
  });
  store.applyBatch(SYSTEM_DB, systemBatch);
  return result;
}

/**
 * ดำเนินการคำสั่งเขียนหนึ่งคำสั่ง ไม่โยน exception — คืนผลลัพธ์ที่บอกชัดว่าสำเร็จ ชนกัน หรือควรลองใหม่
 */
export function executeCommit(store: TableStore, env: GatewayEnv, op: WriteOperation): CommitResult {
  try {
    return run(store, env, op);
  } catch (error) {
    if (error instanceof GatewayError) return fail(error);
    const message = error instanceof Error ? error.message : String(error);
    return fail(new GatewayError('STORE_ERROR', message, { retryable: true }));
  }
}
