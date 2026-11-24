/**
 * TUNS_TASK_DATABASE — งานมอบหมายและติดตามงาน (Module 04)
 *
 * - มอบหมายงานและ Task Board: Tasks, TaskAssignees, TaskComments, TaskHistory
 * - ศูนย์รับส่งงานครู (Submission Center): SubmissionCampaigns, SubmissionTargets,
 *   SubmissionRequirements, Submissions, SubmissionVersions, SubmissionReviews
 * - “เกินกำหนด” และ “งานค้าง” ไม่มีคอลัมน์ของตนเอง ระบบคำนวณจากวันครบกำหนดและสถานะเสมอ
 * - Write Gateway ไม่มีคำสั่งลบแถว รายการย่อยที่ถอนออกได้จึงมี is_active หรือสถานะ cancelled กำกับ
 */
import { archivable, base, logBase, term } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

/** สถานะของงาน ใช้ชุดเดียวกันใน Tasks, TaskAssignees และ TaskHistory (ไม่มี “เกินกำหนด” เพราะเป็นค่าที่คำนวณ) */
const TASK_STATUS_VALUES = [
  'not_started',
  'in_progress',
  'pending_review',
  'returned',
  'done',
  'cancelled',
] as const;

/** นิยามช่องข้อมูลเพิ่มเติมหนึ่งช่องของการเปิดรับส่งงาน (SubmissionCampaigns.form_fields) */
export interface SubmissionFormField {
  /** คีย์ของช่อง แบบ snake_case ไม่ซ้ำภายในการเปิดรับเดียวกัน ใช้เป็นคีย์ใน Submissions.form_answers */
  key: string;
  /** ป้ายชื่อที่แสดงในฟอร์ม */
  label: string;
  /** ชนิดของช่อง — date เก็บคำตอบเป็น YYYY-MM-DD, checkbox เก็บเป็น true/false */
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  required: boolean;
  /** ตัวเลือก เมื่อ type = select */
  options?: string[];
  /** คำแนะนำประกอบช่องกรอก */
  help_text?: string;
}

/** คำตอบของช่องข้อมูลเพิ่มเติม (Submissions.form_answers) — คีย์ตาม SubmissionFormField.key */
export type SubmissionFormAnswers = Record<string, string | number | boolean | null>;

// ── มอบหมายงานและ Task Board ───────────────────────────────────────────────────

