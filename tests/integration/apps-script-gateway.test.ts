import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { constantTimeEquals, handle, toHex } from '../../apps-script/src/main';
import { columnLetter, quoteSheet } from '../../apps-script/src/sheets-store';
import {
  AppsScriptGatewayClient,
  signEnvelope,
  type SchemaSpec,
} from '@/lib/storage/apps-script-client';
import { LEDGER_HEADER, type WriteOperation } from '@/lib/storage/gateway-core';
import { createFakeRuntime, type FakeRuntimeControls } from '../fakes/apps-script-runtime';

const SECRET = 'shared-secret-for-tests-only-0123456789';
const IDS = { system: 'ss-system', classLeave: 'ss-class-leave', master: 'ss-master' };
const MANAGED = ['version', 'created_at', 'created_by', 'updated_at', 'updated_by'];

const SPEC: SchemaSpec = {
  databases: {
    system: {
      OperationLogs: [
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
      ],
      DocumentSequences: ['id', ...MANAGED, 'current_value'],
      Notifications: ['id', ...MANAGED, 'user_id', 'dedupe_key', 'title'],
      _Ledger: [...LEDGER_HEADER],
    },
    classLeave: {
      ClassLeaveRequests: ['id', ...MANAGED, 'reference_no', 'status', 'activity_name'],
      _Ledger: [...LEDGER_HEADER],
    },
    master: {
      Students: ['id', ...MANAGED, 'student_code', 'first_name'],
      _Ledger: [...LEDGER_HEADER],
    },
  },
};

function createClient(fake: FakeRuntimeControls, secret = SECRET) {
  const fetchImpl: typeof fetch = async (_url, init) => {
    const result = handle(fake.runtime, { postData: { contents: String(init?.body) } });
    return new Response(JSON.stringify(result), { status: 200 });
  };
  return new AppsScriptGatewayClient({
    url: 'https://script.google.com/macros/s/TEST/exec',
    secret,
    spreadsheets: IDS,
    fetch: fetchImpl,
    sleep: async () => {},
  });
}

function operation(overrides: Partial<WriteOperation> = {}): WriteOperation {
  return {
    id: randomUUID(),
    idempotencyKey: randomUUID(),
    action: 'test',
    actorId: 'user-1',
    now: '2026-11-24T03:00:00.000Z',
    mutations: [],
    ...overrides,
  };
}

function rawRequest(envelope: Record<string, unknown>, secret = SECRET) {
  const body = JSON.stringify(envelope);
  return { postData: { contents: JSON.stringify({ envelope: body, sig: signEnvelope(body, secret) }) } };
}

const validEnvelope = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  ts: Date.now(),
  nonce: randomUUID(),
  command: 'ping',
  spreadsheets: IDS,
  payload: {},
  ...overrides,
});

