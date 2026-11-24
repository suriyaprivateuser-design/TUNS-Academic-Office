/**
 * Permission Matrix ตั้งต้น: 9 บทบาท × 34 ระบบย่อย × 11 action (ข้อ 10 ของ Master Prompt)
 *
 * - ค่าในไฟล์นี้คือ "ค่าตั้งต้น" ที่ Setup Wizard เขียนลงชีต Roles / Permissions / RolePermissions
 *   เมื่อมีข้อมูลในชีตแล้ว ระบบใช้ค่าจากชีต (ผู้ดูแลปรับได้ใน Admin Console)
 * - การตรวจสิทธิ์จริงทำที่ฝั่ง Server เท่านั้น (src/lib/security/authorization.ts)
 * - `scope` กำหนดขอบเขตข้อมูลที่ action นั้นทำได้:
 *     all        ทุกรายการ
 *     department เฉพาะรายการของกลุ่มสาระที่ตนสังกัด/รับผิดชอบ
 *     unit       เฉพาะรายการของกลุ่มงานที่ตนรับผิดชอบ
 *     own        เฉพาะรายการที่ตนเป็นเจ้าของหรือเป็นผู้เกี่ยวข้องโดยตรง
 * - การอนุมัติ (approve/reject/return) ต้องผ่านทั้ง 2 เงื่อนไข: มีสิทธิ์ใน matrix นี้
 *   และเป็นผู้พิจารณาของขั้นตอนนั้นใน Approval Workflow
 */
import { RESOURCE_KEYS, type ResourceKey } from './modules';
import { ROLE_IDS, type RoleId } from './roles';

export const ACTIONS = [
  'view',
  'create',
  'edit',
  'submit',
  'approve',
  'reject',
  'return',
  'cancel',
  'export',
  'archive',
  'manage',
] as const;

export type Action = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<Action, { th: string; description: string }> = {
  view: { th: 'ดู', description: 'เปิดดูรายการและรายละเอียดภายในขอบเขต' },
  create: { th: 'สร้าง', description: 'สร้างรายการใหม่' },
  edit: { th: 'แก้ไข', description: 'แก้ไขรายการ (ฉบับร่างหรือข้อมูลทะเบียน)' },
  submit: { th: 'ส่ง/เสนอ', description: 'ส่งงานหรือเสนอเอกสารเข้าสู่การพิจารณา' },
  approve: { th: 'อนุมัติ', description: 'อนุมัติในขั้นตอนที่ตนเป็นผู้พิจารณา' },
  reject: { th: 'ไม่อนุมัติ', description: 'ไม่อนุมัติในขั้นตอนที่ตนเป็นผู้พิจารณา' },
  return: { th: 'ส่งกลับแก้ไข', description: 'ส่งกลับให้ผู้เสนอแก้ไข' },
  cancel: { th: 'ยกเลิก', description: 'ยกเลิกรายการ' },
  export: { th: 'ส่งออก', description: 'ส่งออก PDF / Excel / CSV หรือดาวน์โหลดรายงาน' },
  archive: { th: 'จัดเก็บถาวร', description: 'ย้ายรายการไปจัดเก็บถาวร (ไม่ลบจริง)' },
  manage: { th: 'จัดการ', description: 'ตั้งค่าของระบบย่อย เช่น แม่แบบ หมวดหมู่ เกณฑ์' },
};

export const SCOPES = ['all', 'department', 'unit', 'own'] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<Scope, string> = {
  all: 'ทั้งหมด',
  department: 'กลุ่มสาระ',
  unit: 'กลุ่มงาน',
  own: 'ของตนเอง',
};

export type ResourceGrants = Partial<Record<Action, Scope>>;
export type RoleGrants = Partial<Record<ResourceKey, ResourceGrants>>;
export type PermissionMatrix = Record<RoleId, RoleGrants>;

const SCOPE_RANK: Record<Scope, number> = { own: 1, unit: 2, department: 2, all: 3 };