export const Tasks = defineTable(
  'task',
  'Tasks',
  'งานที่มอบหมายและติดตามผล รวมงานย่อยและงานที่เกิดจากมติที่ประชุมหรือ Module อื่น — “เกินกำหนด” ไม่จัดเก็บเป็นสถานะ ระบบคำนวณจาก due_date และ status ทุกครั้งที่แสดงผล',
  {
    ...base,
    title: req.string('ชื่องาน'),
    details: col.string('รายละเอียดงานและผลลัพธ์ที่ต้องการ'),
    parent_task_id: col.string('งานหลักของงานย่อยนี้ (ว่าง = งานระดับบนสุด)', {
      ref: 'task.Tasks',
    }),
    source_type: req.enum(
      ['manual', 'meeting_resolution', 'class_leave', 'submission_campaign'],
      'ที่มาของงาน: manual = มอบหมายโดยตรง, meeting_resolution = แปลงจากมติที่ประชุม, class_leave = เกิดจากหนังสือขอเวลาเรียน, submission_campaign = เกิดจากการเปิดรับส่งงาน',
    ),
    source_id: col.string(
      'รหัสรายการต้นทางตาม source_type ใช้เปิดย้อนกลับไปยังที่มา: meeting.MeetingResolutions / classLeave.ClassLeaveRequests / task.SubmissionCampaigns (ว่างเมื่อ source_type = manual)',
    ),
    priority: req.enum(
      ['low', 'normal', 'high', 'urgent'],
      'ระดับความสำคัญ: ต่ำ / ปกติ / สูง / เร่งด่วน',
    ),
    status: req.enum(
      TASK_STATUS_VALUES,
      'สถานะรวมของงาน: ยังไม่เริ่ม / กำลังดำเนินการ / รอตรวจ / ส่งกลับแก้ไข / เสร็จสิ้น / ยกเลิก — ไม่มีค่า “เกินกำหนด” เพราะคำนวณจาก due_date',
    ),
    start_date: col.date('วันที่เริ่มงาน'),
    due_date: col.date(
      'วันครบกำหนด (ว่าง = ไม่กำหนด) งานที่พ้นวันนี้แล้ว status ยังไม่เป็น done หรือ cancelled ถือว่าเกินกำหนด',
    ),
    completed_at: col.datetime(
      'วันเวลาที่งานเปลี่ยนเป็น done ใช้เทียบกับ due_date ว่าเสร็จทันกำหนดหรือไม่',
    ),
    assigned_by: col.string('ผู้มอบหมายงาน (ว่าง = ระบบสร้างงานให้อัตโนมัติจาก Module ต้นทาง)', {
      ref: 'master.Users',
    }),
    department_id: col.string(
      'กลุ่มสาระเจ้าของงาน ใช้กำหนดขอบเขตสิทธิ์ระดับกลุ่มสาระ (ว่าง = ไม่ผูกกับกลุ่มสาระ)',
      { ref: 'master.Departments' },
    ),
    unit_id: col.string(
      'กลุ่มงานเจ้าของงาน ใช้กำหนดขอบเขตสิทธิ์ระดับกลุ่มงาน (ว่าง = ไม่ผูกกับกลุ่มงาน)',
      { ref: 'master.AcademicUnits' },
    ),
    ...term,
    attachment_file_ids: col.json<string[]>(
      'ไฟล์แนบประกอบการมอบหมาย เป็นรายการรหัสไฟล์ใน system.FileRegistry',
    ),
  },
  { phase: 4 },
);

export const TaskAssignees = defineTable(
  'task',
  'TaskAssignees',
  'ผู้รับมอบหมายของแต่ละงาน (รายบุคคล ทั้งกลุ่มสาระ หรือทั้งกลุ่มงาน) พร้อมสถานะ การรับทราบ และหลักฐานการดำเนินงานของแต่ละราย — ถอนแล้วมอบหมายซ้ำให้ใช้แถวเดิม',
  {
    ...base,
    task_id: req.string('งานที่มอบหมาย', { ref: 'task.Tasks' }),
    assignee_type: req.enum(
      ['user', 'department', 'unit'],
      'ประเภทผู้รับมอบหมาย: user = รายบุคคล, department = ทั้งกลุ่มสาระ, unit = ทั้งกลุ่มงาน',
    ),
    assignee_ref: req.string(
      'รหัสผู้รับมอบหมายตาม assignee_type: master.Users / master.Departments / master.AcademicUnits',
    ),
    role: req.enum(['owner', 'co_owner'], 'owner = ผู้รับผิดชอบหลัก, co_owner = ผู้รับผิดชอบร่วม'),
    status: req.enum(
      TASK_STATUS_VALUES,
      'สถานะการดำเนินงานของผู้รับมอบหมายรายนี้ (ชุดค่าเดียวกับ Tasks.status) — cancelled = ถอนการมอบหมายรายนี้โดยไม่ลบแถว',
    ),
    acknowledged_at: col.datetime('วันเวลาที่รับทราบงาน (ว่าง = ยังไม่รับทราบ)'),
    acknowledged_by: col.string(
      'ผู้กดรับทราบ — กรณีมอบหมายทั้งกลุ่มสาระหรือกลุ่มงาน คือผู้รับทราบแทนกลุ่ม',
      { ref: 'master.Users' },
    ),
    submitted_at: col.datetime('วันเวลาที่ส่งผลการดำเนินงานล่าสุดเพื่อรอตรวจ'),
    completion_note: col.string('บันทึกผลการดำเนินงานที่ส่งพร้อมหลักฐาน'),
    evidence_file_ids: col.json<string[]>(
      'หลักฐานการดำเนินงานของผู้รับมอบหมายรายนี้ เป็นรายการรหัสไฟล์ใน system.FileRegistry',
    ),
  },
  { uniqueKeys: [['task_id', 'assignee_type', 'assignee_ref']], phase: 4 },
);

