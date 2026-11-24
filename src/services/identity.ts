/**
 * Identity Service — ตัดสินว่าใครเข้าสู่ระบบได้ และโหลดตัวตน/สิทธิ์ของผู้ใช้
 *
 * หลักการ (ข้อ 09):
 *   - เข้าสู่ระบบ Google สำเร็จ "ไม่เพียงพอ" ต้องมีแถวในตาราง Users (Email Allowlist) และสถานะ active
 *   - ตัวระบุบัญชีถาวรคือ Google Subject ID (`sub`) ที่ตรวจแล้ว อีเมลเป็นข้อมูลประกอบ
 *   - บทบาทและสิทธิ์อ่านจากฐานข้อมูลทุกคำขอ การระงับบัญชีหรือถอนบทบาทมีผลทันทีโดยไม่ต้องรอ session หมดอายุ
 */
import 'server-only';
import {
  DEFAULT_PERMISSION_MATRIX,
  isAction,
  isScope,
  type PermissionMatrix,
} from '@/config/permissions';
import { isResourceKey } from '@/config/modules';
import { ROLE_IDS, getRole, isRoleId, type RoleId } from '@/config/roles';
import { getBootstrapAdminEmail, isDemoMode } from '@/lib/env';
import { PermissionSet, type RoleAssignment } from '@/lib/security/authorization';
import type { Db } from '@/repositories/db';
import {
  Departments,
  RolePermissions,
  Teachers,
  UserRoles,
  Users,
} from '@/schemas/database/master';
import type { RowOf } from '@/schemas/database/types';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  position: string | null;
  teacherId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  roles: RoleAssignment[];
  /** ชื่อบทบาทภาษาไทย เรียงตามลำดับบทบาท */
  roleNames: string[];
  permissions: PermissionSet;
  isDemo: boolean;
}

export type SignInDenial =
  | 'email_not_verified'
  | 'not_allowed'
  | 'suspended'
  | 'account_mismatch'
  | 'setup_required';

export type SignInResult = { ok: true; userId: string } | { ok: false; reason: SignInDenial };

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
}

/** ปิดบังอีเมลก่อนบันทึก Audit Log ของการเข้าสู่ระบบที่ถูกปฏิเสธ (อาจเป็นบุคคลภายนอก) */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

export async function loadPermissionMatrix(db: Db): Promise<PermissionMatrix> {
  const rows = await db.repo(RolePermissions).all();
  if (rows.length === 0) return DEFAULT_PERMISSION_MATRIX;
  const matrix = Object.fromEntries(ROLE_IDS.map((id) => [id, {}])) as PermissionMatrix;
  for (const row of rows) {
    if (
      !isRoleId(row.role_id) ||
      !isResourceKey(row.resource) ||
      !isAction(row.action) ||
      !isScope(row.scope)
    ) {
      continue; // แถวที่ไม่รู้จักถูกข้าม (ไม่ให้สิทธิ์เพิ่มจากข้อมูลที่ผิดรูปแบบ)
    }
    const grants = (matrix[row.role_id][row.resource] ??= {});
    grants[row.action] = row.scope;
  }
  return matrix;
}

async function activeAssignments(db: Db, userId: string): Promise<RoleAssignment[]> {
  const rows = await db
    .repo(UserRoles)
    .filter((row) => row.user_id === userId && row.status === 'active');
  return rows
    .filter((row) => isRoleId(row.role_id))
    .map((row) => ({
      roleId: row.role_id as RoleId,
      departmentId: row.department_id,
      unitId: row.unit_id,
    }));
}

function toCurrentUser(
  user: RowOf<typeof Users>,
  teacher: RowOf<typeof Teachers> | null,
  department: RowOf<typeof Departments> | null,
  roles: RoleAssignment[],
  matrix: PermissionMatrix,
): CurrentUser {
  const departmentId = teacher?.department_id ?? null;
  const uniqueRoleIds = Array.from(new Set(roles.map((role) => role.roleId))).sort(
    (a, b) => getRole(a).order - getRole(b).order,
  );
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    position: teacher?.position ?? null,
    teacherId: user.teacher_id,
    departmentId,
    departmentName: department?.name_th ?? null,
    roles,
    roleNames: uniqueRoleIds.map((id) => getRole(id).nameTh),
    permissions: new PermissionSet({ id: user.id, departmentId, roles }, matrix),
    isDemo: user.is_demo === true,
  };
}

