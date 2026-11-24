/**
 * ข้อมูลอ้างอิงตั้งต้นของระบบ (ไม่ใช่ข้อมูลสมมติ)
 *
 * เรียกจาก Setup Wizard (Production) และจากตัวเติมข้อมูลสาธิต (Development)
 * Idempotent: เพิ่มเฉพาะรายการที่ยังไม่มี ไม่แก้ไขหรือลบสิ่งที่ผู้ดูแลตั้งค่าไว้แล้ว
 *
 * ที่มาของข้อมูล:
 *   - บทบาทและ Permission Matrix ............ ข้อ 10 ของ Master Prompt
 *   - กลุ่มสาระการเรียนรู้ 8 กลุ่ม ............ หลักสูตรแกนกลางฯ
 *   - รายการบริการของ Academic Service Hub ... ข้อ 19 (ไม่มีการสร้าง URL ของระบบโรงเรียนขึ้นเอง)
 *   - หมวดหมู่คลังเอกสาร .................... ข้อ 17
 *   - ขั้นตอนอนุมัติตั้งต้น ................... ตัวอย่างในข้อ 12 — ติดธง "ตัวอย่าง" ต้องยืนยันกับโรงเรียนก่อนใช้จริง
 */
import 'server-only';
import type { IconKey } from '@/config/icons';
import { RESOURCE_KEYS } from '@/config/modules';
import { ACTIONS, ACTION_LABEL, DEFAULT_PERMISSION_MATRIX, flattenMatrix } from '@/config/permissions';
import { ROLES } from '@/config/roles';
import { LEARNING_AREAS, SYSTEM } from '@/config/school';
import type { Db, UnitOfWork } from '@/repositories/db';
import { ApprovalSteps, ApprovalWorkflows, DocumentTypes } from '@/schemas/database/document';
import { DocumentCategories } from '@/schemas/database/knowledge';
import { Departments, Permissions, RolePermissions, Roles } from '@/schemas/database/master';
import { AcademicServices, ServiceCategories } from '@/schemas/database/service-hub';
import type { InsertOf, TableDef } from '@/schemas/database/types';
import { SETTING_KEYS, putSetting } from './settings';

type ServiceColor = InsertOf<typeof AcademicServices>['color'];

interface ServiceSeed {
  id: string;
  nameTh: string;
  nameEn?: string;
  description: string;
  owner?: string;
  icon: IconKey;
  /** ระบุได้เฉพาะ URL ทางการของเครื่องมือสาธารณะ ระบบของโรงเรียนต้องให้ผู้ดูแลกรอกเอง */
  url?: string;
  internalPath?: string;
  pinned?: boolean;
}

interface CategorySeed {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string;
  services: ServiceSeed[];
}

const SERVICE_COLORS: readonly ServiceColor[] = ['terracotta', 'rose', 'burgundy', 'brown', 'sand'];

