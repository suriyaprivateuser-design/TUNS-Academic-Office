/**
 * ค่าอ้างอิงกลางที่ใช้ร่วมกันหลาย Module (รหัส Module ของไฟล์ สถานะเอกสาร ประเภทกิจกรรม ประเภทไฟล์)
 * ทุกค่ามาจาก Master Prompt โดยตรง ส่วนที่เพิ่มเองระบุไว้ในคอมเมนต์
 */

// ── File naming: Module Codes (ข้อ 23) ─────────────────────────────────────────
export const MODULE_CODES = {
  IN: 'หนังสือรับ',
  OUT: 'หนังสือส่ง',
  MEMO: 'บันทึกข้อความ',
  ORDER: 'คำสั่ง',
  CL: 'หนังสือขอเวลาเรียน',
  LP: 'แผนการจัดการเรียนรู้',
  RES: 'งานวิจัย',
  MTG: 'รายงานการประชุม',
  CERT: 'เกียรติบัตร',
  ANN: 'ประกาศ',
  RPT: 'รายงาน',
  // ── รหัสที่เพิ่มจาก Master Prompt เพื่อให้ไฟล์ทุกประเภทมีมาตรฐานชื่อเดียวกัน ──
  LIB: 'คลังเอกสารกลาง',
  SUB: 'งานรับส่งทั่วไป',
  TPL: 'แม่แบบเอกสาร',
  AST: 'ไฟล์ Asset ของระบบ',
  SVC: 'โลโก้บริการ',
  SVY: 'ไฟล์แนบแบบสำรวจ',
} as const;

export type ModuleCode = keyof typeof MODULE_CODES;

export function isModuleCode(value: string): value is ModuleCode {
  return Object.prototype.hasOwnProperty.call(MODULE_CODES, value);
}

// ── สถานะเอกสาร (ข้อ 12 / 02.3) ───────────────────────────────────────────────
export const DOCUMENT_STATUSES = [
  'draft',
  'submitted',
  'pending_review',
  'in_consideration',
  'returned',
  'approved',
  'rejected',
  'cancelled',
  'archived',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent';

export const DOCUMENT_STATUS_META: Record<DocumentStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'ฉบับร่าง', tone: 'neutral' },
  submitted: { label: 'ส่งเอกสารแล้ว', tone: 'info' },
  pending_review: { label: 'รอตรวจสอบ', tone: 'warning' },
  in_consideration: { label: 'อยู่ระหว่างพิจารณา', tone: 'accent' },
  returned: { label: 'ส่งกลับแก้ไข', tone: 'warning' },
  approved: { label: 'อนุมัติ', tone: 'success' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'danger' },
  cancelled: { label: 'ยกเลิก', tone: 'neutral' },
  archived: { label: 'จัดเก็บแล้ว', tone: 'neutral' },
};

/** สถานะที่ถือว่ากระบวนการยังดำเนินอยู่ (ใช้ตรวจความซ้ำซ้อนและนับงานค้าง) */
export const ACTIVE_DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'submitted',
  'pending_review',
  'in_consideration',
];

// ── ระบบขอเวลาเรียน (ข้อ 13) ──────────────────────────────────────────────────
export const CLASS_LEAVE_ACTIVITY_TYPES = [
  { id: 'academic_competition', label: 'แข่งขันทักษะวิชาการ' },
  { id: 'competition_practice', label: 'ฝึกซ้อมการแข่งขัน' },
  { id: 'sports_competition', label: 'แข่งขันกีฬา' },
  { id: 'internal_activity', label: 'กิจกรรมภายในโรงเรียน' },
  { id: 'external_activity', label: 'กิจกรรมภายนอกโรงเรียน' },
  { id: 'academic_camp', label: 'ค่ายวิชาการ' },
  { id: 'training', label: 'อบรม' },
  { id: 'study_visit', label: 'ศึกษาดูงาน' },
  { id: 'special_program', label: 'กิจกรรมห้องเรียนพิเศษ' },
  { id: 'school_duty', label: 'ปฏิบัติหน้าที่โรงเรียน' },
  { id: 'other', label: 'อื่น ๆ' },
] as const;

