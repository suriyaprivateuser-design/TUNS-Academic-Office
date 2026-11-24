import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUDIT_CHAIN_TABLE,
  AUDIT_GENESIS_HASH,
  AUDIT_HASH_FIELDS,
  AUDIT_TABLE,
  JOURNAL_TABLE,
  LEDGER_HEADER,
  MemoryTableStore,
  SEQUENCE_TABLE,
  executeCommit,
  type CommitResult,
  type GatewayEnv,
  type Mutation,
  type WriteOperation,
} from '@/lib/storage/gateway-core';

const env: GatewayEnv = {
  sha256Hex: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
};

const MANAGED = ['version', 'created_at', 'created_by', 'updated_at', 'updated_by'];
const REQUESTS = 'classLeave.ClassLeaveRequests';
const APPROVALS = 'document.ApprovalRequests';
const USERS = 'master.Users';
const NOTIFICATIONS = 'system.Notifications';

function createStore(): MemoryTableStore {
  const store = new MemoryTableStore();
  store.ensureTable(JOURNAL_TABLE, [
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
  store.ensureTable(SEQUENCE_TABLE, ['id', ...MANAGED, 'current_value']);
  store.ensureTable(AUDIT_TABLE, [
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
    'prev_hash',
    'row_hash',
  ]);
  store.ensureTable(AUDIT_CHAIN_TABLE, ['id', ...MANAGED, 'last_hash', 'entry_count']);
  store.ensureTable(NOTIFICATIONS, ['id', ...MANAGED, 'user_id', 'dedupe_key', 'title']);
  store.ensureTable(REQUESTS, ['id', ...MANAGED, 'reference_no', 'status', 'activity_name']);
  store.ensureTable(APPROVALS, ['id', ...MANAGED, 'subject_id', 'status']);
  store.ensureTable(USERS, ['id', ...MANAGED, 'email', 'student_code']);
  for (const db of ['classLeave', 'document', 'master']) store.ensureLedger(db);
  return store;
}

let counter = 0;
function operation(mutations: Mutation[], overrides: Partial<WriteOperation> = {}): WriteOperation {
  counter += 1;
  return {
    id: randomUUID(),
    idempotencyKey: `key-${counter}-${randomUUID()}`,
    action: 'test.action',
    actorId: 'user-1',
    now: '2026-11-24T03:00:00.000Z',
    mutations,
    ...overrides,
  };
}

function rowsOf(store: MemoryTableStore, table: string): Record<string, string>[] {
  const snapshot = store.snapshot(table);
  if (!snapshot) throw new Error(`missing ${table}`);
  return snapshot.rows.map((row) =>
    Object.fromEntries(snapshot.header.map((column, index) => [column, row[index] ?? ''])),
  );
}

function expectOk(result: CommitResult) {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

function expectFail(result: CommitResult) {
  if (result.ok) throw new Error('expected failure');
  return result.error;
}

describe('executeCommit — inserts and managed columns', () => {
  let store: MemoryTableStore;
  beforeEach(() => {
    store = createStore();
  });

  it('inserts a row, fills version/created_* and journals the operation', () => {
    const op = operation([
      { op: 'insert', table: NOTIFICATIONS, values: { id: 'n1', user_id: 'u1', title: 'สวัสดี' } },
    ]);
    const result = expectOk(executeCommit(store, env, op));

    expect(result.replayed).toBe(false);
    expect(rowsOf(store, NOTIFICATIONS)).toEqual([
      {
        id: 'n1',
        version: '1',
        created_at: '2026-11-24T03:00:00.000Z',
        created_by: 'user-1',
        updated_at: '',
        updated_by: '',
        user_id: 'u1',
        dedupe_key: '',
        title: 'สวัสดี',
      },
    ]);
    const [journal] = rowsOf(store, JOURNAL_TABLE);
    expect(journal).toMatchObject({
      id: op.id,
      idempotency_key: op.idempotencyKey,
      status: 'applied',
      actor_id: 'user-1',
    });
    // ทุกอย่างอยู่ในไฟล์ system → เขียนครั้งเดียวแบบ atomic
    expect(store.writeCount).toBe(1);
  });

  it('stores formula-like text and leading zeros verbatim', () => {
    const op = operation([
      {
        op: 'insert',
        table: USERS,
        values: { id: 'u1', email: '=HYPERLINK("http://evil")', student_code: '00123' },
      },
    ]);
    expectOk(executeCommit(store, env, op));
    expect(rowsOf(store, USERS)[0]).toMatchObject({
      email: '=HYPERLINK("http://evil")',
      student_code: '00123',
    });
  });

  it('rejects unknown tables and columns without writing anything', () => {
    const unknownTable = expectFail(
      executeCommit(store, env, operation([{ op: 'insert', table: 'task.Tasks', values: { id: 't1' } }])),
    );
    expect(unknownTable.code).toBe('UNKNOWN_TABLE');

    const unknownColumn = expectFail(
      executeCommit(
        store,
        env,
        operation([{ op: 'insert', table: USERS, values: { id: 'u1', nickname: 'x' } }]),
      ),
    );
    expect(unknownColumn.code).toBe('UNKNOWN_COLUMN');
    expect(unknownColumn.columns).toEqual(['nickname']);
    expect(store.writeCount).toBe(0);
    expect(rowsOf(store, JOURNAL_TABLE)).toEqual([]);
  });

  it('rejects malformed operations', () => {
    const cases: Partial<WriteOperation>[] = [
      { idempotencyKey: '' },
      { now: 'not-a-date' },
      { mutations: [{ op: 'insert', table: USERS, values: {} }] },
      { mutations: [{ op: 'insert', table: 'NoDatabase', values: { id: 'x' } }] },
      {
        mutations: [
          { op: 'insert', table: USERS, values: { id: 'same' } },
          { op: 'update', table: USERS, id: 'same', set: { email: 'a' } },
        ],
      },
      { mutations: [{ op: 'update', table: USERS, id: 'u1', set: { id: 'u2' } }] },
    ];
    for (const overrides of cases) {
      const error = expectFail(executeCommit(store, env, operation([], overrides)));
      expect(error.code).toBe('INVALID_OPERATION');
      expect(error.retryable).toBe(false);
    }
    expect(store.writeCount).toBe(0);
  });
});

describe('executeCommit — optimistic version checking', () => {
  let store: MemoryTableStore;
  beforeEach(() => {
    store = createStore();
    expectOk(
      executeCommit(
        store,
        env,
        operation([
          { op: 'insert', table: APPROVALS, values: { id: 'a1', subject_id: 's1', status: 'pending' } },
        ]),
      ),
    );
  });

  it('updates a row, bumps the version and records who changed it', () => {
    const result = expectOk(
      executeCommit(
        store,
        env,
        operation(
          [{ op: 'update', table: APPROVALS, id: 'a1', set: { status: 'approved' }, expectedVersion: 1 }],
          { actorId: 'approver', now: '2026-11-24T04:00:00.000Z' },
        ),
      ),
    );
    expect(result.versions).toEqual({ [`${APPROVALS}:a1`]: 2 });
    expect(rowsOf(store, APPROVALS)[0]).toMatchObject({
      status: 'approved',
      version: '2',
      subject_id: 's1',
      created_by: 'user-1',
      updated_at: '2026-11-24T04:00:00.000Z',
      updated_by: 'approver',
    });
  });

  it('lets only one of two simultaneous approvals win', () => {
    const approve = () =>
      operation([
        { op: 'update', table: APPROVALS, id: 'a1', set: { status: 'approved' }, expectedVersion: 1 },
      ]);
    const reject = () =>
      operation([
        { op: 'update', table: APPROVALS, id: 'a1', set: { status: 'rejected' }, expectedVersion: 1 },
      ]);

    expectOk(executeCommit(store, env, approve()));
    const writesAfterFirst = store.writeCount;
    const error = expectFail(executeCommit(store, env, reject()));

    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.retryable).toBe(false);
    expect(store.writeCount).toBe(writesAfterFirst);
    expect(rowsOf(store, APPROVALS)[0]?.status).toBe('approved');
  });

  it('writes nothing at all when any mutation of the operation fails validation', () => {
    const before = store.writeCount;
    const error = expectFail(
      executeCommit(
        store,
        env,
        operation([
          { op: 'insert', table: REQUESTS, values: { id: 'r1', status: 'draft' } },
          { op: 'update', table: APPROVALS, id: 'a1', set: { status: 'x' }, expectedVersion: 7 },
        ]),
      ),
    );
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(store.writeCount).toBe(before);
    expect(rowsOf(store, REQUESTS)).toEqual([]);
  });

  it('reports NOT_FOUND for a missing row', () => {
    const error = expectFail(
      executeCommit(
        store,
        env,
        operation([{ op: 'update', table: APPROVALS, id: 'nope', set: { status: 'x' } }]),
      ),
    );
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('executeCommit — idempotency', () => {
  it('does not apply the same operation twice and returns the first result', () => {
    const store = createStore();
    const op = operation(
      [
        {
          op: 'insert',
          table: REQUESTS,
          values: { id: 'r1', reference_no: 'CL-2569-{{seq:ref:4}}', status: 'draft' },
        },
      ],
      { sequences: [{ name: 'ref', key: 'CL-2569' }], data: { requestId: 'r1', ref: '{{seq:ref:4}}' } },
    );

    const first = expectOk(executeCommit(store, env, op));
    const writes = store.writeCount;
    const second = expectOk(executeCommit(store, env, op));

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.sequences).toEqual({ ref: 1 });
    expect(second.data).toEqual({ requestId: 'r1', ref: '0001' });
    expect(store.writeCount).toBe(writes);
    expect(rowsOf(store, REQUESTS)).toHaveLength(1);
    expect(rowsOf(store, SEQUENCE_TABLE)[0]?.current_value).toBe('1');
  });

  it('treats a user-level retry (new row ids, same key) as the already completed request', () => {
    const store = createStore();
    const key = 'user-7:classLeave.createDraft:form-abc';
    const attempt = (rowId: string) =>
      operation([{ op: 'insert', table: REQUESTS, values: { id: rowId, status: 'draft' } }], {
        idempotencyKey: key,
        data: { requestId: rowId },
      });

    expectOk(executeCommit(store, env, attempt('row-first')));
    const retry = expectOk(executeCommit(store, env, attempt('row-second')));

    expect(retry.replayed).toBe(true);
    expect(retry.data.requestId).toBe('row-first');
    expect(rowsOf(store, REQUESTS).map((r) => r.id)).toEqual(['row-first']);
  });
});

describe('executeCommit — reference number sequences', () => {
  it('never issues the same number twice', () => {
    const store = createStore();
    const issued: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const id = `r${i}`;
      const result = expectOk(
        executeCommit(
          store,
          env,
          operation(
            [
              {
                op: 'insert',
                table: REQUESTS,
                values: { id, reference_no: 'CL-2569-{{seq:ref:4}}', status: 'draft' },
              },
            ],
            { sequences: [{ name: 'ref', key: 'CL-2569' }] },
          ),
        ),
      );
      issued.push(String(result.sequences.ref));
    }
    expect(new Set(issued).size).toBe(60);
    expect(issued[0]).toBe('1');
    expect(issued[59]).toBe('60');
    expect(rowsOf(store, REQUESTS).map((r) => r.reference_no)).toContain('CL-2569-0060');
    expect(rowsOf(store, SEQUENCE_TABLE)).toHaveLength(1);
    expect(rowsOf(store, SEQUENCE_TABLE)[0]).toMatchObject({ id: 'CL-2569', current_value: '60' });
  });

  it('keeps separate counters per key and supports several numbers in one operation', () => {
    const store = createStore();
    const result = expectOk(
      executeCommit(
        store,
        env,
        operation(
          [
            { op: 'insert', table: REQUESTS, values: { id: 'a', reference_no: 'CL-{{seq:first}}' } },
            { op: 'insert', table: REQUESTS, values: { id: 'b', reference_no: 'CL-{{seq:second}}' } },
            { op: 'insert', table: REQUESTS, values: { id: 'c', reference_no: 'MEMO-{{seq:memo:3}}' } },
          ],
          {
            sequences: [
              { name: 'first', key: 'CL-2569' },
              { name: 'second', key: 'CL-2569' },
              { name: 'memo', key: 'MEMO-2569' },
            ],
          },
        ),
      ),
    );
    expect(result.sequences).toEqual({ first: 1, second: 2, memo: 1 });
    expect(rowsOf(store, REQUESTS).map((r) => r.reference_no)).toEqual(['CL-1', 'CL-2', 'MEMO-001']);
  });

  it('does not consume a number when validation fails', () => {
    const store = createStore();
    expectFail(
      executeCommit(
        store,
        env,
        operation(
          [{ op: 'update', table: REQUESTS, id: 'missing', set: { reference_no: '{{seq:ref}}' } }],
          { sequences: [{ name: 'ref', key: 'CL-2569' }] },
        ),
      ),
    );
    expect(rowsOf(store, SEQUENCE_TABLE)).toEqual([]);
  });

  it('rejects tokens that reference an undeclared sequence', () => {
    const store = createStore();
    const error = expectFail(
      executeCommit(
        store,
        env,
        operation([{ op: 'insert', table: REQUESTS, values: { id: 'x', reference_no: '{{seq:nope}}' } }]),
      ),
    );
    expect(error.code).toBe('INVALID_OPERATION');
  });
});

describe('executeCommit — uniqueness', () => {
  let store: MemoryTableStore;
  const insertUser = (id: string, email: string) =>
    operation([{ op: 'insert', table: USERS, values: { id, email }, uniqueBy: [['email']] }]);

  beforeEach(() => {
    store = createStore();
    expectOk(executeCommit(store, env, insertUser('u1', 'a@example.test')));
  });

  it('rejects a duplicate natural key', () => {
    const error = expectFail(executeCommit(store, env, insertUser('u2', 'a@example.test')));
    expect(error.code).toBe('UNIQUE_VIOLATION');
    expect(error.columns).toEqual(['email']);
    expect(rowsOf(store, USERS)).toHaveLength(1);
  });

  it('rejects duplicates inside a single operation', () => {
    const error = expectFail(
      executeCommit(
        store,
        env,
        operation([
          { op: 'insert', table: USERS, values: { id: 'u2', email: 'b@example.test' }, uniqueBy: [['email']] },
          { op: 'insert', table: USERS, values: { id: 'u3', email: 'b@example.test' }, uniqueBy: [['email']] },
        ]),
      ),
    );
    expect(error.code).toBe('UNIQUE_VIOLATION');
  });

  it('skips the check when part of the key is empty', () => {
    const insert = (id: string) =>
      operation([
        {
          op: 'insert',
          table: NOTIFICATIONS,
          values: { id, user_id: 'u1', dedupe_key: '' },
          uniqueBy: [['user_id', 'dedupe_key']],
        },
      ]);
    expectOk(executeCommit(store, env, insert('n1')));
    expectOk(executeCommit(store, env, insert('n2')));
    expect(rowsOf(store, NOTIFICATIONS)).toHaveLength(2);
  });

  it('checks updates against other rows but not against the row itself', () => {
    expectOk(executeCommit(store, env, insertUser('u2', 'b@example.test')));

    const sameValue = operation([
      { op: 'update', table: USERS, id: 'u2', set: { email: 'b@example.test' }, uniqueBy: [['email']] },
    ]);
    expectOk(executeCommit(store, env, sameValue));

    const clash = operation([
      { op: 'update', table: USERS, id: 'u2', set: { email: 'a@example.test' }, uniqueBy: [['email']] },
    ]);
    expect(expectFail(executeCommit(store, env, clash)).code).toBe('UNIQUE_VIOLATION');
  });

  it('compares against the post-update value of rows changed in the same operation', () => {
    // u1 เปลี่ยนอีเมล และ u9 ใช้อีเมลเดิมของ u1 ในคำสั่งเดียวกัน → ไม่ชนกัน
    const swap = operation([
      { op: 'update', table: USERS, id: 'u1', set: { email: 'new@example.test' }, uniqueBy: [['email']] },
      { op: 'insert', table: USERS, values: { id: 'u9', email: 'a@example.test' }, uniqueBy: [['email']] },
    ]);
    expectOk(executeCommit(store, env, swap));

    // u1 ถูกแก้คอลัมน์อื่น (ไม่มี uniqueBy) แต่อีเมลยังเดิม → แถวใหม่ที่ใช้อีเมลนั้นต้องถูกปฏิเสธ
    const sneaky = operation([
      { op: 'update', table: USERS, id: 'u1', set: { student_code: '007' } },
      { op: 'insert', table: USERS, values: { id: 'u10', email: 'new@example.test' }, uniqueBy: [['email']] },
    ]);
    expect(expectFail(executeCommit(store, env, sneaky)).code).toBe('UNIQUE_VIOLATION');
  });
});

describe('executeCommit — operations spanning several spreadsheets', () => {
  const multiDbOperation = () =>
    operation(
      [
        {
          op: 'insert',
          table: REQUESTS,
          values: { id: 'r1', reference_no: 'CL-2569-{{seq:ref:4}}', status: 'pending_review' },
        },
        { op: 'insert', table: APPROVALS, values: { id: 'a1', subject_id: 'r1', status: 'pending' } },
        { op: 'insert', table: NOTIFICATIONS, values: { id: 'n1', user_id: 'head', title: 'รอพิจารณา' } },
      ],
      { sequences: [{ name: 'ref', key: 'CL-2569' }], action: 'classLeave.submit' },
    );

  it('writes every database, a ledger row per data file, and closes the journal last', () => {
    const store = createStore();
    const op = multiDbOperation();
    const result = expectOk(executeCommit(store, env, op));

    expect(result.touched).toEqual([APPROVALS, REQUESTS, SEQUENCE_TABLE, NOTIFICATIONS].sort());
    expect(rowsOf(store, 'classLeave._Ledger')).toEqual([
      { [LEDGER_HEADER[0]]: op.id, [LEDGER_HEADER[1]]: op.now },
    ]);
    expect(rowsOf(store, 'document._Ledger')).toHaveLength(1);
    expect(rowsOf(store, JOURNAL_TABLE)[0]).toMatchObject({
      status: 'applied',
      databases: JSON.stringify(['classLeave', 'document', 'system']),
      completed_at: op.now,
    });
    // reserve(system) + classLeave + document + system
    expect(store.writeCount).toBe(4);
  });

  it('resumes after a failure between spreadsheets without duplicating rows or numbers', () => {
    const store = createStore();
    const op = multiDbOperation();

    store.beforeApply = (db) => {
      if (db === 'document') throw new Error('simulated Sheets API outage');
    };
    const failed = expectFail(executeCommit(store, env, op));
    expect(failed.code).toBe('STORE_ERROR');
    expect(failed.retryable).toBe(true);

    // สถานะค้างครึ่งทาง: classLeave เขียนแล้ว document/system ยังไม่เขียน journal เป็น pending
    expect(rowsOf(store, REQUESTS)).toHaveLength(1);
    expect(rowsOf(store, APPROVALS)).toHaveLength(0);
    expect(rowsOf(store, NOTIFICATIONS)).toHaveLength(0);
    expect(rowsOf(store, JOURNAL_TABLE)[0]?.status).toBe('pending');
    expect(rowsOf(store, SEQUENCE_TABLE)[0]?.current_value).toBe('1');

    // คำสั่งอื่นที่เข้ามาระหว่างนั้นต้องได้เลขถัดไป ไม่ใช่เลขที่จองไว้แล้ว
    store.beforeApply = null;
    const other = expectOk(
      executeCommit(
        store,
        env,
        operation([{ op: 'insert', table: REQUESTS, values: { id: 'r2', reference_no: '{{seq:ref}}' } }], {
          sequences: [{ name: 'ref', key: 'CL-2569' }],
        }),
      ),
    );
    expect(other.sequences.ref).toBe(2);

    const resumed = expectOk(executeCommit(store, env, op));
    expect(resumed.sequences).toEqual({ ref: 1 });
    expect(rowsOf(store, REQUESTS).filter((r) => r.id === 'r1')).toHaveLength(1);
    expect(rowsOf(store, REQUESTS).find((r) => r.id === 'r1')?.reference_no).toBe('CL-2569-0001');
    expect(rowsOf(store, APPROVALS)).toHaveLength(1);
    expect(rowsOf(store, NOTIFICATIONS)).toHaveLength(1);
    expect(rowsOf(store, 'classLeave._Ledger').filter((r) => r.op_id === op.id)).toHaveLength(1);
    expect(rowsOf(store, JOURNAL_TABLE).find((r) => r.id === op.id)?.status).toBe('applied');
    expect(rowsOf(store, SEQUENCE_TABLE)[0]?.current_value).toBe('2');

    // เรียกซ้ำอีกครั้งหลังสำเร็จ → ไม่เขียนเพิ่ม
    const writes = store.writeCount;
    expect(expectOk(executeCommit(store, env, op)).replayed).toBe(true);
    expect(store.writeCount).toBe(writes);
  });

  it('resumes when only the final system write was lost', () => {
    const store = createStore();
    const op = multiDbOperation();
    let systemWrites = 0;
    store.beforeApply = (db) => {
      if (db === 'system') {
        systemWrites += 1;
        if (systemWrites === 2) throw new Error('lost connection');
      }
    };
    expectFail(executeCommit(store, env, op));
    store.beforeApply = null;

    expectOk(executeCommit(store, env, op));
    expect(rowsOf(store, REQUESTS)).toHaveLength(1);
    expect(rowsOf(store, APPROVALS)).toHaveLength(1);
    expect(rowsOf(store, NOTIFICATIONS)).toHaveLength(1);
    expect(rowsOf(store, JOURNAL_TABLE)).toHaveLength(1);
  });

  it('refuses to continue a half-applied operation with different content', () => {
    const store = createStore();
    const op = multiDbOperation();
    store.beforeApply = (db) => {
      if (db === 'document') throw new Error('outage');
    };
    expectFail(executeCommit(store, env, op));
    store.beforeApply = null;

    const differentAttempt = { ...multiDbOperation(), idempotencyKey: op.idempotencyKey };
    const error = expectFail(executeCommit(store, env, differentAttempt));
    expect(error.code).toBe('INCOMPLETE_OPERATION');
    expect(error.retryable).toBe(false);
    expect(rowsOf(store, APPROVALS)).toHaveLength(0);
  });
});

describe('executeCommit — audit log hash chain', () => {
  const auditInsert = (id: string, summary: string): Mutation => ({
    op: 'insert',
    table: AUDIT_TABLE,
    values: {
      id,
      actor_id: 'user-1',
      action: 'auth.login',
      category: 'auth',
      outcome: 'success',
      summary,
    },
  });

  function verifyChain(store: MemoryTableStore): boolean {
    let previous = AUDIT_GENESIS_HASH;
    for (const row of rowsOf(store, AUDIT_TABLE)) {
      if (row.prev_hash !== previous) return false;
      const expected = env.sha256Hex(
        [previous, ...AUDIT_HASH_FIELDS.map((field) => row[field] ?? '')].join('\u001f'),
      );
      if (row.row_hash !== expected) return false;
      previous = expected;
    }
    const head = rowsOf(store, AUDIT_CHAIN_TABLE)[0];
    return (
      head?.last_hash === previous &&
      Number(head?.entry_count) === rowsOf(store, AUDIT_TABLE).length
    );
  }

  it('links every audit row to the previous one and keeps the chain head', () => {
    const store = createStore();
    expectOk(executeCommit(store, env, operation([auditInsert('l1', 'เข้าสู่ระบบ')])));
    expectOk(
      executeCommit(store, env, operation([auditInsert('l2', 'ส่งคำร้อง'), auditInsert('l3', 'อนุมัติ')])),
    );

    const rows = rowsOf(store, AUDIT_TABLE);
    expect(rows[0]?.prev_hash).toBe(AUDIT_GENESIS_HASH);
    expect(rows[1]?.prev_hash).toBe(rows[0]?.row_hash);
    expect(rows[2]?.prev_hash).toBe(rows[1]?.row_hash);
    expect(rowsOf(store, AUDIT_CHAIN_TABLE)).toHaveLength(1);
    expect(rowsOf(store, AUDIT_CHAIN_TABLE)[0]).toMatchObject({
      id: 'head',
      entry_count: '3',
      last_hash: rows[2]?.row_hash,
      version: '2',
    });
    expect(verifyChain(store)).toBe(true);
  });

  it('makes tampering with or deleting an audit row detectable', () => {
    const store = createStore();
    for (const id of ['l1', 'l2', 'l3']) {
      expectOk(executeCommit(store, env, operation([auditInsert(id, `event ${id}`)])));
    }
    expect(verifyChain(store)).toBe(true);

    const edited = new MemoryTableStore(store.toJSON());
    const editedTable = edited.snapshot(AUDIT_TABLE);
    if (!editedTable) throw new Error('missing audit table');
    const summaryIndex = editedTable.header.indexOf('summary');
    const tampered = editedTable.rows.map((row, index) =>
      index === 1 ? row.map((cell, i) => (i === summaryIndex ? 'แก้ไขย้อนหลัง' : cell)) : row,
    );
    const editedStore = new MemoryTableStore({
      ...edited.toJSON(),
      [AUDIT_TABLE]: { header: editedTable.header, rows: tampered },
    });
    expect(verifyChain(editedStore)).toBe(false);

    const deletedStore = new MemoryTableStore({
      ...store.toJSON(),
      [AUDIT_TABLE]: { header: editedTable.header, rows: editedTable.rows.slice(0, 2) },
    });
    expect(verifyChain(deletedStore)).toBe(false);
  });
});