export const SERVICE_CATALOG: readonly CategorySeed[] = [
  {
    id: 'svc-cat-academic',
    code: 'academic',
    nameTh: 'งานวิชาการ',
    nameEn: 'Academic Work',
    description: 'ระบบและเว็บไซต์ของงานต่าง ๆ ในกลุ่มบริหารวิชาการ',
    services: [
      { id: 'svc-assessment', nameTh: 'งานวัดและประเมินผล', nameEn: 'Assessment & Evaluation', description: 'ระบบและแบบฟอร์มของงานวัดและประเมินผลการเรียน', owner: 'งานวัดและประเมินผล', icon: 'assessment', pinned: true },
      { id: 'svc-registrar', nameTh: 'งานทะเบียนนักเรียน', nameEn: 'Student Registrar', description: 'ทะเบียนประวัติและเอกสารหลักฐานการศึกษา', owner: 'งานทะเบียนนักเรียน', icon: 'personnel' },
      { id: 'svc-curriculum', nameTh: 'งานพัฒนาหลักสูตร', nameEn: 'Curriculum Development', description: 'หลักสูตรสถานศึกษาและโครงสร้างรายวิชา', owner: 'งานพัฒนาหลักสูตร', icon: 'academic' },
      { id: 'svc-timetable', nameTh: 'งานจัดตารางเรียนและตารางสอน', nameEn: 'Timetabling', description: 'ตารางเรียน ตารางสอน และการจัดสอนแทน', owner: 'งานจัดตารางเรียนและตารางสอน', icon: 'calendar' },
      { id: 'svc-exam', nameTh: 'งานจัดการสอบ', nameEn: 'Examination', description: 'กำหนดการสอบ ตารางสอบ และการคุมสอบ', owner: 'งานจัดการสอบ', icon: 'survey' },
      { id: 'svc-supervision', nameTh: 'งานนิเทศการศึกษา', nameEn: 'Instructional Supervision', description: 'การนิเทศการสอนและบันทึกการนิเทศ', owner: 'งานนิเทศการศึกษา', icon: 'meetingAttendance' },
      { id: 'svc-research', nameTh: 'งานวิจัยในชั้นเรียน', nameEn: 'Classroom Research', description: 'งานวิจัยในชั้นเรียนและการเผยแพร่ผลงาน', owner: 'งานวิจัยในชั้นเรียน', icon: 'report' },
      { id: 'svc-qa', nameTh: 'งานประกันคุณภาพ', nameEn: 'Quality Assurance', description: 'มาตรฐานการศึกษาและรายงานการประเมินตนเอง', owner: 'งานประกันคุณภาพ', icon: 'approval' },
      { id: 'svc-guidance', nameTh: 'งานแนะแนว', nameEn: 'Guidance', description: 'การแนะแนวการศึกษาต่อและทุนการศึกษา', owner: 'งานแนะแนว', icon: 'coordination' },
      { id: 'svc-clubs', nameTh: 'งานกิจกรรมชุมนุม', nameEn: 'Student Clubs', description: 'การเลือกและบันทึกกิจกรรมชุมนุม', owner: 'งานกิจกรรมชุมนุม', icon: 'meeting' },
      { id: 'svc-special-program', nameTh: 'งานห้องเรียนพิเศษ', nameEn: 'Special Programs', description: 'ข้อมูลและกิจกรรมของห้องเรียนพิเศษ', owner: 'งานห้องเรียนพิเศษ', icon: 'favorite' },
      { id: 'svc-is', nameTh: 'งาน IS', nameEn: 'Independent Study', description: 'การศึกษาค้นคว้าอิสระของนักเรียน', owner: 'งาน IS', icon: 'memo' },
      { id: 'svc-plc', nameTh: 'งาน PLC', nameEn: 'Professional Learning Community', description: 'ชุมชนการเรียนรู้ทางวิชาชีพของครู', owner: 'งาน PLC', icon: 'organization' },
      { id: 'svc-admission', nameTh: 'งานรับนักเรียน', nameEn: 'Admission', description: 'การรับสมัครและประกาศผลการรับนักเรียน', owner: 'งานรับนักเรียน', icon: 'incoming' },
      { id: 'svc-media', nameTh: 'งานสื่อและนวัตกรรมการศึกษา', nameEn: 'Educational Media & Innovation', description: 'สื่อการสอนและนวัตกรรมการเรียนรู้', owner: 'งานสื่อและนวัตกรรมการศึกษา', icon: 'library' },
    ],
  },
  {
    id: 'svc-cat-school',
    code: 'school_digital',
    nameTh: 'ระบบดิจิทัลของโรงเรียน',
    nameEn: 'School Digital Systems',
    description: 'ระบบสารสนเทศที่โรงเรียนใช้งานอยู่',
    services: [
      { id: 'svc-tuns-sis', nameTh: 'ระบบสารสนเทศนักเรียน', nameEn: 'TUNS-SIS', description: 'ข้อมูลนักเรียน ห้องเรียน รายวิชา และตารางเรียน', icon: 'academic', pinned: true },
      { id: 'svc-tuns-achievements', nameTh: 'ระบบผลงานและรางวัลโรงเรียน', nameEn: 'TUNS-Achievements', description: 'ผลงาน รางวัล และกิจกรรมการแข่งขันของโรงเรียน', icon: 'achievement', pinned: true },
      { id: 'svc-school-website', nameTh: 'เว็บไซต์หลักโรงเรียน', nameEn: 'School Website', description: 'ข่าวสารและข้อมูลทั่วไปของโรงเรียน', icon: 'home' },
    ],
  },
  {
    id: 'svc-cat-external',
    code: 'external',
    nameTh: 'ระบบภายนอกและเครื่องมือ',
    nameEn: 'External Systems & Tools',
    description: 'ระบบของหน่วยงานต้นสังกัดและเครื่องมือที่ใช้ร่วมกัน',
    services: [
      { id: 'svc-sgs', nameTh: 'ระบบ SGS', nameEn: 'SGS', description: 'ระบบบริหารจัดการผลการเรียนของ สพฐ.', icon: 'assessment' },
      { id: 'svc-dmc', nameTh: 'ระบบ DMC', nameEn: 'DMC', description: 'ระบบจัดเก็บข้อมูลนักเรียนรายบุคคล', icon: 'personnel' },
      { id: 'svc-school-connex', nameTh: 'School Connex', nameEn: 'School Connex', description: 'ระบบบริการข้อมูลของสถานศึกษา', icon: 'organization' },
      { id: 'svc-google-drive', nameTh: 'Google Drive', nameEn: 'Google Drive', description: 'พื้นที่จัดเก็บไฟล์ของ Google Workspace', icon: 'drive', url: 'https://drive.google.com/' },
      { id: 'svc-google-calendar', nameTh: 'Google Calendar', nameEn: 'Google Calendar', description: 'ปฏิทินและการนัดหมาย', icon: 'calendar', url: 'https://calendar.google.com/' },
      { id: 'svc-google-forms', nameTh: 'Google Forms', nameEn: 'Google Forms', description: 'แบบฟอร์มและแบบสอบถามออนไลน์', icon: 'survey', url: 'https://docs.google.com/forms/' },
      { id: 'svc-google-classroom', nameTh: 'Google Classroom', nameEn: 'Google Classroom', description: 'ห้องเรียนออนไลน์', icon: 'academic', url: 'https://classroom.google.com/' },
      { id: 'svc-area-office', nameTh: 'เว็บไซต์สำนักงานเขตพื้นที่การศึกษา', nameEn: 'Educational Service Area Office', description: 'ประกาศและหนังสือราชการจากเขตพื้นที่การศึกษา', icon: 'external' },
      { id: 'svc-obec', nameTh: 'เว็บไซต์สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน', nameEn: 'OBEC', description: 'ข่าวและนโยบายจาก สพฐ.', icon: 'external' },
    ],
  },
  {
    id: 'svc-cat-internal',
    code: 'internal',
    nameTh: 'บริการในระบบนี้',
    nameEn: 'In This Workspace',
    description: 'ระบบย่อยของ TUNS Academic Office ที่เปิดใช้งานแล้ว',
    services: [
      { id: 'svc-class-leave', nameTh: 'หนังสือขอเวลาเรียน', nameEn: 'Class Leave', description: 'สร้างหนังสือขอเวลาเรียนและติดตามการอนุมัติ', owner: SYSTEM.unitNameTh, icon: 'classLeave', internalPath: '/class-leave', pinned: true },
      { id: 'svc-approvals', nameTh: 'เสนออนุมัติเอกสาร', nameEn: 'Approvals', description: 'ติดตามและพิจารณาเอกสารที่เสนอ', owner: SYSTEM.unitNameTh, icon: 'approval', internalPath: '/documents/approvals' },
      { id: 'svc-library', nameTh: 'คลังเอกสารกลาง', nameEn: 'Document Library', description: 'แบบฟอร์ม คู่มือ ระเบียบ และแนวปฏิบัติ', owner: SYSTEM.unitNameTh, icon: 'library', internalPath: '/library', pinned: true },
    ],
  },
];