describe('Apps Script Write Gateway', () => {
  let fake: FakeRuntimeControls;

  beforeEach(() => {
    fake = createFakeRuntime();
    fake.properties.set('GATEWAY_SHARED_SECRET', SECRET);
    for (const id of Object.values(IDS)) fake.createSpreadsheet(id);
  });

  describe('request authentication', () => {
    const expectUnauthorized = (result: unknown) =>
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED', retryable: false } });

    it('accepts a correctly signed request', () => {
      expect(handle(fake.runtime, rawRequest(validEnvelope()))).toMatchObject({ ok: true, version: 1 });
    });

    it('rejects requests signed with another secret', () => {
      expectUnauthorized(handle(fake.runtime, rawRequest(validEnvelope(), 'wrong-secret')));
    });

    it('rejects a tampered envelope', () => {
      const request = rawRequest(validEnvelope());
      const parsed = JSON.parse(request.postData.contents) as { envelope: string; sig: string };
      parsed.envelope = parsed.envelope.replace('"ping"', '"commit"');
      expectUnauthorized(handle(fake.runtime, { postData: { contents: JSON.stringify(parsed) } }));
    });

    it('rejects unsigned, malformed and empty bodies', () => {
      expectUnauthorized(handle(fake.runtime, { postData: { contents: '' } }));
      expectUnauthorized(handle(fake.runtime, { postData: { contents: '{"envelope":"{}"}' } }));
      expectUnauthorized(handle(fake.runtime, {}));
    });

    it('rejects stale timestamps', () => {
      const stale = validEnvelope({ ts: Date.now() - 6 * 60 * 1000 });
      expectUnauthorized(handle(fake.runtime, rawRequest(stale)));
    });

    it('rejects a replayed request', () => {
      const request = rawRequest(validEnvelope());
      expect(handle(fake.runtime, request)).toMatchObject({ ok: true });
      expectUnauthorized(handle(fake.runtime, request));
    });

    it('refuses everything when the secret is not configured', () => {
      fake.properties.delete('GATEWAY_SHARED_SECRET');
      expectUnauthorized(handle(fake.runtime, rawRequest(validEnvelope())));
    });

    it('performs no Sheets call for an unauthorised request', () => {
      handle(fake.runtime, rawRequest(validEnvelope({ command: 'commit' }), 'wrong-secret'));
      expect(fake.apiCalls).toBe(0);
    });
  });

  describe('ensureSchema', () => {
    it('creates worksheets, header rows and text formatting', async () => {
      const result = await createClient(fake).ensureSchema(SPEC);
      expect(result.createdTables).toHaveLength(8);
      expect(result.checkedTables).toBe(8);
      expect(fake.grid(IDS.master, 'Students')[0]).toEqual(SPEC.databases.master?.Students);
      const students = fake.spreadsheets.get(IDS.master)?.sheets.find((s) => s.title === 'Students');
      expect(students?.textFormatted).toBe(true);
    });

    it('is idempotent and never removes existing worksheets or data', async () => {
      const client = createClient(fake);
      await client.ensureSchema(SPEC);
      await client.commit(
        operation({
          mutations: [
            { op: 'insert', table: 'master.Students', values: { id: 's1', student_code: '00123' } },
          ],
        }),
      );
      const second = await client.ensureSchema(SPEC);
      expect(second.createdTables).toEqual([]);
      expect(second.addedColumns).toEqual([]);
      expect(fake.records(IDS.master, 'Students')).toHaveLength(1);
      // Worksheet ตั้งต้นของไฟล์ไม่ถูกลบ
      expect(fake.spreadsheets.get(IDS.master)?.sheets.some((s) => s.title === 'Sheet1')).toBe(true);
    });

    it('appends only the missing columns to an existing worksheet', async () => {
      const client = createClient(fake);
      await client.ensureSchema(SPEC);
      const extended: SchemaSpec = {
        databases: {
          master: {
            Students: [...(SPEC.databases.master?.Students ?? []), 'last_name', 'status'],
          },
        },
      };
      const result = await client.ensureSchema(extended);
      expect(result.createdTables).toEqual([]);
      expect(result.addedColumns).toEqual(['master.Students.last_name', 'master.Students.status']);
      expect(fake.grid(IDS.master, 'Students')[0]?.slice(-2)).toEqual(['last_name', 'status']);
    });
  });

  describe('commit', () => {
    beforeEach(async () => {
      await createClient(fake).ensureSchema(SPEC);
      fake.log.length = 0;
    });

    it('writes text verbatim: leading zeros and formula-like strings survive', async () => {
      const result = await createClient(fake).commit(
        operation({
          mutations: [
            {
              op: 'insert',
              table: 'master.Students',
              values: { id: 's1', student_code: '00123', first_name: '=IMPORTXML("http://x")' },
            },
          ],
        }),
      );
      expect(result.ok).toBe(true);
      expect(fake.records(IDS.master, 'Students')[0]).toMatchObject({
        id: 's1',
        version: '1',
        student_code: '00123',
        first_name: '=IMPORTXML("http://x")',
      });
    });

    it('performs every write while holding the script lock, then releases it', async () => {
      await createClient(fake).commit(
        operation({
          mutations: [
            { op: 'insert', table: 'classLeave.ClassLeaveRequests', values: { id: 'r1', status: 'draft' } },
            { op: 'insert', table: 'system.Notifications', values: { id: 'n1', user_id: 'u1' } },
          ],
        }),
      );
      expect(fake.log[0]).toBe('lock:acquired');
      expect(fake.log[fake.log.length - 1]).toBe('lock:released');
      expect(fake.log.filter((entry) => entry.startsWith('batchUpdate')).length).toBeGreaterThan(0);
      expect(fake.log.some((entry) => entry.endsWith('UNLOCKED'))).toBe(false);
      expect(fake.lock.held).toBe(false);
    });

    it('reports LOCK_TIMEOUT when another write holds the lock', async () => {
      fake.lock.available = false;
      const result = await createClient(fake).commit(
        operation({
          mutations: [{ op: 'insert', table: 'master.Students', values: { id: 's1', student_code: '1' } }],
        }),
      );
      expect(result).toMatchObject({ ok: false, error: { code: 'LOCK_TIMEOUT', retryable: true } });
      expect(fake.records(IDS.master, 'Students')).toEqual([]);
    });

    it('issues sequential reference numbers and updates rows with version checks', async () => {
      const client = createClient(fake);
      const create = (id: string) =>
        client.commit(
          operation({
            mutations: [
              {
                op: 'insert',
                table: 'classLeave.ClassLeaveRequests',
                values: { id, reference_no: 'CL-2569-{{seq:ref:4}}', status: 'draft' },
              },
            ],
            sequences: [{ name: 'ref', key: 'CL-2569' }],
          }),
        );
      await create('r1');
      await create('r2');
      expect(fake.records(IDS.classLeave, 'ClassLeaveRequests').map((r) => r.reference_no)).toEqual([
        'CL-2569-0001',
        'CL-2569-0002',
      ]);

      const approve = () =>
        client.commit(
          operation({
            mutations: [
              {
                op: 'update',
                table: 'classLeave.ClassLeaveRequests',
                id: 'r2',
                set: { status: 'approved' },
                expectedVersion: 1,
              },
            ],
          }),
        );
      expect((await approve()).ok).toBe(true);
      expect(await approve()).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });
      expect(fake.records(IDS.classLeave, 'ClassLeaveRequests')[1]).toMatchObject({
        id: 'r2',
        status: 'approved',
        version: '2',
        reference_no: 'CL-2569-0002',
      });
      expect(fake.records(IDS.classLeave, 'ClassLeaveRequests')[0]?.status).toBe('draft');
    });

    it('retries the identical operation after an outage and completes it exactly once', async () => {
      const client = createClient(fake);
      let outage = true;
      fake.failBatchUpdate = (spreadsheetId) => {
        if (spreadsheetId === IDS.classLeave && outage) {
          outage = false;
          return true;
        }
        return false;
      };
      const result = await client.commit(
        operation({
          mutations: [
            {
              op: 'insert',
              table: 'classLeave.ClassLeaveRequests',
              values: { id: 'r1', reference_no: '{{seq:ref}}', status: 'draft' },
            },
            { op: 'insert', table: 'system.Notifications', values: { id: 'n1', user_id: 'u1' } },
          ],
          sequences: [{ name: 'ref', key: 'CL-2569' }],
        }),
      );
      expect(result.ok).toBe(true);
      expect(fake.records(IDS.classLeave, 'ClassLeaveRequests')).toHaveLength(1);
      expect(fake.records(IDS.system, 'Notifications')).toHaveLength(1);
      expect(fake.records(IDS.system, 'OperationLogs')).toHaveLength(1);
      expect(fake.records(IDS.system, 'OperationLogs')[0]?.status).toBe('applied');
      expect(fake.records(IDS.system, 'DocumentSequences')[0]?.current_value).toBe('1');
    });

    it('returns the stored result when the same idempotency key is sent again', async () => {
      const client = createClient(fake);
      const op = operation({
        mutations: [{ op: 'insert', table: 'master.Students', values: { id: 's1', student_code: '7' } }],
        data: { studentId: 's1' },
      });
      const first = await client.commit(op);
      const second = await client.commit(op);
      expect(first).toMatchObject({ ok: true, replayed: false });
      expect(second).toMatchObject({ ok: true, replayed: true, data: { studentId: 's1' } });
      expect(fake.records(IDS.master, 'Students')).toHaveLength(1);
    });

    it('fails clearly when a worksheet is missing instead of writing elsewhere', async () => {
      const result = await createClient(fake).commit(
        operation({ mutations: [{ op: 'insert', table: 'master.Teachers', values: { id: 't1' } }] }),
      );
      expect(result).toMatchObject({ ok: false, error: { code: 'UNKNOWN_TABLE' } });
    });
  });

  describe('helpers', () => {
    it('converts signed bytes to hex and compares in constant time', () => {
      expect(toHex([0, 15, -1, 127, -128])).toBe('000fff7f80');
      expect(constantTimeEquals('abc', 'abc')).toBe(true);
      expect(constantTimeEquals('abc', 'abd')).toBe(false);
      expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    });

    it('builds A1 column letters and quotes sheet names', () => {
      expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
        'A',
        'Z',
        'AA',
        'AB',
        'AZ',
        'BA',
        'ZZ',
        'AAA',
      ]);
      expect(quoteSheet("O'Brien")).toBe("'O''Brien'");
    });
  });
});