/** โหลดผู้ใช้ปัจจุบันจากฐานข้อมูล คืน null เมื่อไม่มีบัญชี ถูกระงับ หรือไม่มีบทบาทใดเลย */
export async function loadCurrentUser(db: Db, userId: string): Promise<CurrentUser | null> {
  const user = await db.repo(Users).byId(userId);
  if (!user || user.status !== 'active') return null;
  // บัญชีสาธิตใช้ได้เฉพาะกับที่เก็บข้อมูลสาธิต และที่เก็บข้อมูลสาธิตรับเฉพาะบัญชีสาธิต
  if (isDemoMode() !== (user.is_demo === true)) return null;

  const [roles, teacher, matrix] = await Promise.all([
    activeAssignments(db, userId),
    db.repo(Teachers).byId(user.teacher_id),
    loadPermissionMatrix(db),
  ]);
  if (roles.length === 0) return null;
  const department = await db.repo(Departments).byId(teacher?.department_id);
  return toCurrentUser(user, teacher, department, roles, matrix);
}

async function hasActiveSuperAdmin(db: Db): Promise<boolean> {
  const [assignments, users] = await Promise.all([db.repo(UserRoles).all(), db.repo(Users).all()]);
  const activeUsers = new Set(users.filter((u) => u.status === 'active').map((u) => u.id));
  return assignments.some(
    (row) => row.role_id === 'super_admin' && row.status === 'active' && activeUsers.has(row.user_id),
  );
}

/**
 * ตรวจสิทธิ์การเข้าสู่ระบบด้วยบัญชี Google ที่ผ่านการยืนยันจาก Google แล้ว
 * บันทึก Audit Log ทั้งกรณีสำเร็จและถูกปฏิเสธ
 */
export async function resolveGoogleSignIn(db: Db, identity: GoogleIdentity): Promise<SignInResult> {
  const email = identity.email.trim().toLowerCase();
  const users = db.repo(Users);

  const deny = async (reason: SignInDenial, userId?: string): Promise<SignInResult> => {
    await db
      .unitOfWork({ action: 'auth.login', actorId: userId ?? null })
      .audit({
        action: 'auth.login',
        category: 'auth',
        outcome: 'denied',
        resource: 'system',
        entityType: 'user',
        entityId: userId,
        summary: `ปฏิเสธการเข้าสู่ระบบ (${reason})`,
        metadata: { reason, email: maskEmail(email) },
      })
      .commit();
    return { ok: false, reason };
  };

  if (isDemoMode()) return deny('not_allowed');
  if (!identity.emailVerified || !identity.sub) return deny('email_not_verified');

  let user = await users.find((row) => row.google_sub === identity.sub);
  /** การแก้ไขแถวผู้ใช้ทั้งหมดของการเข้าสู่ระบบครั้งนี้ รวมเป็นคำสั่งเดียว */
  const patch: { google_sub?: string; last_login_at?: string } = {};
  let expectedVersion: number | undefined;

  if (!user) {
    const byEmail = await users.find((row) => row.email.toLowerCase() === email);
    if (byEmail) {
      // อีเมลนี้เคยผูกกับบัญชี Google อื่นแล้ว → ไม่ยอมให้บัญชีใหม่ที่ใช้อีเมลเดิมเข้าแทน
      if (byEmail.google_sub) return deny('account_mismatch', byEmail.id);
      if (byEmail.status !== 'active') return deny('suspended', byEmail.id);
      patch.google_sub = identity.sub;
      // ผูกบัญชีได้ครั้งเดียว: ถ้ามีคำขออื่นผูกไปก่อน เวอร์ชันจะไม่ตรงและคำสั่งนี้ถูกปฏิเสธ
      expectedVersion = byEmail.version;
      user = byEmail;
    } else if (email === getBootstrapAdminEmail() && !(await hasActiveSuperAdmin(db))) {
      return bootstrapFirstAdmin(db, identity, email);
    } else {
      return deny('not_allowed');
    }
  } else if (user.status !== 'active') {
    return deny('suspended', user.id);
  }

  const roles = await activeAssignments(db, user.id);
  if (roles.length === 0) return deny('not_allowed', user.id);

  const uow = db.unitOfWork({ action: 'auth.login', actorId: user.id });
  patch.last_login_at = uow.now;
  uow.add(users.update(user.id, patch, expectedVersion));
  uow.audit({
    action: 'auth.login',
    category: 'auth',
    resource: 'system',
    entityType: 'user',
    entityId: user.id,
    summary: patch.google_sub ? 'เข้าสู่ระบบสำเร็จ (ผูกบัญชี Google ครั้งแรก)' : 'เข้าสู่ระบบสำเร็จ',
  });
  await uow.commit();
  return { ok: true, userId: user.id };
}

