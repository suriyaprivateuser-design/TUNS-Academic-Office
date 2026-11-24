/**
 * TUNS_DOCUMENT_DATABASE — งานสารบรรณ เอกสาร แม่แบบ และ Approval Workflow กลาง (Module 02)
 *
 * Approval Workflow ในไฟล์นี้เป็นกลไกกลางที่ทุก Module ใช้ร่วมกัน
 * (เช่น หนังสือขอเวลาเรียนใช้ ApprovalRequests / ApprovalActions ชุดเดียวกัน)
 */
import { archivable, base, logBase, term } from './common';
import {
  AnnouncementsRegister,
  CertificateTemplates,
  Certificates,
  IncomingDocuments,
  OfficialOrders,
  OutgoingDocuments,
} from './document-registers';
import { col, defineTable, req, type DatabaseDef } from './types';

const DOCUMENT_STATUS_VALUES = [
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

/** ขั้นตอนของ Workflow ที่ถูก "ถ่ายสำเนา" ไว้กับคำขอ ณ เวลาที่ส่ง — การแก้ Workflow ภายหลังไม่กระทบคำขอที่ค้างอยู่ */
export interface ApprovalStepSnapshot {
  order: number;
  name: string;
  kind: 'review' | 'approve';
  approverType: 'role' | 'user' | 'requester_department_head' | 'unit_head';
  approverRef: string | null;
  /** ผู้มีสิทธิ์พิจารณาในขั้นนี้ ณ เวลาที่ส่ง (รหัสผู้ใช้) */
  approverIds: string[];
  state: 'waiting' | 'current' | 'approved' | 'skipped' | 'returned' | 'rejected';
  skippedReason?: string;
}

export const Documents = defineTable(
  'document',
  'Documents',
  'เอกสารทุกฉบับที่สร้างในระบบ (บันทึกข้อความ หนังสือ ฯลฯ) หนึ่งแถวต่อหนึ่งเอกสาร ไฟล์แต่ละเวอร์ชันอยู่ใน DocumentVersions',
  {
    ...base,
    reference_no: req.string('เลขอ้างอิงภายในระบบ (ไม่ใช่เลขหนังสือราชการ)', {
      example: 'MEMO-2569-0001',
    }),
    document_type_id: req.string('ประเภทเอกสาร', { ref: 'document.DocumentTypes' }),
    title: req.string('เรื่อง'),
    ...term,
    department_id: col.string('กลุ่มสาระของผู้จัดทำ', { ref: 'master.Departments' }),
    unit_id: col.string('กลุ่มงานที่เกี่ยวข้อง', { ref: 'master.AcademicUnits' }),
    owner_id: req.string('ผู้จัดทำ', { ref: 'master.Users' }),
    status: req.enum(DOCUMENT_STATUS_VALUES, 'สถานะเอกสาร'),
    current_version: req.int('เวอร์ชันเนื้อหาปัจจุบัน'),
    official_number: col.string(
      'เลขที่หนังสือราชการ (ถ้ามี) อ้างอิงจากทะเบียนสารบรรณกลางของโรงเรียน ระบบไม่ออกเลขราชการซ้ำ',
    ),
    official_date: col.date('วันที่ของหนังสือ'),
    urgency: req.enum(['normal', 'urgent', 'very_urgent', 'most_urgent'], 'ระดับความเร่งด่วน'),
    secrecy: req.enum(['normal', 'confidential', 'secret', 'top_secret'], 'ชั้นความลับ'),
    form_data: col.json<Record<string, unknown>>('ข้อมูลที่กรอกในฟอร์มของแม่แบบ (ฉบับปัจจุบัน)'),
    template_id: col.string('แม่แบบที่ใช้สร้าง', { ref: 'document.DocumentTemplates' }),
    template_version: col.int('เวอร์ชันของแม่แบบ ณ เวลาที่สร้าง'),
    source_type: col.string('Module ต้นทาง เมื่อเอกสารถูกสร้างจากระบบอื่น', {
      example: 'class_leave',
    }),
    source_id: col.string('รหัส record ต้นทาง'),
    approval_request_id: col.string('คำขออนุมัติล่าสุด', { ref: 'document.ApprovalRequests' }),
    ...archivable,
  },
  { uniqueKeys: [['reference_no']], phase: 2 },
);

export const DocumentVersions = defineTable(
  'document',
  'DocumentVersions',
  'ประวัติเวอร์ชันของเอกสาร — เอกสารที่อนุมัติแล้วไม่ถูกเขียนทับ การแก้ไขสร้างเวอร์ชันใหม่เสมอ',
  {
    ...base,
    document_id: req.string('เอกสาร', { ref: 'document.Documents' }),
    version_no: req.int('เลขเวอร์ชัน'),
    file_id: col.string('ไฟล์ของเวอร์ชันนี้', { ref: 'system.FileRegistry' }),
    form_data: col.json<Record<string, unknown>>('สำเนาข้อมูลฟอร์มของเวอร์ชันนี้'),
    change_note: col.string('สรุปการแก้ไข'),
    status: req.enum(
      ['draft', 'submitted', 'approved', 'superseded'],
      'สถานะของเวอร์ชัน',
    ),
  },
  { uniqueKeys: [['document_id', 'version_no']], phase: 2 },
);

export const DocumentTypes = defineTable(
  'document',
  'DocumentTypes',
  'ประเภทเอกสารและ Workflow ตั้งต้นของแต่ละประเภท (id = รหัสประเภท)',
  {
    ...base,
    name_th: req.string('ชื่อประเภทเอกสาร'),
    module_code: req.string('รหัส Module สำหรับตั้งชื่อไฟล์', { example: 'MEMO' }),
    description: col.string('คำอธิบาย'),
    default_workflow_id: col.string('Workflow ตั้งต้น', { ref: 'document.ApprovalWorkflows' }),
    requires_approval: req.boolean('ต้องผ่านการอนุมัติหรือไม่'),
    sort_order: req.int('ลำดับการแสดงผล'),
    is_active: req.boolean('เปิดใช้งาน'),
  },
  { phase: 2 },
);

export const DocumentTemplates = defineTable(
  'document',
  'DocumentTemplates',
  'แม่แบบเอกสาร (Google Docs Template) รองรับหลายเวอร์ชัน แม่แบบเวอร์ชันเก่าไม่ถูกแก้ไขเพื่อไม่กระทบเอกสารที่ออกไปแล้ว',
  {
    ...base,
    document_type_id: req.string('ประเภทเอกสาร', { ref: 'document.DocumentTypes' }),
    name: req.string('ชื่อแม่แบบ'),
    template_version: req.int('เวอร์ชันของแม่แบบ'),
    drive_file_id: col.string(
      'Drive File ID ของ Google Docs Template จริงของโรงเรียน (ว่าง = ยังไม่ได้ตั้งค่า ใช้ฉบับตัวอย่างในระบบ)',
    ),
    variables: col.json<string[]>('ตัวแปรที่แม่แบบรองรับ', { example: '["document_date","teacher_name"]' }),
    is_active: req.boolean('เป็นเวอร์ชันที่ใช้งานอยู่'),
    notes: col.string('หมายเหตุ'),
    ...archivable,
  },
  { uniqueKeys: [['document_type_id', 'template_version']], phase: 2 },
);

export const DocumentRecipients = defineTable(
  'document',
  'DocumentRecipients',
  'ผู้รับเอกสารและการรับทราบ',
  {
    ...base,
    document_type: req.enum(
      ['document', 'incoming', 'outgoing', 'order', 'announcement'],
      'ชนิดของเอกสารต้นทาง',
    ),
    document_id: req.string('รหัสเอกสารต้นทาง'),
    recipient_type: req.enum(['user', 'department', 'unit', 'role'], 'ชนิดของผู้รับ'),
    recipient_ref: req.string('รหัสผู้รับตามชนิด'),
    purpose: req.enum(['to', 'cc', 'acknowledge'], 'วัตถุประสงค์: ถึง / สำเนา / เพื่อรับทราบ'),
    acknowledged_at: col.datetime('วันเวลาที่รับทราบ'),
    acknowledged_by: col.string('ผู้รับทราบ', { ref: 'master.Users' }),
  },
  { phase: 2 },
);

export const ApprovalWorkflows = defineTable(
  'document',
  'ApprovalWorkflows',
  'นิยามขั้นตอนการอนุมัติแบบกำหนดเองตามประเภทเอกสาร — ไม่บังคับให้ทุกเอกสารผ่านทุกตำแหน่ง',
  {
    ...base,
    code: req.string('รหัส Workflow', { example: 'class_leave_default' }),
    name: req.string('ชื่อ Workflow'),
    subject_type: req.string('ชนิดของสิ่งที่อนุมัติ', { example: 'class_leave' }),
    description: col.string('คำอธิบาย'),
    workflow_version: req.int('เวอร์ชันของ Workflow (เพิ่มเมื่อแก้ขั้นตอน)'),
    is_default: req.boolean('เป็น Workflow ตั้งต้นของ subject_type นี้'),
    is_active: req.boolean('เปิดใช้งาน'),
    is_demo: col.boolean(
      'true = ขั้นตอนตัวอย่างที่ระบบสร้างให้ ต้องยืนยันกับกระบวนการจริงของโรงเรียนก่อนใช้งาน',
    ),
  },
  { uniqueKeys: [['code']], phase: 2 },
);

export const ApprovalSteps = defineTable(
  'document',
  'ApprovalSteps',
  'ขั้นตอนของ Workflow เรียงตาม step_order',
  {
    ...base,
    workflow_id: req.string('Workflow', { ref: 'document.ApprovalWorkflows' }),
    step_order: req.int('ลำดับขั้น (เริ่มที่ 1)'),
    name: req.string('ชื่อขั้นตอน', { example: 'หัวหน้ากลุ่มสาระตรวจสอบ' }),
    step_kind: req.enum(
      ['review', 'approve'],
      'review = ตรวจสอบ (สถานะ “รอตรวจสอบ”), approve = พิจารณาอนุมัติ (สถานะ “อยู่ระหว่างพิจารณา”)',
    ),
    approver_type: req.enum(
      ['role', 'user', 'requester_department_head', 'unit_head'],
      'วิธีระบุผู้พิจารณา: ตามบทบาท / ระบุบุคคล / หัวหน้ากลุ่มสาระของผู้เสนอ / หัวหน้างานที่ระบุ',
    ),
    approver_ref: col.string('รหัสบทบาท ผู้ใช้ หรือกลุ่มงาน ตาม approver_type'),
    on_missing: req.enum(
      ['block', 'skip'],
      'เมื่อไม่พบผู้พิจารณาในขั้นนี้: block = ไม่ให้ส่ง, skip = ข้ามขั้นและบันทึกเหตุผล',
    ),
    allow_self: req.boolean('อนุญาตให้ผู้เสนอพิจารณาเอกสารของตนเองในขั้นนี้หรือไม่ (ปกติ false)'),
    is_active: req.boolean('ใช้งานขั้นตอนนี้'),
  },
  { uniqueKeys: [['workflow_id', 'step_order']], phase: 2 },
);

export const ApprovalRequests = defineTable(
  'document',
  'ApprovalRequests',
  'คำขออนุมัติหนึ่งรายการต่อการส่งหนึ่งครั้ง (ส่งใหม่หลังแก้ไข = คำขอใหม่) ผูกกับเวอร์ชันของเอกสารที่ถูกพิจารณา',
  {
    ...base,
    workflow_id: req.string('Workflow ที่ใช้', { ref: 'document.ApprovalWorkflows' }),
    workflow_version: req.int('เวอร์ชันของ Workflow ณ เวลาที่ส่ง'),
    subject_type: req.string('ชนิดของสิ่งที่อนุมัติ', { example: 'class_leave' }),
    subject_id: req.string('รหัส record ที่อนุมัติ'),
    subject_version: req.int('เวอร์ชันของเอกสารที่ถูกพิจารณา'),
    subject_ref_no: col.string('เลขอ้างอิงของเอกสาร (สำเนาเพื่อการแสดงผลและค้นหา)'),
    subject_title: req.string('ชื่อเรื่อง (สำเนาเพื่อการแสดงผลและค้นหา)'),
    requester_id: req.string('ผู้เสนอ', { ref: 'master.Users' }),
    department_id: col.string('กลุ่มสาระของผู้เสนอ', { ref: 'master.Departments' }),
    unit_id: col.string('กลุ่มงานที่เกี่ยวข้อง', { ref: 'master.AcademicUnits' }),
    status: req.enum(
      ['pending', 'returned', 'approved', 'rejected', 'cancelled'],
      'สถานะของคำขอ',
    ),
    current_step: req.int('ลำดับขั้นที่กำลังรอพิจารณา (0 = ไม่มีขั้นค้าง)'),
    total_steps: req.int('จำนวนขั้นทั้งหมด'),
    steps: req.json<ApprovalStepSnapshot[]>(
      'สำเนาขั้นตอนและผู้พิจารณา ณ เวลาที่ส่ง พร้อมสถานะของแต่ละขั้น',
    ),
    submitted_at: req.datetime('วันเวลาที่ส่ง'),
    completed_at: col.datetime('วันเวลาที่สิ้นสุดกระบวนการ'),
  },
  { phase: 2 },
);

export const ApprovalActions = defineTable(
  'document',
  'ApprovalActions',
  'ประวัติการดำเนินการในกระบวนการอนุมัติ (เพิ่มอย่างเดียว) บันทึกผู้ดำเนินการ เวลา ความเห็น และเวอร์ชันเอกสารที่พิจารณา',
  {
    ...logBase,
    request_id: req.string('คำขออนุมัติ', { ref: 'document.ApprovalRequests' }),
    subject_type: req.string('ชนิดของสิ่งที่อนุมัติ'),
    subject_id: req.string('รหัส record ที่อนุมัติ'),
    subject_version: req.int('เวอร์ชันของเอกสารที่พิจารณาในครั้งนี้'),
    step_order: req.int('ลำดับขั้น (0 = การกระทำของผู้เสนอ)'),
    step_name: col.string('ชื่อขั้นตอน'),
    action: req.enum(
      ['submit', 'approve', 'reject', 'return', 'cancel', 'skip', 'comment'],
      'การดำเนินการ',
    ),
    actor_id: col.string('ผู้ดำเนินการ (ว่าง = ระบบ เช่น การข้ามขั้น)', { ref: 'master.Users' }),
    on_behalf_of: col.string('ดำเนินการแทน (กรณีมอบหมายผู้พิจารณาแทน)', { ref: 'master.Users' }),
    comment: col.string('ความเห็น/ข้อเสนอแนะ'),
  },
  { appendOnly: true, phase: 2 },
);

export const ApprovalDelegations = defineTable(
  'document',
  'ApprovalDelegations',
  'การมอบหมายผู้พิจารณาแทนในช่วงเวลาที่กำหนด (Delegated Approver)',
  {
    ...base,
    delegator_id: req.string('ผู้มอบหมาย', { ref: 'master.Users' }),
    delegate_id: req.string('ผู้พิจารณาแทน', { ref: 'master.Users' }),
    subject_type: col.string('จำกัดเฉพาะชนิดเอกสาร (ว่าง = ทุกชนิด)'),
    starts_at: req.datetime('เริ่มมีผล'),
    ends_at: req.datetime('สิ้นสุด'),
    reason: col.string('เหตุผล'),
    status: req.enum(['active', 'revoked'], 'สถานะ'),
  },
  { phase: 2 },
);

export const documentDatabase: DatabaseDef = {
  key: 'document',
  title: 'TUNS_DOCUMENT_DATABASE',
  displayName: 'Document Database',
  envVar: 'GOOGLE_DOCUMENT_SPREADSHEET_ID',
  description:
    'ทะเบียนหนังสือรับ–ส่ง เอกสาร แม่แบบ Approval Workflow คำสั่ง ประกาศ และเกียรติบัตร',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    IncomingDocuments,
    OutgoingDocuments,
    Documents,
    DocumentVersions,
    DocumentTypes,
    DocumentTemplates,
    DocumentRecipients,
    ApprovalWorkflows,
    ApprovalSteps,
    ApprovalRequests,
    ApprovalActions,
    ApprovalDelegations,
    OfficialOrders,
    AnnouncementsRegister,
    Certificates,
    CertificateTemplates,
  ],
};