describe('bundled apps-script/dist/Code.gs', () => {
  it('runs the deployable artifact end to end in an isolated context', async () => {
    const { readFileSync } = await import('node:fs');
    const { runInNewContext } = await import('node:vm');
    const fake = createFakeRuntime();
    fake.properties.set('GATEWAY_SHARED_SECRET', SECRET);
    for (const id of Object.values(IDS)) fake.createSpreadsheet(id);

    // โหลดไฟล์ที่จะนำไปวางใน Apps Script จริง โดยให้ global ของ Apps Script เป็นตัวจำลอง
    const sandbox: Record<string, unknown> = { ...fake.runtime };
    runInNewContext(readFileSync('apps-script/dist/Code.gs', 'utf8'), sandbox);
    const doPost = sandbox.doPost as (event: unknown) => { content: string };
    const call = (command: string, payload: unknown) =>
      JSON.parse(doPost(rawRequest(validEnvelope({ command, payload }))).content) as Record<
        string,
        unknown
      >;

    expect(call('ensureSchema', SPEC)).toMatchObject({ ok: true, checkedTables: 8 });
    const committed = call(
      'commit',
      operation({
        mutations: [
          {
            op: 'insert',
            table: 'classLeave.ClassLeaveRequests',
            values: { id: 'r1', reference_no: 'CL-2569-{{seq:ref:4}}', status: 'draft' },
          },
        ],
        sequences: [{ name: 'ref', key: 'CL-2569' }],
      }),
    );
    expect(committed).toMatchObject({ ok: true, sequences: { ref: 1 } });
    expect(fake.records(IDS.classLeave, 'ClassLeaveRequests')[0]?.reference_no).toBe('CL-2569-0001');
    expect(JSON.parse((sandbox.doGet as () => { content: string })().content)).toMatchObject({
      ok: true,
      version: 1,
    });
  });
});