export const TaskComments = defineTable(
  'task',
  'TaskComments',
  'ความคิดเห็นและการสื่อสารภายในงาน — การลบความคิดเห็นใช้การจัดเก็บถาวร (archived_at) ไม่ลบแถว',
  {
    ...base,
    task_id: req.string('งานที่แสดงความคิดเห็น', { ref: 'task.Tasks' }),
    author_id: req.string('ผู้เขียนความคิดเห็น', { ref: 'master.Users' }),
    body: req.string('ข้อความความคิดเห็น (ข้อความล้วน)'),
    attachment_file_ids: col.json<string[]>(
      'ไฟล์แนบของความคิดเห็น เป็นรายการรหัสไฟล์ใน system.FileRegistry',
    ),
    ...archivable,
  },
  { phase: 4 },
);

export const TaskHistory = defineTable(
  'task',
  'TaskHistory',
  'ประวัติการดำเนินการของงานตามลำดับเวลา (แสดงเป็น Timeline ในหน้างาน) บันทึกเพิ่มอย่างเดียว',
  {
    ...logBase,
    task_id: req.string('งานที่เกิดเหตุการณ์', { ref: 'task.Tasks' }),
    task_assignee_id: col.string(
      'ผู้รับมอบหมายที่เหตุการณ์นี้เกี่ยวข้อง (ว่าง = เหตุการณ์ระดับงาน)',
      { ref: 'task.TaskAssignees' },
    ),
    action: req.enum(
      [
        'created',
        'updated',
        'assigned',
        'unassigned',
        'acknowledged',
        'status_changed',
        'evidence_submitted',
      ],
      'เหตุการณ์: สร้างงาน / แก้ไขรายละเอียด / เพิ่มผู้รับมอบหมาย / ถอนผู้รับมอบหมาย / รับทราบงาน / เปลี่ยนสถานะ (รวมผลการตรวจและการยกเลิก) / ส่งหลักฐานการดำเนินงาน',
    ),
    from_status: col.enum(
      TASK_STATUS_VALUES,
      'สถานะก่อนเหตุการณ์ (บันทึกเมื่อเหตุการณ์ทำให้สถานะเปลี่ยน)',
    ),
    to_status: col.enum(
      TASK_STATUS_VALUES,
      'สถานะหลังเหตุการณ์ (บันทึกเมื่อเหตุการณ์ทำให้สถานะเปลี่ยน)',
    ),
    actor_id: col.string('ผู้ดำเนินการ (ว่าง = ระบบดำเนินการอัตโนมัติ)', { ref: 'master.Users' }),
    note: col.string('หมายเหตุประกอบ เช่น เหตุผลที่ส่งกลับแก้ไขหรือยกเลิก'),
  },
  { appendOnly: true, phase: 4 },
);

// ── ศูนย์รับส่งงานครู (Submission Center) ──────────────────────────────────────

