/**
 * Academic Service Hub Service (Module 09) — ศูนย์รวมระบบและบริการวิชาการ
 *
 * - บริการที่ยังไม่มี URL แสดงสถานะ “ยังไม่ได้ตั้งค่าลิงก์” และเปิดไม่ได้ (ไม่มีปุ่มที่กดแล้วไม่ทำงาน)
 * - การเปิดลิงก์ผ่าน `/go/[id]` ที่ตรวจสิทธิ์และบันทึกสถิติ — นับ “ครั้งที่เปิดลิงก์”
 *   ไม่ใช่จำนวนผู้ใช้ของเว็บไซต์ปลายทาง
 * - ผู้ดูแลเพิ่ม/แก้ไข/จัดเรียงลิงก์ได้โดยไม่แก้โค้ด ทุกการแก้ไขบันทึก Audit Log
 */
import 'server-only';
import type { IconKey } from '@/config/icons';
import type { LinkCheckResult, ServiceStatus } from '@/config/reference';
import { ROLE_IDS } from '@/config/roles';
import { safeInternalPath } from '@/config/routes';
import { forbidden, notFound, validation } from '@/lib/errors';
import { checkLink, type LinkCheckDeps } from '@/lib/security/link-check';
import { validateServiceUrl } from '@/lib/security/safe-url';
import type { Db } from '@/repositories/db';
import {
  AcademicServices,
  ServiceAccessLogs,
  ServiceCategories,
  ServiceFavorites,
  ServiceHealthChecks,
  ServiceRoleAccess,
} from '@/schemas/database/service-hub';
import type { RowOf } from '@/schemas/database/types';
import { serviceInputSchema, type ServiceInput } from '@/schemas/forms/service';
import type { CurrentUser } from './identity';

type ServiceRow = RowOf<typeof AcademicServices>;
export type ServiceColor = ServiceRow['color'];
export type ServiceSource = RowOf<typeof ServiceAccessLogs>['source'];

export interface ServiceView {
  id: string;
  version: number;
  categoryId: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
  ownerUnit: string | null;
  icon: string;
  color: ServiceColor;
  status: ServiceStatus;
  linkType: 'external' | 'internal';
  /** true = มีลิงก์ที่เปิดได้ */
  configured: boolean;
  /** เส้นทางสำหรับเปิดบริการ (ผ่านตัวบันทึกสถิติ) — null เมื่อยังไม่ได้ตั้งค่าลิงก์หรือปิดให้บริการ */
  href: string | null;
  isPinned: boolean;
  isFavorite: boolean;
}

export interface CategoryView {
  id: string;
  nameTh: string;
  nameEn: string | null;
  description: string | null;
}

function isConfigured(row: ServiceRow): boolean {
  return row.link_type === 'internal' ? Boolean(row.internal_path) : Boolean(row.url);
}

function toView(row: ServiceRow, favorites: ReadonlySet<string>): ServiceView {
  const configured = isConfigured(row);
  return {
    id: row.id,
    version: row.version,
    categoryId: row.category_id,
    nameTh: row.name_th,
    nameEn: row.name_en,
    description: row.description,
    ownerUnit: row.owner_unit,
    icon: row.icon,
    color: row.color,
    status: row.status,
    linkType: row.link_type,
    configured,
    href: configured && row.status === 'active' ? `/go/${row.id}` : null,
    isPinned: row.is_pinned,
    isFavorite: favorites.has(row.id),
  };
}