/** รวมสิทธิ์หลายชุดเข้าด้วยกัน ถ้า action ซ้ำกันใช้ขอบเขตที่กว้างกว่า */
function merge(...sources: RoleGrants[]): RoleGrants {
  const result: RoleGrants = {};
  for (const source of sources) {
    for (const [resource, grants] of Object.entries(source) as [ResourceKey, ResourceGrants][]) {
      const target: ResourceGrants = { ...(result[resource] ?? {}) };
      for (const [action, scope] of Object.entries(grants) as [Action, Scope][]) {
        const current = target[action];
        if (!current || SCOPE_RANK[scope] > SCOPE_RANK[current]) target[action] = scope;
      }
      result[resource] = target;
    }
  }
  return result;
}

/** สร้างสิทธิ์ชุดเดียวกันให้หลาย action */
function grant(scope: Scope, ...actions: Action[]): ResourceGrants {
  return Object.fromEntries(actions.map((action) => [action, scope]));
}

function viewAll(...resources: ResourceKey[]): RoleGrants {
  return Object.fromEntries(resources.map((resource) => [resource, grant('all', 'view')]));
}

/** สิทธิ์พื้นฐานของบุคลากรทุกคนที่เข้าสู่ระบบได้ */
const STAFF_BASE: RoleGrants = {
  'dashboard.workspace': grant('own', 'view'),
  'dashboard.notifications': grant('own', 'view', 'edit'),
  'services.directory': grant('all', 'view'),
  'services.insights': grant('own', 'view', 'edit'),
  'documents.incoming': grant('own', 'view'),
  'classLeave.notices': grant('own', 'view'),
  'tasks.assignments': grant('own', 'view'),
  'tasks.board': grant('own', 'view', 'edit'),
  'tasks.submissions': grant('own', 'view', 'submit'),
  'calendar.academic': grant('all', 'view'),
  'meetings.manage': grant('own', 'view'),
  'meetings.attendance': grant('own', 'view', 'create'),
  'meetings.minutes': grant('own', 'view'),
  'personnel.organization': grant('all', 'view'),
  'personnel.responsibilities': grant('own', 'view'),
  'personnel.coordination': grant('own', 'view'),
  'knowledge.library': grant('all', 'view'),
  'knowledge.announcements': grant('all', 'view'),
  'knowledge.surveys': grant('own', 'view', 'submit'),
};

/** สิทธิ์ของผู้จัดทำเอกสาร (ครูและบุคลากรที่เสนอเอกสารได้) */
const AUTHOR: RoleGrants = {
  'documents.approvals': grant('own', 'view', 'submit', 'cancel'),
  'documents.memos': grant('own', 'view', 'create', 'edit', 'submit', 'cancel', 'export'),
  'documents.certificates': grant('own', 'view'),
  'classLeave.requests': grant('own', 'view', 'create', 'edit', 'submit', 'cancel', 'export'),
  'classLeave.approvals': grant('own', 'view'),
  'classLeave.attendance': grant('own', 'view', 'edit'),
  'classLeave.analytics': grant('own', 'view'),
};

const TEACHER: RoleGrants = merge(STAFF_BASE, AUTHOR);

const DEPARTMENT_HEAD: RoleGrants = merge(TEACHER, {
  'documents.incoming': grant('department', 'view'),
  'documents.approvals': grant('department', 'view', 'approve', 'reject', 'return'),
  'documents.memos': grant('department', 'view'),
  'classLeave.requests': grant('department', 'view'),
  'classLeave.approvals': grant('department', 'view', 'approve', 'reject', 'return'),
  'classLeave.attendance': grant('department', 'view'),
  'classLeave.analytics': grant('department', 'view', 'export'),
  'tasks.assignments': grant('department', 'view', 'create', 'edit', 'cancel'),
  'tasks.board': grant('department', 'view', 'edit'),
  'tasks.submissions': grant('department', 'view'),
  'tasks.tracking': grant('department', 'view', 'export'),
  'meetings.manage': grant('department', 'view', 'create', 'edit', 'cancel'),
  'meetings.attendance': grant('department', 'view', 'edit'),
  'meetings.minutes': grant('department', 'view', 'create', 'edit'),
  'personnel.responsibilities': grant('department', 'view'),
  'personnel.coordination': grant('department', 'view', 'create', 'edit'),
  'knowledge.announcements': grant('department', 'create', 'edit'),
  'intelligence.reports': grant('department', 'view', 'export'),
});