export type ClassLeaveActivityType = (typeof CLASS_LEAVE_ACTIVITY_TYPES)[number]['id'];

export const CLASS_LEAVE_ACTIVITY_TYPE_IDS = CLASS_LEAVE_ACTIVITY_TYPES.map((t) => t.id) as [
  ClassLeaveActivityType,
  ...ClassLeaveActivityType[],
];

export function activityTypeLabel(id: string): string {
  return CLASS_LEAVE_ACTIVITY_TYPES.find((t) => t.id === id)?.label ?? id;
}

/** รูปแบบการขอเวลาเรียนในแต่ละวัน (ข้อ 13 Step 3) */
export const LEAVE_DAY_MODES = [
  { id: 'periods', label: 'รายคาบ' },
  { id: 'half_day_am', label: 'ครึ่งวันเช้า' },
  { id: 'half_day_pm', label: 'ครึ่งวันบ่าย' },
  { id: 'full_day', label: 'เต็มวัน' },
] as const;

export type LeaveDayMode = (typeof LEAVE_DAY_MODES)[number]['id'];

/** สถานะการเข้าร่วมกิจกรรมจริง (ข้อ 13 / 03.4) — แยกจากสถานะอนุมัติและเวลาเรียนทางการ */
export const ACTIVITY_ATTENDANCE_STATUSES = [
  { id: 'pending', label: 'รอตรวจสอบ' },
  { id: 'attended', label: 'เข้าร่วมกิจกรรมจริง' },
  { id: 'absent', label: 'ไม่เข้าร่วม' },
  { id: 'partial', label: 'เข้าร่วมบางช่วงเวลา' },
  { id: 'cancelled', label: 'ยกเลิกการเข้าร่วม' },
] as const;

// ── Service Hub (ข้อ 19) ───────────────────────────────────────────────────────
export const SERVICE_STATUSES = [
  { id: 'active', label: 'เปิดให้บริการ', tone: 'success' },
  { id: 'maintenance', label: 'ปิดปรับปรุง', tone: 'warning' },
  { id: 'offline', label: 'ปิดให้บริการ', tone: 'neutral' },
] as const satisfies readonly { id: string; label: string; tone: StatusTone }[];

export type ServiceStatus = (typeof SERVICE_STATUSES)[number]['id'];

/** ผลตรวจลิงก์ — แยก "ลิงก์เสีย" ออกจาก "ต้อง Login" และ "ปฏิเสธการตรวจอัตโนมัติ" (ข้อ 09.3) */
export const LINK_CHECK_RESULTS = [
  { id: 'ok', label: 'ใช้งานได้', tone: 'success' },
  { id: 'auth_required', label: 'ต้องเข้าสู่ระบบปลายทาง', tone: 'info' },
  { id: 'blocked', label: 'ปลายทางปฏิเสธการตรวจอัตโนมัติ', tone: 'neutral' },
  { id: 'broken', label: 'ลิงก์เสีย', tone: 'danger' },
  { id: 'unreachable', label: 'ติดต่อปลายทางไม่ได้', tone: 'warning' },
  { id: 'unsafe', label: 'ไม่อนุญาตให้ตรวจ (URL ไม่ปลอดภัย)', tone: 'danger' },
] as const satisfies readonly { id: string; label: string; tone: StatusTone }[];

export type LinkCheckResult = (typeof LINK_CHECK_RESULTS)[number]['id'];

// ── ไฟล์ (ข้อ 05.4, 22, 30) ───────────────────────────────────────────────────
export const FILE_ACCESS_LEVELS = [
  { id: 'staff', label: 'บุคลากรทุกคน' },
  { id: 'department', label: 'เฉพาะกลุ่มสาระ/กลุ่มงาน' },
  { id: 'record', label: 'เฉพาะผู้เกี่ยวข้องกับรายการ' },
  { id: 'restricted', label: 'จำกัด (เจ้าของและผู้มีสิทธิ์จัดการ)' },
] as const;

export type FileAccessLevel = (typeof FILE_ACCESS_LEVELS)[number]['id'];