async function loadVisible(db: Db, user: CurrentUser) {
  user.permissions.assertCan('services.directory', 'view');
  const [services, categories, roleAccess, favorites] = await Promise.all([
    db.repo(AcademicServices).all(),
    db.repo(ServiceCategories).all(),
    db.repo(ServiceRoleAccess).all(),
    db.repo(ServiceFavorites).filter((f) => f.user_id === user.id && f.is_active),
  ]);
  const roleIds = new Set(user.roles.map((role) => role.roleId as string));
  const allowed = new Map<string, Set<string>>();
  for (const access of roleAccess) {
    if (!access.is_active) continue;
    const set = allowed.get(access.service_id) ?? new Set<string>();
    set.add(access.role_id);
    allowed.set(access.service_id, set);
  }
  const visibleCategories = categories
    .filter((c) => c.is_visible && !c.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  const categoryIds = new Set(visibleCategories.map((c) => c.id));
  const visible = services
    .filter((s) => s.is_visible && !s.archived_at && categoryIds.has(s.category_id))
    .filter(
      (s) =>
        s.audience === 'all' || Array.from(allowed.get(s.id) ?? []).some((roleId) => roleIds.has(roleId)),
    );
  return {
    rows: visible,
    categories: visibleCategories,
    favoriteIds: new Set(favorites.map((f) => f.service_id)),
  };
}

export interface ServiceDirectory {
  categories: CategoryView[];
  services: ServiceView[];
}

/** บริการทั้งหมดที่ผู้ใช้มองเห็น เรียงตามหมวดและลำดับที่ผู้ดูแลกำหนด */
export async function getDirectory(db: Db, user: CurrentUser): Promise<ServiceDirectory> {
  const { rows, categories, favoriteIds } = await loadVisible(db, user);
  const order = new Map(categories.map((c, index) => [c.id, index]));
  return {
    categories: categories.map((c) => ({
      id: c.id,
      nameTh: c.name_th,
      nameEn: c.name_en,
      description: c.description,
    })),
    services: rows
      .sort(
        (a, b) =>
          (order.get(a.category_id) ?? 0) - (order.get(b.category_id) ?? 0) ||
          Number(b.is_pinned) - Number(a.is_pinned) ||
          a.sort_order - b.sort_order,
      )
      .map((row) => toView(row, favoriteIds)),
  };
}

export interface PersonalHub {
  favorites: ServiceView[];
  recent: ServiceView[];
  frequent: ServiceView[];
  pinned: ServiceView[];
}

/** รายการโปรด ใช้ล่าสุด ใช้บ่อย และระบบสำคัญของผู้ใช้ (ข้อ 09.3) */
export async function getPersonalHub(db: Db, user: CurrentUser, limit = 6): Promise<PersonalHub> {
  const { rows, favoriteIds } = await loadVisible(db, user);
  const logs = (await db.repo(ServiceAccessLogs).filter((log) => log.user_id === user.id)).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const view = (id: string) => {
    const row = byId.get(id);
    return row ? toView(row, favoriteIds) : null;
  };
  const recentIds = Array.from(new Set(logs.map((log) => log.service_id)));
  const counts = new Map<string, number>();
  for (const log of logs) counts.set(log.service_id, (counts.get(log.service_id) ?? 0) + 1);
  const frequentIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const present = (ids: readonly string[]) =>
    ids.map(view).filter((service): service is ServiceView => service !== null).slice(0, limit);
  return {
    favorites: rows.filter((row) => favoriteIds.has(row.id)).map((row) => toView(row, favoriteIds)),
    recent: present(recentIds),
    frequent: present(frequentIds),
    pinned: rows
      .filter((row) => row.is_pinned)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => toView(row, favoriteIds)),
  };
}

/**
 * บริการที่แสดงเป็น “ใช้งานบ่อย” ในหน้าแรกและ App Launcher:
 * ที่ผู้ใช้เปิดบ่อย → รายการโปรด → ระบบสำคัญที่ผู้ดูแลปักหมุด → บริการอื่นที่เปิดได้ (เติมจนครบ)
 */
export async function getQuickServices(db: Db, user: CurrentUser, limit = 6): Promise<ServiceView[]> {
  const [hub, directory] = await Promise.all([getPersonalHub(db, user, limit), getDirectory(db, user)]);
  const seen = new Set<string>();
  const result: ServiceView[] = [];
  // ผู้ใช้ใหม่ที่ยังไม่มีประวัติ: เติมด้วยบริการอื่นที่เปิดได้ ตามลำดับที่ผู้ดูแลจัดไว้
  for (const service of [...hub.frequent, ...hub.favorites, ...hub.pinned, ...directory.services]) {
    if (seen.has(service.id) || !service.href) continue;
    seen.add(service.id);
    result.push(service);
    if (result.length >= limit) break;
  }
  return result;
}