const UNIT_HEAD: RoleGrants = merge(TEACHER, {
  'documents.incoming': grant('unit', 'view'),
  'documents.approvals': grant('unit', 'view', 'approve', 'reject', 'return'),
  'tasks.assignments': grant('unit', 'view', 'create', 'edit', 'cancel'),
  'tasks.board': grant('unit', 'view', 'edit'),
  'tasks.submissions': grant(
    'unit',
    'view',
    'create',
    'edit',
    'approve',
    'return',
    'export',
    'manage',
  ),
  'tasks.tracking': grant('unit', 'view', 'export'),
  'meetings.manage': grant('unit', 'view', 'create', 'edit', 'cancel'),
  'meetings.attendance': grant('unit', 'view', 'edit'),
  'meetings.minutes': grant('unit', 'view', 'create', 'edit'),
  'personnel.coordination': grant('unit', 'view', 'create', 'edit'),
  'knowledge.library': grant('unit', 'create', 'edit'),
  'knowledge.announcements': grant('unit', 'create', 'edit'),
  'intelligence.reports': grant('unit', 'view', 'export'),
});

const OFFICE_STAFF: RoleGrants = merge(STAFF_BASE, AUTHOR, {
  'dashboard.executive': grant('all', 'view'),
  'services.manage': grant('all', 'view', 'create', 'edit', 'archive', 'manage'),
  'services.insights': grant('all', 'view', 'export'),
  'documents.incoming': grant('all', 'view', 'create', 'edit', 'export', 'archive', 'manage'),
  'documents.outgoing': grant('all', 'view', 'create', 'edit', 'export', 'archive', 'manage'),
  'documents.approvals': grant(
    'all',
    'view',
    'approve',
    'reject',
    'return',
    'cancel',
    'export',
    'archive',
  ),
  'documents.memos': grant('all', 'view', 'export', 'manage'),
  'documents.orders': grant('all', 'view', 'create', 'edit', 'submit', 'export', 'archive'),
  'documents.announcements': grant('all', 'view', 'create', 'edit', 'submit', 'export', 'archive'),
  'documents.certificates': grant(
    'all',
    'view',
    'create',
    'edit',
    'cancel',
    'export',
    'archive',
    'manage',
  ),
  'classLeave.requests': grant('all', 'view', 'cancel', 'export', 'archive', 'manage'),
  'classLeave.approvals': grant('all', 'view', 'approve', 'reject', 'return'),
  'classLeave.notices': grant('all', 'view'),
  'classLeave.attendance': grant('all', 'view'),
  'classLeave.analytics': grant('all', 'view', 'export', 'manage'),
  'tasks.assignments': grant('all', 'view', 'create', 'edit', 'cancel'),
  'tasks.board': grant('all', 'view', 'edit'),
  'tasks.submissions': grant(
    'all',
    'view',
    'create',
    'edit',
    'approve',
    'return',
    'export',
    'archive',
    'manage',
  ),
  'tasks.tracking': grant('all', 'view', 'export'),
  'calendar.academic': grant('all', 'view', 'create', 'edit', 'archive', 'manage'),
  'meetings.manage': grant('all', 'view', 'create', 'edit', 'cancel', 'archive', 'manage'),
  'meetings.attendance': grant('all', 'view', 'edit', 'export'),
  'meetings.minutes': grant('all', 'view', 'create', 'edit', 'export', 'archive'),
  'personnel.responsibilities': grant('all', 'view', 'edit'),
  'personnel.coordination': grant('all', 'view', 'create', 'edit'),
  'knowledge.library': grant('all', 'view', 'create', 'edit', 'export', 'archive', 'manage'),
  'knowledge.announcements': grant('all', 'view', 'create', 'edit', 'archive', 'manage'),
  'knowledge.surveys': grant('all', 'view', 'create', 'edit', 'export', 'archive', 'manage'),
  'intelligence.reports': grant('all', 'view', 'export'),
});

