/**
 * Registry กลางของ 9 หมวด 34 ระบบย่อย (ข้อ 04 และ 33 ของ Master Prompt)
 *
 * เป็นแหล่งความจริงเดียวของ: Sitemap, Sidebar, Permission resource key, หน้า "สถานะการพัฒนาระบบ"
 * และเอกสาร docs/SITEMAP.md + ตารางใน docs/PROGRESS.md (generate ด้วย `npm run docs:generate`)
 *
 * `released` = เปิดใช้ในรุ่นนี้และแสดงในเมนู ระบบที่ยังไม่เปิดใช้จะไม่แสดงเมนู
 * เพื่อไม่ให้มีปุ่มหรือเมนูที่กดแล้วไม่ทำงาน (ข้อ 40)
 */
import type { IconKey } from './icons';

export const SUBSYSTEM_STATUSES = [
  'not_started',
  'in_progress',
  'implemented',
  'tested',
  'ready_for_uat',
  'production_ready',
  'blocked',
] as const;

export type SubsystemStatus = (typeof SUBSYSTEM_STATUSES)[number];

export const SUBSYSTEM_STATUS_LABEL: Record<SubsystemStatus, { en: string; th: string }> = {
  not_started: { en: 'Not Started', th: 'ยังไม่เริ่ม' },
  in_progress: { en: 'In Progress', th: 'กำลังพัฒนา' },
  implemented: { en: 'Implemented', th: 'พัฒนาแล้ว' },
  tested: { en: 'Tested', th: 'ทดสอบแล้ว' },
  ready_for_uat: { en: 'Ready for UAT', th: 'พร้อมทดสอบโดยผู้ใช้' },
  production_ready: { en: 'Production Ready', th: 'พร้อมใช้งานจริง' },
  blocked: { en: 'Blocked', th: 'ติดขัด' },
};

export interface ModuleDef {
  /** รหัสหมวดตาม Master Prompt เช่น '01' */
  id: string;
  key: string;
  nameTh: string;
  nameEn: string;
  /** ชื่อกลุ่มเมนูใน Sidebar (ข้อ 33) */
  navLabel: string;
  icon: IconKey;
  /** ลำดับใน Sidebar — หมวด 09 อยู่ถัดจากหน้าแรก */
  navOrder: number;
}

export interface SubsystemDef {
  /** รหัสระบบย่อย เช่น '03.1' */
  id: string;
  /** Resource key สำหรับ Permission Matrix เช่น 'classLeave.requests' */
  key: string;
  moduleId: string;
  nameTh: string;
  nameEn: string;
  /** ชื่อเมนูใน Sidebar (ข้อ 33) */
  navLabel: string;
  path: string;
  icon: IconKey;
  /** Phase ใน Development Roadmap (ข้อ 38) ที่ระบบนี้ถูกพัฒนาเป็นหลัก */
  phase: number;
  status: SubsystemStatus;
  released: boolean;
  /** สรุปสิ่งที่ทำแล้ว/ยังขาดในรุ่นนี้ แสดงในหน้าสถานะและ PROGRESS.md */
  note: string;
}