export async function setFavorite(db: Db, user: CurrentUser, serviceId: string, favorite: boolean): Promise<void> {
  const { rows } = await loadVisible(db, user);
  if (!rows.some((row) => row.id === serviceId)) throw notFound('ไม่พบบริการ');
  const repo = db.repo(ServiceFavorites);
  const existing = await repo.find((f) => f.user_id === user.id && f.service_id === serviceId);
  if (existing?.is_active === favorite || (!existing && !favorite)) return;
  const uow = db.unitOfWork({ action: 'services.favorite', actorId: user.id });
  uow.add(
    existing
      ? repo.update(existing.id, { is_active: favorite })
      : repo.insert({ user_id: user.id, service_id: serviceId, is_active: true }),
  );
  await uow.commit();
}

/**
 * หาปลายทางของบริการและบันทึกการเปิดลิงก์
 * ปลายทางมาจากฐานข้อมูลเท่านั้น (ไม่รับ URL จากผู้เรียก) จึงไม่เป็น open redirect
 */
export async function openService(
  db: Db,
  user: CurrentUser,
  serviceId: string,
  source: ServiceSource,
): Promise<{ type: 'external'; url: string } | { type: 'internal'; path: string }> {
  const { rows } = await loadVisible(db, user);
  const row = rows.find((service) => service.id === serviceId);
  if (!row) throw notFound('ไม่พบบริการ');
  if (row.status !== 'active') throw validation('บริการนี้ปิดให้บริการชั่วคราว');
  let target: { type: 'external'; url: string } | { type: 'internal'; path: string };
  if (row.link_type === 'internal') {
    if (!row.internal_path) throw validation('บริการนี้ยังไม่ได้ตั้งค่าลิงก์');
    target = { type: 'internal', path: safeInternalPath(row.internal_path) };
  } else {
    // ตรวจซ้ำตอนใช้งาน เผื่อข้อมูลในชีตถูกแก้ด้วยมือ
    const checked = row.url ? validateServiceUrl(row.url, { allowHttp: true }) : null;
    if (!checked?.ok) throw validation('บริการนี้ยังไม่ได้ตั้งค่าลิงก์');
    target = { type: 'external', url: checked.url };
  }
  const uow = db.unitOfWork({ action: 'services.open', actorId: user.id });
  uow.add(db.repo(ServiceAccessLogs).insert({ service_id: row.id, user_id: user.id, source }));
  await uow.commit();
  return target;
}

// ── การจัดการลิงก์ (ข้อ 09.2) ──────────────────────────────────────────────────

export interface ManagedService extends ServiceInput {
  id: string;
  version: number;
  sortOrder: number;
  configured: boolean;
  /** ปลายทางที่ผ่านการตรวจแล้ว สำหรับปุ่ม “เปิดลิงก์” ของผู้ดูแล (null = ยังไม่ตั้งค่า หรือค่าในชีตไม่ผ่านการตรวจ) */
  openHref: string | null;
  isPrivateHost: boolean;
  lastCheckResult: LinkCheckResult | null;
  lastCheckedAt: string | null;
  openCount: number;
  archived: boolean;
}

function assertManage(user: CurrentUser, action: 'view' | 'create' | 'edit' | 'archive' | 'manage') {
  if (!user.permissions.can('services.manage', action)) throw forbidden();
}

function parseInput(input: unknown): ServiceInput & { normalizedUrl: string | null } {
  const parsed = serviceInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw validation('ข้อมูลไม่ถูกต้อง', fieldErrors);
  }
  const data = parsed.data;
  let normalizedUrl: string | null = null;
  if (data.linkType === 'external' && data.url) {
    const checked = validateServiceUrl(data.url, { allowHttp: true });
    if (!checked.ok) throw validation(checked.reason, { url: checked.reason });
    normalizedUrl = checked.url;
  }
  if (data.linkType === 'internal') {
    if (!data.internalPath.startsWith('/') || safeInternalPath(data.internalPath, '') !== data.internalPath) {
      throw validation('เส้นทางภายในต้องขึ้นต้นด้วย /', { internalPath: 'เส้นทางภายในต้องขึ้นต้นด้วย /' });
    }
  }
  if (data.audience === 'restricted' && data.roleIds.length === 0) {
    throw validation('กรุณาเลือกบทบาทที่เข้าถึงได้', { roleIds: 'กรุณาเลือกอย่างน้อย 1 บทบาท' });
  }
  return { ...data, normalizedUrl };
}