/** สิทธิ์ดูภาพรวมของผู้บริหาร */
const EXECUTIVE_VIEW: RoleGrants = merge(
  STAFF_BASE,
  viewAll(
    'dashboard.executive',
    'services.insights',
    'documents.incoming',
    'documents.outgoing',
    'documents.approvals',
    'documents.memos',
    'documents.orders',
    'documents.announcements',
    'documents.certificates',
    'classLeave.requests',
    'classLeave.approvals',
    'classLeave.notices',
    'classLeave.attendance',
    'classLeave.analytics',
    'tasks.assignments',
    'tasks.board',
    'tasks.submissions',
    'tasks.tracking',
    'meetings.manage',
    'meetings.attendance',
    'meetings.minutes',
    'personnel.responsibilities',
    'personnel.coordination',
    'knowledge.surveys',
    'intelligence.reports',
  ),
  {
    'intelligence.reports': grant('all', 'view', 'export'),
    'classLeave.analytics': grant('all', 'view', 'export'),
  },
);

/** สิทธิ์พิจารณาอนุมัติเอกสารของผู้บริหาร */
const EXECUTIVE_APPROVAL: RoleGrants = {
  'documents.approvals': grant('all', 'view', 'approve', 'reject', 'return'),
  'documents.orders': grant('all', 'view', 'approve', 'reject', 'return'),
  'documents.announcements': grant('all', 'view', 'approve', 'reject', 'return'),
  'classLeave.approvals': grant('all', 'view', 'approve', 'reject', 'return'),
  'meetings.minutes': grant('all', 'view', 'approve'),
};

const DIRECTOR: RoleGrants = merge(EXECUTIVE_VIEW, EXECUTIVE_APPROVAL, {
  'documents.memos': grant('own', 'create', 'edit', 'submit', 'cancel'),
});

const DEPUTY_DIRECTOR: RoleGrants = merge(EXECUTIVE_VIEW, EXECUTIVE_APPROVAL, AUTHOR, {
  'tasks.assignments': grant('all', 'view', 'create', 'edit', 'cancel'),
  'tasks.board': grant('all', 'view', 'edit'),
  'tasks.tracking': grant('all', 'view', 'export'),
  'meetings.manage': grant('all', 'view', 'create', 'edit', 'cancel'),
  'knowledge.announcements': grant('all', 'view', 'create', 'edit'),
});

const ACADEMIC_HEAD: RoleGrants = merge(EXECUTIVE_VIEW, EXECUTIVE_APPROVAL, AUTHOR, {
  'tasks.assignments': grant('all', 'view', 'create', 'edit', 'cancel'),
  'tasks.board': grant('all', 'view', 'edit'),
  'tasks.submissions': grant('all', 'view', 'create', 'edit', 'approve', 'return', 'export'),
  'tasks.tracking': grant('all', 'view', 'export'),
  'calendar.academic': grant('all', 'view', 'create', 'edit'),
  'meetings.manage': grant('all', 'view', 'create', 'edit', 'cancel'),
  'meetings.attendance': grant('all', 'view', 'edit', 'export'),
  'meetings.minutes': grant('all', 'view', 'create', 'edit', 'approve', 'export'),
  'personnel.responsibilities': grant('all', 'view', 'edit'),
  'personnel.coordination': grant('all', 'view', 'create', 'edit'),
  'knowledge.library': grant('all', 'view', 'create', 'edit'),
  'knowledge.announcements': grant('all', 'view', 'create', 'edit'),
  'knowledge.surveys': grant('all', 'view', 'create', 'edit', 'export'),
});