export const LIBRARY_CATEGORIES = [
  { id: 'libcat-forms', code: 'forms', name: 'แบบฟอร์ม' },
  { id: 'libcat-manuals', code: 'manuals', name: 'คู่มือ' },
  { id: 'libcat-regulations', code: 'regulations', name: 'ระเบียบ' },
  { id: 'libcat-guidelines', code: 'guidelines', name: 'แนวปฏิบัติ' },
  { id: 'libcat-circulars', code: 'circulars', name: 'หนังสือเวียน' },
  { id: 'libcat-orders', code: 'orders', name: 'คำสั่ง' },
  { id: 'libcat-announcements', code: 'announcements', name: 'ประกาศ' },
  { id: 'libcat-calendars', code: 'calendars', name: 'ปฏิทิน' },
  { id: 'libcat-minutes', code: 'minutes', name: 'รายงานการประชุม' },
  { id: 'libcat-archive', code: 'archive', name: 'เอกสารย้อนหลัง' },
] as const;

export const CLASS_LEAVE_WORKFLOW_ID = 'wf-class-leave-default';

/** ขั้นตอนตัวอย่างตามข้อ 12: ครูผู้จัดทำ → หัวหน้ากลุ่มสาระ → สำนักงานวิชาการ → หัวหน้ากลุ่มบริหารวิชาการ → รองผู้อำนวยการ → ผู้อำนวยการ */
const CLASS_LEAVE_STEPS: Omit<InsertOf<typeof ApprovalSteps>, 'workflow_id' | 'step_order'>[] = [
  { name: 'หัวหน้ากลุ่มสาระตรวจสอบ', step_kind: 'review', approver_type: 'requester_department_head', approver_ref: null, on_missing: 'skip', allow_self: false, is_active: true },
  { name: 'สำนักงานวิชาการตรวจสอบ', step_kind: 'review', approver_type: 'role', approver_ref: 'office_staff', on_missing: 'block', allow_self: false, is_active: true },
  { name: 'หัวหน้ากลุ่มบริหารวิชาการพิจารณา', step_kind: 'approve', approver_type: 'role', approver_ref: 'academic_head', on_missing: 'skip', allow_self: false, is_active: true },
  { name: 'รองผู้อำนวยการกลุ่มบริหารวิชาการพิจารณา', step_kind: 'approve', approver_type: 'role', approver_ref: 'deputy_director', on_missing: 'skip', allow_self: false, is_active: true },
  { name: 'ผู้อำนวยการโรงเรียนอนุมัติ', step_kind: 'approve', approver_type: 'role', approver_ref: 'director', on_missing: 'block', allow_self: false, is_active: true },
];