/**
 * ผู้ดูแลคนแรก: ใช้ได้เมื่ออีเมลตรงกับ BOOTSTRAP_ADMIN_EMAIL และยังไม่มี Super Admin ที่ใช้งานอยู่เท่านั้น
 * ผู้ใช้ทั่วไปไม่มีทางตั้งตนเองเป็น Super Admin ผ่านเส้นทางนี้
 */
async function bootstrapFirstAdmin(
  db: Db,
  identity: GoogleIdentity,
  email: string,
): Promise<SignInResult> {
  const uow = db.unitOfWork({ action: 'auth.bootstrapAdmin', actorId: null });
  const created = db.repo(Users).insert({
    email,
    google_sub: identity.sub,
    display_name: identity.name?.trim() || email,
    status: 'active',
    last_login_at: uow.now,
    is_demo: false,
  });
  uow.add(
    created,
    db.repo(UserRoles).insert({ user_id: created.id, role_id: 'super_admin', status: 'active' }),
  );
  uow.audit({
    action: 'auth.bootstrapAdmin',
    category: 'permission',
    resource: 'intelligence.admin',
    entityType: 'user',
    entityId: created.id,
    actorId: created.id,
    summary: 'สร้างบัญชีผู้ดูแลระบบคนแรกจาก BOOTSTRAP_ADMIN_EMAIL และเข้าสู่ระบบสำเร็จ',
  });
  await uow.commit();
  return { ok: true, userId: created.id };
}

/** บัญชีสาธิตที่เลือกได้ในหน้า Login (เฉพาะโหมดสาธิต) */
export async function listDemoPersonas(
  db: Db,
): Promise<{ id: string; displayName: string; roleNames: string[]; departmentName: string | null }[]> {
  if (!isDemoMode()) return [];
  const [users, assignments, teachers, departments] = await Promise.all([
    db.repo(Users).filter((user) => user.is_demo === true && user.status === 'active'),
    db.repo(UserRoles).all(),
    db.repo(Teachers).all(),
    db.repo(Departments).all(),
  ]);
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  return users
    .map((user) => {
      const roleIds = Array.from(
        new Set(
          assignments
            .filter((a) => a.user_id === user.id && a.status === 'active' && isRoleId(a.role_id))
            .map((a) => a.role_id as RoleId),
        ),
      ).sort((a, b) => getRole(a).order - getRole(b).order);
      const departmentId = teacherById.get(user.teacher_id ?? '')?.department_id ?? '';
      return {
        id: user.id,
        displayName: user.display_name,
        roleNames: roleIds.map((id) => getRole(id).nameTh),
        departmentName: departmentById.get(departmentId)?.name_th ?? null,
        order: Math.min(...roleIds.map((id) => getRole(id).order), 99),
      };
    })
    .filter((persona) => persona.roleNames.length > 0)
    .sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName, 'th'))
    .map(({ order: _order, ...persona }) => persona);
}