/**
 * Super Admin ดูแลระบบ ไม่ใช่ผู้พิจารณาเอกสาร
 * จึงไม่มี approve / reject / return / submit ในงานเอกสารใด ๆ เว้นแต่ได้รับบทบาทอื่นเพิ่ม
 */
const SUPER_ADMIN: RoleGrants = merge(
  STAFF_BASE,
  viewAll(
    'dashboard.executive',
    'documents.incoming',
    'documents.outgoing',
    'documents.approvals',
    'documents.memos',
    'documents.orders',
    'documents.announcements',
    'documents.certificates',
    'classLeave.requests',
    'classLeave.approvals',
    'classLeave.notices',
    'classLeave.attendance',
    'classLeave.analytics',
    'tasks.assignments',
    'tasks.board',
    'tasks.submissions',
    'tasks.tracking',
    'meetings.manage',
    'meetings.attendance',
    'meetings.minutes',
    'personnel.responsibilities',
    'personnel.coordination',
    'knowledge.surveys',
    'intelligence.reports',
  ),
  {
    'services.manage': grant('all', 'view', 'create', 'edit', 'archive', 'manage'),
    'services.insights': grant('all', 'view', 'export'),
    'personnel.organization': grant('all', 'view', 'edit', 'manage'),
    'knowledge.library': grant('all', 'view', 'create', 'edit', 'archive', 'manage'),
    'intelligence.reports': grant('all', 'view', 'export'),
    'intelligence.admin': grant('all', 'view', 'create', 'edit', 'export', 'archive', 'manage'),
  },
);

/** ผู้ตรวจสอบ: ดูและส่งออกรายงานเท่านั้น ไม่มี action ที่เปลี่ยนแปลงข้อมูล */
const AUDITOR: RoleGrants = merge(
  viewAll(
    'dashboard.executive',
    'dashboard.workspace',
    'dashboard.notifications',
    'services.directory',
    'services.insights',
    'documents.incoming',
    'documents.outgoing',
    'documents.approvals',
    'documents.memos',
    'documents.orders',
    'documents.announcements',
    'documents.certificates',
    'classLeave.requests',
    'classLeave.approvals',
    'classLeave.attendance',
    'classLeave.analytics',
    'tasks.assignments',
    'tasks.submissions',
    'tasks.tracking',
    'calendar.academic',
    'meetings.manage',
    'meetings.attendance',
    'meetings.minutes',
    'personnel.organization',
    'personnel.responsibilities',
    'personnel.coordination',
    'knowledge.library',
    'knowledge.announcements',
    'knowledge.surveys',
    'intelligence.admin',
  ),
  {
    'dashboard.workspace': grant('own', 'view'),
    'dashboard.notifications': grant('own', 'view', 'edit'),
    'intelligence.reports': grant('all', 'view', 'export'),
  },
);

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  super_admin: SUPER_ADMIN,
  director: DIRECTOR,
  deputy_director: DEPUTY_DIRECTOR,
  academic_head: ACADEMIC_HEAD,
  office_staff: OFFICE_STAFF,
  department_head: DEPARTMENT_HEAD,
  unit_head: UNIT_HEAD,
  teacher: TEACHER,
  auditor: AUDITOR,
};

export interface PermissionEntry {
  roleId: RoleId;
  resource: ResourceKey;
  action: Action;
  scope: Scope;
}

/** แปลง matrix เป็นรายการแบน สำหรับเขียนลงชีต RolePermissions และสร้างเอกสาร */
export function flattenMatrix(matrix: PermissionMatrix): PermissionEntry[] {
  const entries: PermissionEntry[] = [];
  for (const roleId of ROLE_IDS) {
    const grants = matrix[roleId];
    for (const resource of RESOURCE_KEYS) {
      const actions = grants[resource];
      if (!actions) continue;
      for (const action of ACTIONS) {
        const scope = actions[action];
        if (scope) entries.push({ roleId, resource, action, scope });
      }
    }
  }
  return entries;
}

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}