export const SubmissionCampaigns = defineTable(
  'task',
  'SubmissionCampaigns',
  'การเปิดรับส่งงานของศูนย์รับส่งงานครู ใช้แทน Google Forms ที่ต้องสร้างซ้ำทุกครั้ง กำหนดช่วงเวลา ประเภทไฟล์ รายการที่ต้องส่ง และผู้ตรวจ',
  {
    ...base,
    reference_no: req.string(
      'เลขอ้างอิงภายในระบบ (ไม่ใช่เลขหนังสือราชการ) ใช้ตั้งชื่อโฟลเดอร์และไฟล์ของงานที่ส่ง',
      { example: 'LP-2569-0001' },
    ),
    name: req.string('ชื่อการเปิดรับส่งงาน'),
    instructions: col.string('คำชี้แจงและขั้นตอนการส่งงานสำหรับผู้ส่ง'),
    category: req.enum(
      [
        'lesson_plan',
        'classroom_research',
        'achievement_report',
        'post_teaching_record',
        'supervision_record',
        'other',
      ],
      'ประเภทงาน: แผนการจัดการเรียนรู้ / วิจัยในชั้นเรียน / รายงานผลสัมฤทธิ์ / บันทึกหลังสอน / บันทึกการนิเทศ / อื่น ๆ',
    ),
    ...term,
    department_id: col.string(
      'กลุ่มสาระเจ้าของการเปิดรับ ใช้กำหนดขอบเขตสิทธิ์ (ว่าง = ระดับกลุ่มบริหารวิชาการ)',
      { ref: 'master.Departments' },
    ),
    unit_id: col.string('กลุ่มงานเจ้าของการเปิดรับ ใช้กำหนดขอบเขตสิทธิ์', {
      ref: 'master.AcademicUnits',
    }),
    open_date: req.date('วันเปิดรับงาน'),
    due_date: req.date('วันครบกำหนดส่ง — งานที่ส่งหลังสิ้นวันนี้ (เวลาประเทศไทย) ถือว่าส่งช้า'),
    allow_late: req.boolean(
      'true = ยังรับงานหลังวันครบกำหนดโดยบันทึกเป็นส่งช้า, false = ปิดรับเมื่อพ้นกำหนด',
    ),
    allow_resubmit: req.boolean(
      'true = ผู้ส่งส่งเวอร์ชันใหม่ได้เองจนกว่าจะได้รับอนุมัติ, false = ส่งใหม่ได้เฉพาะเมื่อถูกส่งกลับแก้ไข',
    ),
    allowed_extensions: req.json<string[]>(
      'นามสกุลไฟล์ที่อนุญาต (ตัวพิมพ์เล็ก ไม่มีจุด) ต้องเป็นประเภทไฟล์ที่ระบบอนุญาต',
      { example: '["pdf","docx"]' },
    ),
    max_file_size_mb: req.int(
      'ขนาดไฟล์สูงสุดต่อไฟล์ (MB) ต้องไม่เกินค่าสูงสุดของระบบ (files.max_size_mb)',
    ),
    required_item_count: req.int(
      'จำนวนรายการที่ผู้ส่งแต่ละคนต้องส่ง (นับ SubmissionRequirements ที่ is_required และ is_active เป็น true) ใช้คำนวณความคืบหน้า',
    ),
    reviewer_ids: col.json<string[]>(
      'ผู้ตรวจงานของการเปิดรับนี้ เป็นรายการรหัสผู้ใช้ใน master.Users (ต้องมีอย่างน้อย 1 คนก่อนเปิดรับ)',
    ),
    form_fields: col.json<SubmissionFormField[]>(
      'นิยามช่องข้อมูลเพิ่มเติมที่ผู้ส่งต้องกรอกในแต่ละรายการ [{ key, label, type, required, options, help_text }] คำตอบเก็บใน Submissions.form_answers',
    ),
    status: req.enum(
      ['draft', 'open', 'closed', 'archived'],
      'สถานะ: ฉบับร่าง / เปิดรับ / ปิดรับ / จัดเก็บแล้ว',
    ),
    ...archivable,
  },
  { uniqueKeys: [['reference_no']], phase: 4 },
);