export const MODULES = [
  {
    id: '01',
    key: 'dashboard',
    nameTh: 'ภาพรวมสำนักงาน',
    nameEn: 'Office Dashboard',
    navLabel: 'ภาพรวมสำนักงาน',
    icon: 'home',
    navOrder: 1,
  },
  {
    id: '09',
    key: 'services',
    nameTh: 'ศูนย์รวมระบบและบริการวิชาการ',
    nameEn: 'Academic Service Hub',
    navLabel: 'ศูนย์รวมระบบวิชาการ',
    icon: 'serviceHub',
    navOrder: 2,
  },
  {
    id: '02',
    key: 'documents',
    nameTh: 'งานสารบรรณและเอกสาร',
    nameEn: 'Document Management',
    navLabel: 'สารบรรณและเอกสาร',
    icon: 'documents',
    navOrder: 3,
  },
  {
    id: '03',
    key: 'classLeave',
    nameTh: 'ระบบขอเวลาเรียนนักเรียน',
    nameEn: 'Student Class Leave',
    navLabel: 'ขอเวลาเรียนนักเรียน',
    icon: 'classLeave',
    navOrder: 4,
  },
  {
    id: '04',
    key: 'tasks',
    nameTh: 'งานมอบหมายและติดตามงาน',
    nameEn: 'Task Management',
    navLabel: 'มอบหมายและติดตามงาน',
    icon: 'tasks',
    navOrder: 5,
  },
  {
    id: '05',
    key: 'calendar',
    nameTh: 'งานปฏิทินและการประชุม',
    nameEn: 'Calendar & Meeting',
    navLabel: 'ปฏิทินและการประชุม',
    icon: 'calendar',
    navOrder: 6,
  },
  {
    id: '06',
    key: 'personnel',
    nameTh: 'งานบุคลากรและประสานงาน',
    nameEn: 'Personnel & Coordination',
    navLabel: 'บุคลากรและประสานงาน',
    icon: 'personnel',
    navOrder: 7,
  },
  {
    id: '07',
    key: 'knowledge',
    nameTh: 'คลังเอกสารและประชาสัมพันธ์',
    nameEn: 'Knowledge Center',
    navLabel: 'คลังเอกสารและประชาสัมพันธ์',
    icon: 'library',
    navOrder: 8,
  },
  {
    id: '08',
    key: 'intelligence',
    nameTh: 'งานสารสนเทศและรายงาน',
    nameEn: 'Office Intelligence',
    navLabel: 'สารสนเทศและรายงาน',
    icon: 'report',
    navOrder: 9,
  },
] as const satisfies readonly ModuleDef[];