export async function listManagedServices(
  db: Db,
  user: CurrentUser,
): Promise<{ services: ManagedService[]; categories: CategoryView[] }> {
  assertManage(user, 'view');
  const [services, categories, roleAccess, logs] = await Promise.all([
    db.repo(AcademicServices).all(),
    db.repo(ServiceCategories).all(),
    db.repo(ServiceRoleAccess).all(),
    db.repo(ServiceAccessLogs).all(),
  ]);
  const counts = new Map<string, number>();
  for (const log of logs) counts.set(log.service_id, (counts.get(log.service_id) ?? 0) + 1);
  const order = new Map(
    [...categories].sort((a, b) => a.sort_order - b.sort_order).map((c, index) => [c.id, index]),
  );
  return {
    categories: [...categories]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, nameTh: c.name_th, nameEn: c.name_en, description: c.description })),
    services: [...services]
      .sort(
        (a, b) =>
          (order.get(a.category_id) ?? 0) - (order.get(b.category_id) ?? 0) || a.sort_order - b.sort_order,
      )
      .map((row) => {
        const checked = row.url ? validateServiceUrl(row.url, { allowHttp: true }) : null;
        return {
          id: row.id,
          version: row.version,
          categoryId: row.category_id,
          nameTh: row.name_th,
          nameEn: row.name_en ?? '',
          description: row.description ?? '',
          ownerUnit: row.owner_unit ?? '',
          linkType: row.link_type,
          url: row.url ?? '',
          internalPath: row.internal_path ?? '',
          icon: row.icon as IconKey,
          color: row.color,
          status: row.status,
          isVisible: row.is_visible,
          isPinned: row.is_pinned,
          audience: row.audience,
          roleIds: roleAccess
            .filter((access) => access.service_id === row.id && access.is_active)
            .map((access) => access.role_id)
            .filter((id): id is (typeof ROLE_IDS)[number] => (ROLE_IDS as readonly string[]).includes(id)),
          sortOrder: row.sort_order,
          configured: isConfigured(row),
          openHref:
            row.link_type === 'internal'
              ? safeInternalPath(row.internal_path, '') || null
              : checked?.ok
                ? checked.url
                : null,
          isPrivateHost: checked?.ok ? checked.isPrivateHost : false,
          lastCheckResult: row.last_check_result,
          lastCheckedAt: row.last_checked_at,
          openCount: counts.get(row.id) ?? 0,
          archived: Boolean(row.archived_at),
        };
      }),
  };
}