export const SubmissionTargets = defineTable(
  'task',
  'SubmissionTargets',
  'กลุ่มเป้าหมายที่ต้องส่งงานในแต่ละการเปิดรับ',
  {
    ...base,
    campaign_id: req.string('การเปิดรับส่งงาน', { ref: 'task.SubmissionCampaigns' }),
    target_type: req.enum(
      ['user', 'department', 'unit', 'role'],
      'ประเภทกลุ่มเป้าหมาย: user = รายบุคคล, department = ทั้งกลุ่มสาระ, unit = ทั้งกลุ่มงาน, role = ทุกคนที่มีบทบาทนั้น',
    ),
    target_ref: req.string(
      'รหัสกลุ่มเป้าหมายตาม target_type: master.Users / master.Departments / master.AcademicUnits / master.Roles',
    ),
    is_active: req.boolean('true = ยังเป็นกลุ่มเป้าหมาย (ถอนออกแล้วเป็น false ไม่ลบแถว)'),
  },
  { uniqueKeys: [['campaign_id', 'target_type', 'target_ref']], phase: 4 },
);

export const SubmissionRequirements = defineTable(
  'task',
  'SubmissionRequirements',
  'รายการที่ต้องส่งในแต่ละการเปิดรับ (หนึ่งรายการ = หนึ่งไฟล์งานต่อผู้ส่งหนึ่งคน)',
  {
    ...base,
    campaign_id: req.string('การเปิดรับส่งงาน', { ref: 'task.SubmissionCampaigns' }),
    title: req.string('ชื่อรายการที่ต้องส่ง'),
    description: col.string('คำอธิบายรายการและสิ่งที่ต้องมีในงาน'),
    is_required: req.boolean('true = บังคับส่ง, false = ส่งเพิ่มเติมได้ตามสมัครใจ'),
    allowed_extensions: col.json<string[]>(
      'นามสกุลไฟล์ที่อนุญาตเฉพาะรายการนี้ (ว่าง = ใช้ค่าของ SubmissionCampaigns.allowed_extensions)',
      { example: '["pdf"]' },
    ),
    sort_order: req.int('ลำดับการแสดงผล (น้อยไปมาก)'),
    is_active: req.boolean(
      'true = ยังเป็นรายการที่ต้องส่ง (ยกเลิกรายการแล้วเป็น false ไม่ลบแถว เพราะ Submissions อ้างถึง)',
    ),
  },
  { phase: 4 },
);

export const Submissions = defineTable(
  'task',
  'Submissions',
  'สถานะการส่งงานของผู้ส่งแต่ละคนต่อรายการที่ต้องส่ง — หนึ่งแถวต่อ (การเปิดรับ, รายการ, ผู้ส่ง) ไฟล์ของแต่ละครั้งที่ส่งอยู่ใน SubmissionVersions',
  {
    ...base,
    campaign_id: req.string('การเปิดรับส่งงาน', { ref: 'task.SubmissionCampaigns' }),
    requirement_id: req.string('รายการที่ต้องส่ง', { ref: 'task.SubmissionRequirements' }),
    submitter_id: req.string('ผู้ส่งงาน', { ref: 'master.Users' }),
    department_id: col.string(
      'กลุ่มสาระของผู้ส่ง (สำเนา ณ วันที่สร้างรายการ) ไม่เปลี่ยนตามการย้ายกลุ่มสาระภายหลัง เพื่อให้รายงานย้อนหลังและขอบเขตสิทธิ์ของหัวหน้ากลุ่มสาระคงเดิม',
      { ref: 'master.Departments' },
    ),
    status: req.enum(
      ['not_submitted', 'submitted', 'late', 'returned', 'approved'],
      'สถานะ: ยังไม่ส่ง / ส่งแล้วรอตรวจ / ส่งช้ารอตรวจ (ส่งหลังวันครบกำหนด) / ส่งกลับแก้ไข / อนุมัติ',
    ),
    current_submission_version: req.int(
      'เลขเวอร์ชันล่าสุดของงานที่ส่ง ตรงกับ SubmissionVersions.submission_version (0 = ยังไม่เคยส่ง)',
    ),
    submitted_at: col.datetime('วันเวลาที่ส่งเวอร์ชันล่าสุด (ว่าง = ยังไม่ส่ง)'),
    is_late: req.boolean(
      'true = ส่งครั้งแรกหลังวันครบกำหนด คงค่าไว้แม้สถานะเปลี่ยนภายหลัง ใช้ในรายงานการส่งงาน',
    ),
    form_answers: col.json<SubmissionFormAnswers>(
      'คำตอบของช่องข้อมูลเพิ่มเติม เป็น object ที่คีย์ตรงกับ key ใน SubmissionCampaigns.form_fields',
    ),
  },
  { uniqueKeys: [['campaign_id', 'requirement_id', 'submitter_id']], phase: 4 },
);