export interface ProvisionSummary {
  /** จำนวนแถวที่เพิ่มในแต่ละตาราง (ตารางที่ครบอยู่แล้วไม่ปรากฏ) */
  added: Record<string, number>;
}

async function addMissing<T extends TableDef>(
  db: Db,
  uow: UnitOfWork,
  table: T,
  rows: (InsertOf<T> & { id: string })[],
  summary: ProvisionSummary,
): Promise<void> {
  const repo = db.repo(table);
  const existing = new Set((await repo.all()).map((row) => (row as { id: string }).id));
  let added = 0;
  for (const row of rows) {
    if (existing.has(row.id)) continue;
    uow.add(repo.insert(row));
    added += 1;
  }
  if (added > 0) summary.added[table.key] = added;
}

export function departmentId(code: string): string {
  return `dept-${code}`;
}

/**
 * เพิ่มข้อมูลอ้างอิงที่ยังขาด — เรียกซ้ำได้โดยไม่เกิดรายการซ้ำ
 * ไม่แตะบัญชีผู้ใช้ นักเรียน หรือข้อมูลของโรงเรียน
 */
export async function provisionReferenceData(db: Db, actorId: string | null): Promise<ProvisionSummary> {
  const summary: ProvisionSummary = { added: {} };
  const uow = db.unitOfWork({ action: 'setup.provisionReferenceData', actorId });

  await addMissing(
    db,
    uow,
    Roles,
    ROLES.map((role) => ({
      id: role.id,
      name_th: role.nameTh,
      name_en: role.nameEn,
      description: role.descriptionTh,
      assignment_scope: role.assignmentScope,
      sort_order: role.order,
    })),
    summary,
  );
  await addMissing(
    db,
    uow,
    Permissions,
    RESOURCE_KEYS.flatMap((resource) =>
      ACTIONS.map((action) => ({
        id: `${resource}:${action}`,
        resource,
        action,
        description: ACTION_LABEL[action].description,
      })),
    ),
    summary,
  );
  // Permission Matrix: เติมเฉพาะเมื่อยังไม่มีแถวใดเลย เพื่อไม่ทับสิทธิ์ที่ผู้ดูแลปรับไว้
  if ((await db.repo(RolePermissions).count()) === 0) {
    const entries = flattenMatrix(DEFAULT_PERMISSION_MATRIX);
    for (const entry of entries) {
      uow.add(
        db.repo(RolePermissions).insert({
          id: `${entry.roleId}:${entry.resource}:${entry.action}`,
          role_id: entry.roleId,
          resource: entry.resource,
          action: entry.action,
          scope: entry.scope,
        }),
      );
    }
    summary.added[RolePermissions.key] = entries.length;
  }
  await addMissing(
    db,
    uow,
    Departments,
    LEARNING_AREAS.map((area) => ({
      id: departmentId(area.code),
      code: area.code,
      name_th: area.nameTh,
      department_type: 'learning_area' as const,
      sort_order: area.order,
      status: 'active' as const,
    })),
    summary,
  );
  await addMissing(
    db,
    uow,
    ServiceCategories,
    SERVICE_CATALOG.map((category, index) => ({
      id: category.id,
      code: category.code,
      name_th: category.nameTh,
      name_en: category.nameEn,
      description: category.description,
      sort_order: index + 1,
      is_visible: true,
    })),
    summary,
  );
  let colorIndex = 0;
  await addMissing(
    db,
    uow,
    AcademicServices,
    SERVICE_CATALOG.flatMap((category) =>
      category.services.map((service, index) => {
        const color = SERVICE_COLORS[colorIndex % SERVICE_COLORS.length] as ServiceColor;
        colorIndex += 1;
        return {
          id: service.id,
          category_id: category.id,
          name_th: service.nameTh,
          name_en: service.nameEn ?? null,
          description: service.description,
          owner_unit: service.owner ?? null,
          link_type: service.internalPath ? ('internal' as const) : ('external' as const),
          url: service.url ?? null,
          internal_path: service.internalPath ?? null,
          icon: service.icon,
          color,
          status: 'active' as const,
          is_visible: true,
          is_pinned: service.pinned === true,
          audience: 'all' as const,
          sort_order: index + 1,
        };
      }),
    ),
    summary,
  );
  await addMissing(
    db,
    uow,
    DocumentCategories,
    LIBRARY_CATEGORIES.map((category, index) => ({
      id: category.id,
      code: category.code,
      name_th: category.name,
      folder_name: category.name,
      sort_order: index + 1,
      is_active: true,
    })),
    summary,
  );
  await addMissing(
    db,
    uow,
    DocumentTypes,
    [
      {
        id: 'class_leave',
        name_th: 'หนังสือขอเวลาเรียนนักเรียน',
        module_code: 'CL',
        description: 'หนังสือขออนุญาตนำนักเรียนเข้าร่วมกิจกรรมในเวลาเรียน',
        default_workflow_id: CLASS_LEAVE_WORKFLOW_ID,
        requires_approval: true,
        sort_order: 1,
        is_active: true,
      },
    ],
    summary,
  );
  await addMissing(
    db,
    uow,
    ApprovalWorkflows,
    [
      {
        id: CLASS_LEAVE_WORKFLOW_ID,
        code: 'class_leave_default',
        name: 'การอนุมัติหนังสือขอเวลาเรียน (ขั้นตอนตัวอย่าง)',
        subject_type: 'class_leave',
        description:
          'ขั้นตอนตัวอย่างตาม Master Prompt ต้องยืนยันกับกระบวนการจริงของโรงเรียน และปรับได้ใน Approval Workflow Builder',
        workflow_version: 1,
        is_default: true,
        is_active: true,
        is_demo: true,
      },
    ],
    summary,
  );
  await addMissing(
    db,
    uow,
    ApprovalSteps,
    CLASS_LEAVE_STEPS.map((step, index) => ({
      ...step,
      id: `${CLASS_LEAVE_WORKFLOW_ID}-step-${index + 1}`,
      workflow_id: CLASS_LEAVE_WORKFLOW_ID,
      step_order: index + 1,
    })),
    summary,
  );
  await putSetting(db, uow, {
    key: SETTING_KEYS.schoolName,
    value: SYSTEM.schoolNameTh,
    category: 'school',
    description: 'ชื่อสถานศึกษาที่แสดงในระบบและเอกสาร',
  });
  await putSetting(db, uow, {
    key: SETTING_KEYS.cumulativePeriodWarning,
    value: '20',
    valueType: 'number',
    category: 'class_leave',
    description:
      'จำนวนคาบสะสมจากกิจกรรมต่อภาคเรียนที่ให้แสดงข้อสังเกตแก่ผู้พิจารณา (ปรับได้ ไม่ใช้ตัดสินนักเรียนโดยอัตโนมัติ)',
  });

  if (uow.size > 0) {
    uow.audit({
      action: 'setup.provisionReferenceData',
      category: 'system',
      resource: 'intelligence.admin',
      summary: 'เพิ่มข้อมูลอ้างอิงตั้งต้นของระบบ',
      metadata: summary.added,
    });
    await uow.commit();
  }
  return summary;
}