export const FILE_UPLOAD_STATUSES = [
  'pending',
  'uploaded',
  'active',
  'pending_reconciliation',
  'failed',
  'archived',
] as const;

export type FileUploadStatus = (typeof FILE_UPLOAD_STATUSES)[number];

export interface AllowedFileType {
  extension: string;
  mimeTypes: readonly string[];
  label: string;
  /** แสดง preview ในเบราว์เซอร์ได้อย่างปลอดภัยหรือไม่ */
  previewable: boolean;
  kind: 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'image';
}

/** ประเภทไฟล์ที่อนุญาตตั้งต้น ผู้ดูแลเพิ่มได้ผ่านการตั้งค่า (ข้อ 05.4) */
export const ALLOWED_FILE_TYPES: readonly AllowedFileType[] = [
  {
    extension: 'pdf',
    mimeTypes: ['application/pdf'],
    label: 'PDF',
    previewable: true,
    kind: 'pdf',
  },
  {
    extension: 'docx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    label: 'Word (DOCX)',
    previewable: false,
    kind: 'document',
  },
  {
    extension: 'xlsx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    label: 'Excel (XLSX)',
    previewable: false,
    kind: 'spreadsheet',
  },
  {
    extension: 'pptx',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    label: 'PowerPoint (PPTX)',
    previewable: false,
    kind: 'presentation',
  },
  {
    extension: 'jpg',
    mimeTypes: ['image/jpeg'],
    label: 'รูปภาพ JPG',
    previewable: true,
    kind: 'image',
  },
  {
    extension: 'jpeg',
    mimeTypes: ['image/jpeg'],
    label: 'รูปภาพ JPG',
    previewable: true,
    kind: 'image',
  },
  {
    extension: 'png',
    mimeTypes: ['image/png'],
    label: 'รูปภาพ PNG',
    previewable: true,
    kind: 'image',
  },
  {
    extension: 'svg',
    mimeTypes: ['image/svg+xml'],
    label: 'ภาพเวกเตอร์ SVG (ผ่านการทำให้ปลอดภัย)',
    // SVG แสดงผ่าน <img> เท่านั้น (สคริปต์ไม่ทำงาน) และถูก sanitize ก่อนจัดเก็บ
    previewable: true,
    kind: 'image',
  },
];

/** ขนาดไฟล์สูงสุดตั้งต้น 25 MB ต่อไฟล์ (ปรับได้ใน SystemSettings: `files.max_size_mb`) */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** ไฟล์ที่เล็กกว่าค่านี้ส่งผ่าน backend ในคำขอเดียว ที่ใหญ่กว่าใช้ Upload Session (ข้อจำกัด body ของ Vercel ~4.5 MB) */
export const DIRECT_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// ── การแจ้งเตือน (ข้อ 11 / 01.3) ──────────────────────────────────────────────
export const NOTIFICATION_TYPES = [
  { id: 'incoming_document', label: 'หนังสือเข้าใหม่' },
  { id: 'approval_pending', label: 'เอกสารรอพิจารณา' },
  { id: 'approval_approved', label: 'เอกสารได้รับอนุมัติ' },
  { id: 'approval_returned', label: 'เอกสารส่งกลับแก้ไข' },
  { id: 'approval_rejected', label: 'เอกสารไม่ได้รับอนุมัติ' },
  { id: 'class_leave', label: 'หนังสือขอเวลาเรียน' },
  { id: 'task_assigned', label: 'งานที่ได้รับมอบหมาย' },
  { id: 'task_due_soon', label: 'งานใกล้ครบกำหนด' },
  { id: 'task_overdue', label: 'งานเกินกำหนด' },
  { id: 'meeting', label: 'การประชุม' },
  { id: 'announcement', label: 'ประกาศข่าวสาร' },
  { id: 'new_document', label: 'เอกสารใหม่' },
  { id: 'system', label: 'ระบบ' },
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]['id'];

export function notificationTypeLabel(id: string): string {
  return NOTIFICATION_TYPES.find((t) => t.id === id)?.label ?? id;
}