export const SubmissionVersions = defineTable(
  'task',
  'SubmissionVersions',
  'ประวัติเวอร์ชันของงานที่ส่ง — ทุกครั้งที่ส่งหรือส่งใหม่เพิ่มหนึ่งแถว ไม่แก้ไขเวอร์ชันเดิม',
  {
    ...logBase,
    submission_id: req.string('รายการส่งงาน', { ref: 'task.Submissions' }),
    submission_version: req.int(
      'เลขเวอร์ชันของงานที่ส่ง เริ่มที่ 1 และเพิ่มทีละ 1 ทุกครั้งที่ส่งใหม่',
    ),
    file_id: req.string('ไฟล์งานของเวอร์ชันนี้', { ref: 'system.FileRegistry' }),
    note: col.string('หมายเหตุจากผู้ส่ง เช่น สิ่งที่แก้ไขจากเวอร์ชันก่อน'),
    submitted_at: req.datetime('วันเวลาที่ส่งเวอร์ชันนี้'),
    submitted_by: req.string('ผู้ส่งเวอร์ชันนี้', { ref: 'master.Users' }),
  },
  { uniqueKeys: [['submission_id', 'submission_version']], appendOnly: true, phase: 4 },
);

export const SubmissionReviews = defineTable(
  'task',
  'SubmissionReviews',
  'ผลการตรวจและข้อเสนอแนะของผู้ตรวจต่องานแต่ละเวอร์ชัน บันทึกเพิ่มอย่างเดียว',
  {
    ...logBase,
    submission_id: req.string('รายการส่งงานที่ตรวจ', { ref: 'task.Submissions' }),
    submission_version: req.int(
      'เวอร์ชันของงานที่ตรวจ ตรงกับ SubmissionVersions.submission_version',
    ),
    decision: req.enum(
      ['approved', 'returned', 'commented'],
      'ผลการตรวจ: approved = อนุมัติ, returned = ส่งกลับแก้ไข, commented = ให้ข้อเสนอแนะโดยไม่เปลี่ยนสถานะ',
    ),
    feedback: col.string('ข้อเสนอแนะจากผู้ตรวจ (ต้องระบุเมื่อ decision = returned)'),
    reviewer_id: req.string('ผู้ตรวจ', { ref: 'master.Users' }),
    reviewed_at: req.datetime('วันเวลาที่ตรวจ'),
  },
  { appendOnly: true, phase: 4 },
);

export const taskDatabase: DatabaseDef = {
  key: 'task',
  title: 'TUNS_TASK_DATABASE',
  displayName: 'Task Database',
  envVar: 'GOOGLE_TASK_SPREADSHEET_ID',
  description:
    'งานมอบหมาย ผู้รับมอบหมาย ความคิดเห็นและประวัติของงาน และศูนย์รับส่งงานครู (การเปิดรับ รายการที่ต้องส่ง งานที่ส่ง เวอร์ชัน และผลการตรวจ)',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    Tasks,
    TaskAssignees,
    TaskComments,
    TaskHistory,
    SubmissionCampaigns,
    SubmissionTargets,
    SubmissionRequirements,
    Submissions,
    SubmissionVersions,
    SubmissionReviews,
  ],
};