export const SUBSYSTEMS = [
  // ── Module 01 — ภาพรวมสำนักงาน ─────────────────────────────────────────────
  {
    id: '01.1',
    key: 'dashboard.executive',
    moduleId: '01',
    nameTh: 'ภาพรวมผู้บริหาร',
    nameEn: 'Executive Dashboard',
    navLabel: 'ภาพรวมผู้บริหาร',
    path: '/dashboard',
    icon: 'dashboard',
    phase: 1,
    status: 'not_started',
    released: false,
    note: 'วางแผนใน Phase 1 ต่อจากหน้ามาตรฐาน 6 หน้า',
  },
  {
    id: '01.2',
    key: 'dashboard.workspace',
    moduleId: '01',
    nameTh: 'พื้นที่ทำงานของฉัน',
    nameEn: 'My Workspace',
    navLabel: 'พื้นที่ทำงานของฉัน',
    path: '/workspace',
    icon: 'home',
    phase: 1,
    status: 'implemented',
    released: true,
    note: 'ทุกส่วนดึงข้อมูลจริงจากที่เก็บข้อมูล: บริการใช้บ่อย งานที่ต้องทำ เอกสารของฉัน ปฏิทิน กิจกรรมนักเรียนวันนี้ การแจ้งเตือน',
  },
  {
    id: '01.3',
    key: 'dashboard.notifications',
    moduleId: '01',
    nameTh: 'ศูนย์การแจ้งเตือน',
    nameEn: 'Notification Center',
    navLabel: 'การแจ้งเตือน',
    path: '/notifications',
    icon: 'notification',
    phase: 1,
    status: 'not_started',
    released: false,
    note: '',
  },
  // ── Module 09 — ศูนย์รวมระบบและบริการวิชาการ ───────────────────────────────
  {
    id: '09.1',
    key: 'services.directory',
    moduleId: '09',
    nameTh: 'ระบบและบริการทั้งหมด',
    nameEn: 'Academic Application Directory',
    navLabel: 'ระบบและบริการทั้งหมด',
    path: '/services',
    icon: 'serviceHub',
    phase: 1,
    status: 'implemented',
    released: true,
    note: '',
  },
  {
    id: '09.2',
    key: 'services.manage',
    moduleId: '09',
    nameTh: 'จัดการลิงก์',
    nameEn: 'Application Management',
    navLabel: 'จัดการลิงก์',
    path: '/services/manage',
    icon: 'serviceManage',
    phase: 1,
    status: 'implemented',
    released: true,
    note: '',
  },
  {
    id: '09.3',
    key: 'services.insights',
    moduleId: '09',
    nameTh: 'รายการโปรดและสถิติการใช้งาน',
    nameEn: 'Personalized Service Hub & Analytics',
    navLabel: 'รายการโปรดและสถิติ',
    path: '/services/insights',
    icon: 'favorite',
    phase: 1,
    status: 'implemented',
    released: true,
    note: '',
  },
  // ── Module 02 — งานสารบรรณและเอกสาร ────────────────────────────────────────
  {
    id: '02.1',
    key: 'documents.incoming',
    moduleId: '02',
    nameTh: 'ทะเบียนหนังสือรับ',
    nameEn: 'Incoming Document Register',
    navLabel: 'หนังสือรับ',
    path: '/documents/incoming',
    icon: 'incoming',
    phase: 2,
    status: 'not_started',
    released: false,
    note: 'Schema และ File Routing รองรับแล้ว หน้าจอวางแผนใน Phase 2',
  },
  {
    id: '02.2',
    key: 'documents.outgoing',
    moduleId: '02',
    nameTh: 'ทะเบียนหนังสือส่ง',
    nameEn: 'Outgoing Document Register',
    navLabel: 'หนังสือส่ง',
    path: '/documents/outgoing',
    icon: 'outgoing',
    phase: 2,
    status: 'not_started',
    released: false,
    note: 'Schema และ File Routing รองรับแล้ว หน้าจอวางแผนใน Phase 2',
  },
  {
    id: '02.3',
    key: 'documents.approvals',
    moduleId: '02',
    nameTh: 'ระบบเสนออนุมัติเอกสาร',
    nameEn: 'Document Approval Workflow',
    navLabel: 'เสนออนุมัติเอกสาร',
    path: '/documents/approvals',
    icon: 'approval',
    phase: 2,
    status: 'not_started',
    released: false,
    note: '',
  },
  {
    id: '02.4',
    key: 'documents.memos',
    moduleId: '02',
    nameTh: 'ระบบสร้างบันทึกข้อความ',
    nameEn: 'Smart Document Generator',
    navLabel: 'สร้างบันทึกข้อความ',
    path: '/documents/memos',
    icon: 'memo',
    phase: 2,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม รอแม่แบบ Google Docs จริงของโรงเรียน',
  },
  {
    id: '02.5',
    key: 'documents.orders',
    moduleId: '02',
    nameTh: 'ทะเบียนคำสั่ง',
    nameEn: 'Official Order Register',
    navLabel: 'ทะเบียนคำสั่ง',
    path: '/documents/orders',
    icon: 'order',
    phase: 2,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '02.6',
    key: 'documents.announcements',
    moduleId: '02',
    nameTh: 'ทะเบียนประกาศ',
    nameEn: 'Announcement Register',
    navLabel: 'ทะเบียนประกาศ',
    path: '/documents/announcements',
    icon: 'announcement',
    phase: 2,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '02.7',
    key: 'documents.certificates',
    moduleId: '02',
    nameTh: 'ระบบออกเกียรติบัตร',
    nameEn: 'Certificate Issuance',
    navLabel: 'เกียรติบัตร',
    path: '/documents/certificates',
    icon: 'certificate',
    phase: 2,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  // ── Module 03 — ระบบขอเวลาเรียนนักเรียน ────────────────────────────────────
  {
    id: '03.1',
    key: 'classLeave.requests',
    moduleId: '03',
    nameTh: 'สร้างหนังสือขอเวลาเรียน',
    nameEn: 'Class Leave Request',
    navLabel: 'สร้างหนังสือขอเวลาเรียน',
    path: '/class-leave',
    icon: 'classLeave',
    phase: 3,
    status: 'not_started',
    released: false,
    note: '',
  },
  {
    id: '03.2',
    key: 'classLeave.approvals',
    moduleId: '03',
    nameTh: 'ระบบพิจารณาอนุมัติ',
    nameEn: 'Class Leave Approval',
    navLabel: 'พิจารณาอนุมัติ',
    path: '/class-leave/approvals',
    icon: 'approval',
    phase: 3,
    status: 'not_started',
    released: false,
    note: '',
  },
  {
    id: '03.3',
    key: 'classLeave.notices',
    moduleId: '03',
    nameTh: 'ระบบแจ้งครูผู้สอน',
    nameEn: 'Teacher Notification',
    navLabel: 'แจ้งครูผู้สอน',
    path: '/class-leave/notices',
    icon: 'classLeaveNotice',
    phase: 3,
    status: 'not_started',
    released: false,
    note: '',
  },
  {
    id: '03.4',
    key: 'classLeave.attendance',
    moduleId: '03',
    nameTh: 'ตรวจสอบการเข้าร่วมกิจกรรม',
    nameEn: 'Activity Attendance',
    navLabel: 'ตรวจสอบการเข้าร่วมกิจกรรม',
    path: '/class-leave/attendance',
    icon: 'assessment',
    phase: 3,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '03.5',
    key: 'classLeave.analytics',
    moduleId: '03',
    nameTh: 'ประวัติและสถิติ',
    nameEn: 'History & Analytics',
    navLabel: 'ประวัติและสถิติ',
    path: '/class-leave/analytics',
    icon: 'report',
    phase: 3,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  // ── Module 04 — งานมอบหมายและติดตามงาน ────────────────────────────────────
  {
    id: '04.1',
    key: 'tasks.assignments',
    moduleId: '04',
    nameTh: 'ระบบมอบหมายงาน',
    nameEn: 'Task Assignment',
    navLabel: 'มอบหมายงาน',
    path: '/tasks/assignments',
    icon: 'tasks',
    phase: 4,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '04.2',
    key: 'tasks.board',
    moduleId: '04',
    nameTh: 'Task Board',
    nameEn: 'Task Board',
    navLabel: 'Task Board',
    path: '/tasks/board',
    icon: 'taskBoard',
    phase: 4,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '04.3',
    key: 'tasks.submissions',
    moduleId: '04',
    nameTh: 'ศูนย์รับส่งงานครู',
    nameEn: 'Submission Center',
    navLabel: 'ศูนย์รับส่งงานครู',
    path: '/tasks/submissions',
    icon: 'upload',
    phase: 4,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '04.4',
    key: 'tasks.tracking',
    moduleId: '04',
    nameTh: 'ระบบติดตามงานค้าง',
    nameEn: 'Outstanding Work Tracking',
    navLabel: 'ติดตามงานค้าง',
    path: '/tasks/tracking',
    icon: 'taskTracking',
    phase: 4,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  // ── Module 05 — งานปฏิทินและการประชุม ─────────────────────────────────────
  {
    id: '05.1',
    key: 'calendar.academic',
    moduleId: '05',
    nameTh: 'ปฏิทินวิชาการ',
    nameEn: 'Academic Calendar',
    navLabel: 'ปฏิทินวิชาการ',
    path: '/calendar',
    icon: 'calendar',
    phase: 5,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '05.2',
    key: 'meetings.manage',
    moduleId: '05',
    nameTh: 'ระบบจัดการประชุม',
    nameEn: 'Meeting Management',
    navLabel: 'จัดการประชุม',
    path: '/meetings',
    icon: 'meeting',
    phase: 5,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '05.3',
    key: 'meetings.attendance',
    moduleId: '05',
    nameTh: 'ระบบลงชื่อเข้าประชุม',
    nameEn: 'Meeting Attendance',
    navLabel: 'ลงชื่อเข้าประชุม',
    path: '/meetings/attendance',
    icon: 'meetingAttendance',
    phase: 5,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '05.4',
    key: 'meetings.minutes',
    moduleId: '05',
    nameTh: 'รายงานและมติการประชุม',
    nameEn: 'Minutes & Resolutions',
    navLabel: 'รายงานและมติการประชุม',
    path: '/meetings/minutes',
    icon: 'meetingMinutes',
    phase: 5,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  // ── Module 06 — งานบุคลากรและประสานงาน ────────────────────────────────────
  {
    id: '06.1',
    key: 'personnel.organization',
    moduleId: '06',
    nameTh: 'โครงสร้างกลุ่มบริหารวิชาการ',
    nameEn: 'Organization Structure',
    navLabel: 'โครงสร้างองค์กร',
    path: '/personnel/organization',
    icon: 'organization',
    phase: 6,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '06.2',
    key: 'personnel.responsibilities',
    moduleId: '06',
    nameTh: 'ทะเบียนหน้าที่และภาระงาน',
    nameEn: 'Duties & Workload Register',
    navLabel: 'หน้าที่และภาระงาน',
    path: '/personnel/responsibilities',
    icon: 'personnel',
    phase: 6,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '06.3',
    key: 'personnel.coordination',
    moduleId: '06',
    nameTh: 'ประสานงานกลุ่มสาระ',
    nameEn: 'Department Coordination',
    navLabel: 'ประสานงานกลุ่มสาระ',
    path: '/personnel/coordination',
    icon: 'coordination',
    phase: 6,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  // ── Module 07 — คลังเอกสารและประชาสัมพันธ์ ────────────────────────────────
  {
    id: '07.1',
    key: 'knowledge.library',
    moduleId: '07',
    nameTh: 'คลังเอกสารกลาง',
    nameEn: 'Central Document Explorer',
    navLabel: 'คลังเอกสารกลาง',
    path: '/library',
    icon: 'library',
    phase: 2,
    status: 'not_started',
    released: false,
    note: '',
  },
  {
    id: '07.2',
    key: 'knowledge.announcements',
    moduleId: '07',
    nameTh: 'ข่าวสารและประชาสัมพันธ์',
    nameEn: 'News & Announcements',
    navLabel: 'ข่าวสารและประชาสัมพันธ์',
    path: '/announcements',
    icon: 'announcement',
    phase: 6,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  {
    id: '07.3',
    key: 'knowledge.surveys',
    moduleId: '07',
    nameTh: 'ระบบแบบสำรวจออนไลน์',
    nameEn: 'Online Survey',
    navLabel: 'แบบสำรวจ',
    path: '/surveys',
    icon: 'survey',
    phase: 6,
    status: 'not_started',
    released: false,
    note: 'Schema พร้อม',
  },
  // ── Module 08 — งานสารสนเทศและรายงาน ──────────────────────────────────────
  {
    id: '08.1',
    key: 'intelligence.reports',
    moduleId: '08',
    nameTh: 'ศูนย์รายงาน',
    nameEn: 'Report Center',
    navLabel: 'ศูนย์รายงาน',
    path: '/reports',
    icon: 'report',
    phase: 7,
    status: 'not_started',
    released: false,
    note: '',
  },
  {
    id: '08.2',
    key: 'intelligence.admin',
    moduleId: '08',
    nameTh: 'ตั้งค่าระบบ',
    nameEn: 'Admin Console',
    navLabel: 'ตั้งค่าระบบ',
    path: '/settings',
    icon: 'settings',
    phase: 7,
    status: 'not_started',
    released: false,
    note: '',
  },
] as const satisfies readonly SubsystemDef[];

export type ModuleId = (typeof MODULES)[number]['id'];
export type ResourceKey = (typeof SUBSYSTEMS)[number]['key'];

export const RESOURCE_KEYS = SUBSYSTEMS.map((s) => s.key) as ResourceKey[];

const SUBSYSTEM_BY_KEY = new Map<string, SubsystemDef>(SUBSYSTEMS.map((s) => [s.key, s]));

export function getSubsystem(key: ResourceKey): SubsystemDef {
  const found = SUBSYSTEM_BY_KEY.get(key);
  if (!found) throw new Error(`Unknown subsystem: ${key}`);
  return found;
}

export function isResourceKey(value: string): value is ResourceKey {
  return SUBSYSTEM_BY_KEY.has(value);
}

export function getModule(id: string): ModuleDef {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

export function subsystemsOf(moduleId: string): SubsystemDef[] {
  return SUBSYSTEMS.filter((s) => s.moduleId === moduleId);
}

/** หมวดเรียงตามลำดับ Sidebar (ข้อ 33) */
export function modulesInNavOrder(): ModuleDef[] {
  return [...MODULES].sort((a, b) => a.navOrder - b.navOrder);
}