/** เพิ่มหรือแก้ไขบริการ (expectedVersion ป้องกันการแก้ไขทับกันของผู้ดูแลสองคน) */
export async function saveService(
  db: Db,
  user: CurrentUser,
  input: unknown,
  target?: { id: string; expectedVersion: number },
): Promise<{ id: string }> {
  assertManage(user, target ? 'edit' : 'create');
  const data = parseInput(input);
  const repo = db.repo(AcademicServices);
  if (!(await db.repo(ServiceCategories).byId(data.categoryId))) {
    throw validation('ไม่พบหมวดหมู่ที่เลือก', { categoryId: 'ไม่พบหมวดหมู่ที่เลือก' });
  }
  const values = {
    category_id: data.categoryId,
    name_th: data.nameTh,
    name_en: data.nameEn || null,
    description: data.description || null,
    owner_unit: data.ownerUnit || null,
    link_type: data.linkType,
    url: data.linkType === 'external' ? data.normalizedUrl : null,
    internal_path: data.linkType === 'internal' ? data.internalPath : null,
    icon: data.icon,
    color: data.color,
    status: data.status,
    is_visible: data.isVisible,
    is_pinned: data.isPinned,
    audience: data.audience,
  };
  const uow = db.unitOfWork({ action: target ? 'services.update' : 'services.create', actorId: user.id });
  let id: string;
  if (target) {
    const existing = await repo.byId(target.id);
    if (!existing) throw notFound('ไม่พบบริการ');
    id = existing.id;
    const urlChanged = existing.url !== values.url;
    uow.add(
      repo.update(
        id,
        { ...values, ...(urlChanged ? { last_check_result: null, last_checked_at: null } : {}) },
        target.expectedVersion,
      ),
    );
  } else {
    const siblings = await repo.filter((row) => row.category_id === data.categoryId);
    const created = repo.insert({
      ...values,
      sort_order: Math.max(0, ...siblings.map((row) => row.sort_order)) + 1,
    });
    id = created.id;
    uow.add(created);
  }

  // สิทธิ์รายบทบาท: เพิ่มที่ขาด เปิดใช้แถวเดิมที่เคยถอน และถอนสิทธิ์ที่ไม่อยู่ในรายการแล้ว (ไม่มีการลบแถว)
  const accessRepo = db.repo(ServiceRoleAccess);
  const current = await accessRepo.filter((access) => access.service_id === id);
  const wanted = new Set<string>(data.audience === 'restricted' ? data.roleIds : []);
  for (const access of current) {
    const shouldBeActive = wanted.has(access.role_id);
    if (access.is_active !== shouldBeActive) {
      uow.add(accessRepo.update(access.id, { is_active: shouldBeActive }, access.version));
    }
  }
  for (const roleId of wanted) {
    if (!current.some((access) => access.role_id === roleId)) {
      uow.add(accessRepo.insert({ id: `${id}:${roleId}`, service_id: id, role_id: roleId, is_active: true }));
    }
  }
  uow.audit({
    action: target ? 'services.update' : 'services.create',
    category: target ? 'update' : 'create',
    resource: 'services.manage',
    entityType: 'service',
    entityId: id,
    summary: `${target ? 'แก้ไข' : 'เพิ่ม'}บริการ “${data.nameTh}”`,
    metadata: {
      linkType: data.linkType,
      configured: Boolean(values.url ?? values.internal_path),
      audience: data.audience,
      roleIds: Array.from(wanted),
    },
  });
  await uow.commit();
  return { id };
}

/** การแก้ไขสถานะแบบเร็วจากตารางจัดการ */
export async function patchService(
  db: Db,
  user: CurrentUser,
  id: string,
  patch: { isVisible?: boolean; isPinned?: boolean; archived?: boolean },
  expectedVersion: number,
): Promise<void> {
  assertManage(user, patch.archived !== undefined ? 'archive' : 'edit');
  const repo = db.repo(AcademicServices);
  const existing = await repo.byId(id);
  if (!existing) throw notFound('ไม่พบบริการ');
  const uow = db.unitOfWork({ action: 'services.patch', actorId: user.id });
  uow.add(
    repo.update(
      id,
      {
        ...(patch.isVisible !== undefined ? { is_visible: patch.isVisible } : {}),
        ...(patch.isPinned !== undefined ? { is_pinned: patch.isPinned } : {}),
        ...(patch.archived !== undefined
          ? patch.archived
            ? { archived_at: uow.now, archived_by: user.id, is_visible: false }
            : { archived_at: null, archived_by: null }
          : {}),
      },
      expectedVersion,
    ),
  );
  uow.audit({
    action: 'services.patch',
    category: patch.archived ? 'archive' : patch.archived === false ? 'restore' : 'update',
    resource: 'services.manage',
    entityType: 'service',
    entityId: id,
    summary: `ปรับสถานะบริการ “${existing.name_th}”`,
    metadata: patch,
  });
  await uow.commit();
}

/** จัดลำดับบริการภายในหมวด (Drag and Drop Sorting) */
export async function reorderServices(
  db: Db,
  user: CurrentUser,
  categoryId: string,
  orderedIds: readonly string[],
): Promise<void> {
  assertManage(user, 'edit');
  const repo = db.repo(AcademicServices);
  const rows = await repo.filter((row) => row.category_id === categoryId);
  const known = new Set(rows.map((row) => row.id));
  if (orderedIds.length !== rows.length || orderedIds.some((id) => !known.has(id))) {
    throw validation('รายการที่จัดลำดับไม่ตรงกับข้อมูลปัจจุบัน กรุณาโหลดหน้านี้ใหม่');
  }
  const uow = db.unitOfWork({ action: 'services.reorder', actorId: user.id });
  orderedIds.forEach((id, index) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (row && row.sort_order !== index + 1) uow.add(repo.update(id, { sort_order: index + 1 }));
  });
  if (uow.size === 0) return;
  uow.audit({
    action: 'services.reorder',
    category: 'update',
    resource: 'services.manage',
    entityType: 'service_category',
    entityId: categoryId,
    summary: 'จัดลำดับบริการใหม่',
  });
  await uow.commit();
}

