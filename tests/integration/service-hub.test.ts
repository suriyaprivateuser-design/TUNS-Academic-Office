import { beforeEach, describe, expect, it } from 'vitest';
import type { LinkCheckDeps } from '@/lib/security/link-check';
import {
  AcademicServices,
  ServiceAccessLogs,
  ServiceHealthChecks,
} from '@/schemas/database/service-hub';
import { AuditLogs } from '@/schemas/database/system';
import { EMPTY_SERVICE_INPUT, type ServiceInput } from '@/schemas/forms/service';
import { demoUserId, seedDemoData } from '@/services/demo-seed';
import { loadCurrentUser, type CurrentUser } from '@/services/identity';
import {
  checkServiceLink,
  getDirectory,
  getPersonalHub,
  getUsageStats,
  listManagedServices,
  openService,
  patchService,
  reorderServices,
  saveService,
  setFavorite,
} from '@/services/service-hub';
import { createTestContext } from '../helpers/context';

type Context = ReturnType<typeof createTestContext>;

const CATEGORY = 'svc-cat-academic';
// โดเมนสำหรับเอกสารและการทดสอบตาม RFC 2606 — ไม่ใช่ URL ของโรงเรียน
const EXAMPLE_URL = 'https://service.example.test/app';

describe('academic service hub', () => {
  let ctx: Context;
  const users: Record<string, CurrentUser> = {};

  const as = (key: string) => {
    const user = users[key];
    if (!user) throw new Error(`unknown persona ${key}`);
    return user;
  };

  const input = (overrides: Partial<ServiceInput> = {}): ServiceInput => ({
    ...EMPTY_SERVICE_INPUT,
    categoryId: CATEGORY,
    nameTh: 'ระบบทดสอบ',
    ...overrides,
  });

  const visibleIds = async (key: string) =>
    (await getDirectory(ctx.db, as(key))).services.map((service) => service.id);

  beforeEach(async () => {
    ctx = createTestContext();
    await seedDemoData(ctx.db, { samples: false });
    for (const key of ['admin', 'staff', 'teacher-sci', 'head-sci', 'director', 'auditor']) {
      const user = await loadCurrentUser(ctx.db, demoUserId(key));
      if (!user) throw new Error(`persona ${key} was not seeded`);
      users[key] = user;
    }
  });

  describe('directory', () => {
    it('lists the seeded catalogue without inventing any school URL', async () => {
      const { services, categories } = await getDirectory(ctx.db, as('teacher-sci'));
      expect(categories.length).toBeGreaterThan(0);
      expect(services.length).toBeGreaterThan(10);
      const rows = await ctx.db.repo(AcademicServices).all();
      // ข้อ 40: ห้ามสร้าง URL ระบบโรงเรียนขึ้นเอง — รายการตั้งต้นใส่ได้เฉพาะ URL ทางการของ
      // เครื่องมือสาธารณะ (Google Workspace) ส่วนระบบของโรงเรียนและหน่วยงานต้นสังกัดต้องเว้นว่าง
      const publicTools = ['drive.google.com', 'calendar.google.com', 'docs.google.com', 'classroom.google.com'];
      for (const row of rows.filter((item) => item.url)) {
        expect(publicTools).toContain(new URL(row.url ?? '').hostname);
      }
      const schoolOwned = rows.filter((row) => row.category_id !== 'svc-cat-external' && row.link_type === 'external');
      expect(schoolOwned.length).toBeGreaterThan(10);
      expect(schoolOwned.filter((row) => row.url)).toEqual([]);
      for (const row of schoolOwned) {
        const view = services.find((service) => service.id === row.id);
        expect(view).toMatchObject({ configured: false, href: null });
      }
    });

    it('opens a service only through the stored target and records the open', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }));
      const directory = await getDirectory(ctx.db, as('teacher-sci'));
      expect(directory.services.find((service) => service.id === id)?.href).toBe(`/go/${id}`);

      const target = await openService(ctx.db, as('teacher-sci'), id, 'hub');
      expect(target).toEqual({ type: 'external', url: EXAMPLE_URL });
      const logs = await ctx.db.repo(ServiceAccessLogs).filter((log) => log.service_id === id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ user_id: as('teacher-sci').id, source: 'hub' });
    });

    it('refuses to open services that are unconfigured, under maintenance or unknown', async () => {
      await expect(openService(ctx.db, as('teacher-sci'), 'svc-assessment', 'hub')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      const { id } = await saveService(
        ctx.db,
        as('staff'),
        input({ url: EXAMPLE_URL, status: 'maintenance' }),
      );
      await expect(openService(ctx.db, as('teacher-sci'), id, 'hub')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      await expect(openService(ctx.db, as('teacher-sci'), 'no-such-service', 'hub')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await ctx.db.repo(ServiceAccessLogs).all()).toEqual([]);
    });
  });

  describe('favourites and personal hub', () => {
    it('keeps favourites per user and derives recent and frequent from that user only', async () => {
      const first = await saveService(ctx.db, as('staff'), input({ nameTh: 'ระบบหนึ่ง', url: EXAMPLE_URL }));
      const second = await saveService(
        ctx.db,
        as('staff'),
        input({ nameTh: 'ระบบสอง', url: `${EXAMPLE_URL}/2` }),
      );
      await setFavorite(ctx.db, as('teacher-sci'), first.id, true);
      await openService(ctx.db, as('teacher-sci'), first.id, 'hub');
      await openService(ctx.db, as('teacher-sci'), second.id, 'hub');
      await openService(ctx.db, as('teacher-sci'), second.id, 'launcher');
      await openService(ctx.db, as('head-sci'), first.id, 'hub');

      const mine = await getPersonalHub(ctx.db, as('teacher-sci'));
      expect(mine.favorites.map((service) => service.id)).toEqual([first.id]);
      expect(mine.frequent[0]?.id).toBe(second.id);
      expect(mine.recent.map((service) => service.id).sort()).toEqual([first.id, second.id].sort());

      const other = await getPersonalHub(ctx.db, as('head-sci'));
      expect(other.favorites).toEqual([]);
      expect(other.recent.map((service) => service.id)).toEqual([first.id]);

      await setFavorite(ctx.db, as('teacher-sci'), first.id, false);
      expect((await getPersonalHub(ctx.db, as('teacher-sci'))).favorites).toEqual([]);
    });

    it('does not let a user favourite a service they cannot see', async () => {
      const { id } = await saveService(
        ctx.db,
        as('staff'),
        input({ url: EXAMPLE_URL, audience: 'restricted', roleIds: ['director'] }),
      );
      await expect(setFavorite(ctx.db, as('teacher-sci'), id, true)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('link management', () => {
    it('is limited to roles that manage the hub', async () => {
      await expect(saveService(ctx.db, as('teacher-sci'), input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(listManagedServices(ctx.db, as('teacher-sci'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(saveService(ctx.db, as('auditor'), input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(reorderServices(ctx.db, as('director'), CATEGORY, [])).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it.each([
      ['javascript:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['file:///etc/passwd'],
      ['ftp://files.example.test/'],
      ['https://user:secret@service.example.test/'],
      ['not a url'],
    ])('rejects the unsafe URL %s', async (url) => {
      await expect(saveService(ctx.db, as('staff'), input({ url }))).rejects.toMatchObject({
        code: 'VALIDATION',
        fieldErrors: { url: expect.any(String) },
      });
    });

    it('rejects internal paths that would leave the application', async () => {
      for (const internalPath of ['//evil.example.test', 'https://evil.example.test', 'class-leave', '/\\evil']) {
        await expect(
          saveService(ctx.db, as('staff'), input({ linkType: 'internal', internalPath })),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      }
    });

    it('creates a service, writes an audit entry and appends it to its category', async () => {
      const before = (await ctx.db.repo(AcademicServices).filter((row) => row.category_id === CATEGORY)).length;
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL, isPinned: true }));
      const row = await ctx.db.repo(AcademicServices).byId(id);
      expect(row).toMatchObject({ url: EXAMPLE_URL, is_pinned: true, sort_order: before + 1, version: 1 });
      const audit = await ctx.db.repo(AuditLogs).filter((log) => log.entity_id === id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: 'services.create', actor_id: as('staff').id });
    });

    it('detects two administrators editing the same service', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }));
      await saveService(ctx.db, as('staff'), input({ nameTh: 'แก้ครั้งที่หนึ่ง' }), { id, expectedVersion: 1 });
      await expect(
        saveService(ctx.db, as('admin'), input({ nameTh: 'แก้ทับ' }), { id, expectedVersion: 1 }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect((await ctx.db.repo(AcademicServices).byId(id))?.name_th).toBe('แก้ครั้งที่หนึ่ง');
    });

    it('clears the last link-check result when the URL changes', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }));
      await checkServiceLink(ctx.db, as('staff'), id, okDeps());
      expect((await ctx.db.repo(AcademicServices).byId(id))?.last_check_result).toBe('ok');
      const current = await ctx.db.repo(AcademicServices).byId(id);
      await saveService(ctx.db, as('staff'), input({ url: `${EXAMPLE_URL}/moved` }), {
        id,
        expectedVersion: current?.version ?? 0,
      });
      expect((await ctx.db.repo(AcademicServices).byId(id))?.last_check_result).toBeNull();
    });

    it('requires at least one role for a restricted service', async () => {
      await expect(
        saveService(ctx.db, as('staff'), input({ audience: 'restricted', roleIds: [] })),
      ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { roleIds: expect.any(String) } });
    });

    it('shows a restricted service only to its roles, and revokes access when a role is removed', async () => {
      const { id } = await saveService(
        ctx.db,
        as('staff'),
        input({ url: EXAMPLE_URL, audience: 'restricted', roleIds: ['teacher', 'director'] }),
      );
      expect(await visibleIds('teacher-sci')).toContain(id);
      expect(await visibleIds('director')).toContain(id);
      expect(await visibleIds('auditor')).not.toContain(id);

      // ถอนบทบาท "ครู" ออก — ครูต้องมองไม่เห็นและเปิดไม่ได้ทันที
      let version = (await ctx.db.repo(AcademicServices).byId(id))?.version ?? 0;
      await saveService(
        ctx.db,
        as('staff'),
        input({ url: EXAMPLE_URL, audience: 'restricted', roleIds: ['director'] }),
        { id, expectedVersion: version },
      );
      expect(await visibleIds('teacher-sci')).not.toContain(id);
      await expect(openService(ctx.db, as('teacher-sci'), id, 'hub')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await visibleIds('director')).toContain(id);
      const managed = (await listManagedServices(ctx.db, as('staff'))).services.find((s) => s.id === id);
      expect(managed?.roleIds).toEqual(['director']);

      // ให้สิทธิ์กลับคืนได้ (แถวเดิมถูกเปิดใช้ใหม่ ไม่ชนกับ unique key)
      version = (await ctx.db.repo(AcademicServices).byId(id))?.version ?? 0;
      await saveService(
        ctx.db,
        as('staff'),
        input({ url: EXAMPLE_URL, audience: 'restricted', roleIds: ['teacher'] }),
        { id, expectedVersion: version },
      );
      expect(await visibleIds('teacher-sci')).toContain(id);
      expect(await visibleIds('director')).not.toContain(id);

      // เปลี่ยนเป็นทุกคน แล้วกลับมาจำกัดอีกครั้ง — บทบาทเก่าต้องไม่ติดค้าง
      version = (await ctx.db.repo(AcademicServices).byId(id))?.version ?? 0;
      await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }), { id, expectedVersion: version });
      expect(await visibleIds('auditor')).toContain(id);
      version = (await ctx.db.repo(AcademicServices).byId(id))?.version ?? 0;
      await saveService(
        ctx.db,
        as('staff'),
        input({ url: EXAMPLE_URL, audience: 'restricted', roleIds: ['auditor'] }),
        { id, expectedVersion: version },
      );
      expect(await visibleIds('auditor')).toContain(id);
      expect(await visibleIds('teacher-sci')).not.toContain(id);
    });

    it('hides, pins, archives and restores without deleting the row', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }));
      await patchService(ctx.db, as('staff'), id, { isVisible: false }, 1);
      expect(await visibleIds('teacher-sci')).not.toContain(id);
      await patchService(ctx.db, as('staff'), id, { isVisible: true, isPinned: true }, 2);
      expect((await getPersonalHub(ctx.db, as('teacher-sci'))).pinned.map((s) => s.id)).toContain(id);

      await patchService(ctx.db, as('staff'), id, { archived: true }, 3);
      expect(await visibleIds('teacher-sci')).not.toContain(id);
      const archived = (await listManagedServices(ctx.db, as('staff'))).services.find((s) => s.id === id);
      expect(archived).toMatchObject({ archived: true, isVisible: false });

      // กู้คืนแล้วยังซ่อนอยู่จนกว่าผู้ดูแลจะเปิดแสดงเอง
      await patchService(ctx.db, as('staff'), id, { archived: false }, 4);
      expect(await visibleIds('teacher-sci')).not.toContain(id);
      expect(await ctx.db.repo(AcademicServices).byId(id)).toMatchObject({ archived_at: null, is_visible: false });
      await expect(patchService(ctx.db, as('staff'), id, { isVisible: true }, 1)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('reorders services inside a category and rejects a stale list', async () => {
      const rows = (await ctx.db.repo(AcademicServices).filter((row) => row.category_id === CATEGORY)).sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const reversed = rows.map((row) => row.id).reverse();
      await reorderServices(ctx.db, as('staff'), CATEGORY, reversed);
      const directory = await getDirectory(ctx.db, as('teacher-sci'));
      const unpinned = directory.services.filter((s) => s.categoryId === CATEGORY && !s.isPinned).map((s) => s.id);
      expect(unpinned).toEqual(reversed.filter((id) => unpinned.includes(id)));

      await expect(reorderServices(ctx.db, as('staff'), CATEGORY, reversed.slice(1))).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      await expect(
        reorderServices(ctx.db, as('staff'), CATEGORY, [...reversed.slice(1), 'svc-from-elsewhere']),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('link check', () => {
    it('stores the outcome and never contacts a private address', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }));
      const sent: string[] = [];
      const outcome = await checkServiceLink(ctx.db, as('staff'), id, {
        resolve: async () => [{ address: '10.0.0.8', family: 4 }],
        send: async (url) => {
          sent.push(url.toString());
          return { status: 200, location: null };
        },
      });
      expect(outcome.result).toBe('unsafe');
      expect(sent).toEqual([]);
      const checks = await ctx.db.repo(ServiceHealthChecks).filter((check) => check.service_id === id);
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ result: 'unsafe', checked_by: as('staff').id });
    });

    it('distinguishes a working link, a sign-in wall and a broken link', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ url: EXAMPLE_URL }));
      expect((await checkServiceLink(ctx.db, as('staff'), id, okDeps(200))).result).toBe('ok');
      expect((await checkServiceLink(ctx.db, as('staff'), id, okDeps(401))).result).toBe('auth_required');
      expect((await checkServiceLink(ctx.db, as('staff'), id, okDeps(404))).result).toBe('broken');
      expect((await ctx.db.repo(AcademicServices).byId(id))?.last_check_result).toBe('broken');
    });

    it('is refused for people who cannot manage the hub and for services without an external link', async () => {
      await expect(checkServiceLink(ctx.db, as('teacher-sci'), 'svc-assessment', okDeps())).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(checkServiceLink(ctx.db, as('staff'), 'svc-assessment', okDeps())).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });
  });

  describe('usage statistics', () => {
    it('counts link opens for those allowed to see organisation-wide numbers', async () => {
      const { id } = await saveService(ctx.db, as('staff'), input({ nameTh: 'ระบบยอดนิยม', url: EXAMPLE_URL }));
      await openService(ctx.db, as('teacher-sci'), id, 'hub');
      await openService(ctx.db, as('head-sci'), id, 'workspace');

      await expect(getUsageStats(ctx.db, as('teacher-sci'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const stats = await getUsageStats(ctx.db, as('staff'));
      expect(stats.totalOpens).toBe(2);
      expect(stats.topServices[0]).toEqual({ id, name: 'ระบบยอดนิยม', opens: 2 });
      expect(stats.monthly.reduce((sum, month) => sum + month.opens, 0)).toBe(2);
      expect(stats.monthly).toHaveLength(1);

      // สามเดือนถัดมาโดยไม่มีการเปิดลิงก์เพิ่ม: เดือนที่ว่างต้องอยู่ในชุดข้อมูลเป็น 0 ไม่ถูกตัดทิ้ง
      const later = await getUsageStats(ctx.db, as('staff'), Date.now() + 92 * 24 * 3600_000);
      expect(later.monthly.length).toBeGreaterThanOrEqual(3);
      expect(later.monthly[0]?.opens).toBe(2);
      expect(later.monthly.slice(1).every((month) => month.opens === 0)).toBe(true);
      const keys = later.monthly.map((month) => month.month);
      expect(keys).toEqual([...keys].sort());
      expect(new Set(keys).size).toBe(keys.length);

      // เกิน 12 เดือน: แสดงเฉพาะ 12 เดือนล่าสุด
      const muchLater = await getUsageStats(ctx.db, as('staff'), Date.now() + 500 * 24 * 3600_000);
      expect(muchLater.monthly).toHaveLength(12);
      expect(muchLater.monthly.every((month) => month.opens === 0)).toBe(true);
      expect(muchLater.totalOpens).toBe(2);
      // ชุดข้อมูลนี้ไม่มีบริการที่ตั้งค่าลิงก์แล้วแต่ปิดให้บริการ ทุกบริการจึงเป็น “เปิดใช้ได้” หรือ “ยังไม่ตั้งค่า”
      expect(stats.active + stats.notConfigured).toBe(stats.total);
      expect(stats.notConfigured).toBeGreaterThan(0);
    });
  });
});

/** ปลายทางสาธารณะจำลองที่ตอบ status ตามที่กำหนด (ไม่ออกเครือข่ายจริง) */
function okDeps(status = 200): Partial<LinkCheckDeps> {
  return {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    send: async () => ({ status, location: null }),
  };
}