/** ตรวจลิงก์จากฝั่ง Server (ป้องกัน SSRF) และบันทึกผล */
export async function checkServiceLink(
  db: Db,
  user: CurrentUser,
  id: string,
  deps?: Partial<LinkCheckDeps>,
): Promise<{ result: LinkCheckResult; message: string; httpStatus: number | null }> {
  assertManage(user, 'manage');
  const repo = db.repo(AcademicServices);
  const row = await repo.byId(id);
  if (!row) throw notFound('ไม่พบบริการ');
  if (row.link_type !== 'external' || !row.url) {
    throw validation('บริการนี้ไม่มีลิงก์ภายนอกให้ตรวจ');
  }
  const outcome = await checkLink(row.url, deps);
  const uow = db.unitOfWork({ action: 'services.checkLink', actorId: user.id });
  uow.add(
    repo.update(id, { last_check_result: outcome.result, last_checked_at: uow.now }),
    db.repo(ServiceHealthChecks).insert({
      service_id: id,
      result: outcome.result,
      http_status: outcome.httpStatus,
      response_ms: outcome.responseMs,
      message: outcome.message,
      checked_by: user.id,
    }),
  );
  await uow.commit();
  return { result: outcome.result, message: outcome.message, httpStatus: outcome.httpStatus };
}

export interface ServiceUsageStats {
  total: number;
  active: number;
  maintenance: number;
  notConfigured: number;
  needsReview: number;
  totalOpens: number;
  topServices: { id: string; name: string; opens: number }[];
  /**
   * จำนวนครั้งที่เปิดลิงก์รายเดือน (YYYY-MM ตามเวลาโรงเรียน) ต่อเนื่องทุกเดือนตั้งแต่เดือนแรกที่มีข้อมูล
   * ถึงเดือนปัจจุบัน ย้อนหลังไม่เกิน 12 เดือน — เดือนที่ไม่มีการเปิดลิงก์เป็น 0 ไม่ถูกตัดออก
   */
  monthly: { month: string; opens: number }[];
}

/** เลื่อนเป็นเวลาไทย (UTC+7) ก่อนตัดเดือน */
const schoolMonth = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 7);

function previousMonth(month: string): string {
  const [year, monthNo] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNo - 2, 1)).toISOString().slice(0, 7);
}

export async function getUsageStats(
  db: Db,
  user: CurrentUser,
  now: number = Date.now(),
): Promise<ServiceUsageStats> {
  if (!user.permissions.canAll('services.insights', 'view')) throw forbidden();
  const [services, logs] = await Promise.all([
    db.repo(AcademicServices).filter((row) => !row.archived_at),
    db.repo(ServiceAccessLogs).all(),
  ]);
  const counts = new Map<string, number>();
  const monthly = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.service_id, (counts.get(log.service_id) ?? 0) + 1);
    const month = schoolMonth(Date.parse(log.created_at));
    monthly.set(month, (monthly.get(month) ?? 0) + 1);
  }
  const window: string[] = [];
  for (let month = schoolMonth(now); window.length < 12; month = previousMonth(month)) window.unshift(month);
  const firstMonth = Array.from(monthly.keys()).sort()[0];
  const months = firstMonth ? window.filter((month) => month >= firstMonth) : [];
  const nameById = new Map(services.map((row) => [row.id, row.name_th]));
  return {
    total: services.length,
    active: services.filter((row) => row.status === 'active' && isConfigured(row)).length,
    maintenance: services.filter((row) => row.status !== 'active').length,
    notConfigured: services.filter((row) => !isConfigured(row)).length,
    needsReview: services.filter(
      (row) => row.last_check_result === 'broken' || row.last_check_result === 'unreachable',
    ).length,
    totalOpens: logs.length,
    topServices: Array.from(counts.entries())
      .filter(([id]) => nameById.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, opens]) => ({ id, name: nameById.get(id) ?? '', opens })),
    monthly: months.map((month) => ({ month, opens: monthly.get(month) ?? 0 })),
  };
}
