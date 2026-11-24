/**
 * TUNS_CLASS_LEAVE_DATABASE — ระบบขอเวลาเรียนนักเรียน (Module 03)
 *
 * การอนุมัติใช้ ApprovalRequests / ApprovalActions จาก Document Database (ไม่สร้างกลไกซ้ำ)
 * สถานะ 3 เรื่องแยกจากกันโดยเด็ดขาด:
 *   1) สถานะอนุมัติ (ClassLeaveRequests.status)
 *   2) การเข้าร่วมกิจกรรมจริง (ActivityAttendance)
 *   3) เวลาเรียนทางการ — ไม่อยู่ในระบบนี้ เป็นไปตามระเบียบและแนวปฏิบัติของโรงเรียน
 */
import { archivable, base, term } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

/** วันและคาบที่ขอ (ใช้ทั้งในฉบับร่างและในตาราง ClassLeavePeriods) */
export interface ClassLeaveDay {
  /** YYYY-MM-DD */
  date: string;
  mode: 'periods' | 'half_day_am' | 'half_day_pm' | 'full_day';
  /** คาบที่ขอ (ใช้เมื่อ mode = periods) */
  periodNos: number[];
  note?: string;
}

/** เนื้อหาของฉบับร่างที่ยังไม่ส่ง — เมื่อส่ง ระบบจะบันทึกเป็นแถวในตารางลูกตามเวอร์ชันของคำร้อง */
export interface ClassLeaveDraftData {
  studentIds: string[];
  days: ClassLeaveDay[];
}

export const ClassLeaveRequests = defineTable(
  'classLeave',
  'ClassLeaveRequests',
  'คำร้อง/หนังสือขอเวลาเรียนหนึ่งฉบับ',
  {
    ...base,
    reference_no: req.string('เลขอ้างอิงภายในระบบ', { example: 'CL-2569-0001' }),
    ...term,
    activity_name: req.string('ชื่อกิจกรรม'),
    activity_type: req.enum(
      [
        'academic_competition',
        'competition_practice',
        'sports_competition',
        'internal_activity',
        'external_activity',
        'academic_camp',
        'training',
        'study_visit',
        'special_program',
        'school_duty',
        'other',
      ],
      'ประเภทกิจกรรม',
    ),
    objective: col.string('วัตถุประสงค์'),
    rationale: col.string('เหตุผลและความจำเป็น'),
    location: col.string('สถานที่'),
    department_id: col.string('กลุ่มสาระที่รับผิดชอบ', { ref: 'master.Departments' }),
    unit_id: col.string('กลุ่มงานที่รับผิดชอบ', { ref: 'master.AcademicUnits' }),
    owner_id: req.string('ครูผู้รับผิดชอบ (ผู้จัดทำคำร้อง)', { ref: 'master.Users' }),
    co_owner_ids: col.json<string[]>('ครูผู้ร่วมรับผิดชอบ (รหัสผู้ใช้)'),
    start_date: col.date('วันแรกของกิจกรรม (คำนวณจาก ClassLeavePeriods)'),
    end_date: col.date('วันสุดท้ายของกิจกรรม'),
    student_count: req.int('จำนวนนักเรียนในคำร้อง'),
    period_count: req.int('จำนวนคาบเรียนที่ขอ (รวมทุกวัน)'),
    timetable_verification: req.enum(
      ['auto', 'partial', 'manual', 'none'],
      'การตรวจกับตารางเรียน: auto = ตรวจอัตโนมัติครบ, partial = ตรวจได้บางส่วน, manual = ระบุคาบ/ผู้เกี่ยวข้องเอง, none = ยังไม่ได้ระบุคาบ',
    ),
    status: req.enum(
      [
        'draft',
        'submitted',
        'pending_review',
        'in_consideration',
        'returned',
        'approved',
        'rejected',
        'cancelled',
        'archived',
      ],
      'สถานะอนุมัติของคำร้อง (ไม่ใช่การยืนยันการเข้าร่วมหรือเวลาเรียน)',
    ),
    request_version: req.int(
      'เวอร์ชันเนื้อหาของคำร้อง เพิ่มเมื่อแก้ไขรายชื่อหรือช่วงเวลาหลังส่ง ต้องเข้าสู่การพิจารณาใหม่',
    ),
    form_step: req.int('ขั้นตอนของฟอร์มที่กรอกถึงล่าสุด (1–5) ใช้เปิดฉบับร่างต่อ'),
    draft_data: col.json<ClassLeaveDraftData>(
      'รายชื่อนักเรียน (รหัสอ้างอิง) และวัน/คาบของฉบับที่กำลังแก้ไข — ตารางลูก (ClassLeaveStudents ฯลฯ) ถูกสร้างเมื่อส่ง และไม่ถูกแก้ไขอีก จึงเก็บประวัติทุกเวอร์ชันได้',
      { pii: 'personal' },
    ),
    approval_request_id: col.string('คำขออนุมัติล่าสุด', { ref: 'document.ApprovalRequests' }),
    submitted_at: col.datetime('วันเวลาที่ส่งล่าสุด'),
    approved_at: col.datetime('วันเวลาที่อนุมัติครบ'),
    document_file_id: col.string('ไฟล์หนังสือฉบับล่าสุดที่ระบบสร้าง', {
      ref: 'system.FileRegistry',
    }),
    approved_file_id: col.string('ไฟล์หนังสือฉบับอนุมัติ', { ref: 'system.FileRegistry' }),
    cancel_reason: col.string('เหตุผลที่ยกเลิก'),
    ...archivable,
  },
  { uniqueKeys: [['reference_no']], phase: 3 },
);

export const ClassLeaveStudents = defineTable(
  'classLeave',
  'ClassLeaveStudents',
  'รายชื่อนักเรียนในคำร้อง เก็บสำเนาชื่อและห้อง ณ เวลาที่ขอ เพื่อให้เอกสารย้อนหลังไม่เปลี่ยนตามข้อมูลหลัก',
  {
    ...base,
    request_id: req.string('คำร้อง', { ref: 'classLeave.ClassLeaveRequests' }),
    request_version: req.int('เวอร์ชันของคำร้องที่รายชื่อนี้สังกัด'),
    student_id: req.string('นักเรียน', { ref: 'master.Students' }),
    student_code: req.string('รหัสนักเรียน (สำเนา, ข้อความ)', { pii: 'personal' }),
    student_name: req.string('ชื่อ–นามสกุล (สำเนา)', { pii: 'personal' }),
    classroom_id: col.string('ห้องเรียน', { ref: 'master.Classrooms' }),
    classroom_name: col.string('ชื่อห้องเรียน (สำเนา)'),
    student_no: col.int('เลขที่ (สำเนา)'),
    sort_order: req.int('ลำดับในบัญชีรายชื่อ'),
  },
  { phase: 3 },
);

export const ClassLeavePeriods = defineTable(
  'classLeave',
  'ClassLeavePeriods',
  'วันและคาบที่ขอเวลาเรียน หนึ่งแถวต่อหนึ่งวัน รองรับรายคาบ ครึ่งวัน เต็มวัน และหลายวัน',
  {
    ...base,
    request_id: req.string('คำร้อง', { ref: 'classLeave.ClassLeaveRequests' }),
    request_version: req.int('เวอร์ชันของคำร้อง'),
    leave_date: req.date('วันที่ขอเวลาเรียน'),
    mode: req.enum(
      ['periods', 'half_day_am', 'half_day_pm', 'full_day'],
      'รูปแบบ: รายคาบ / ครึ่งวันเช้า / ครึ่งวันบ่าย / เต็มวัน',
    ),
    period_nos: req.json<number[]>('คาบที่ขอในวันนั้น'),
    start_time: col.string('เวลาเริ่ม (HH:mm)'),
    end_time: col.string('เวลาสิ้นสุด (HH:mm)'),
    note: col.string('หมายเหตุของวันนั้น'),
  },
  { phase: 3 },
);

export const ClassLeaveImpacts = defineTable(
  'classLeave',
  'ClassLeaveImpacts',
  'คาบเรียนที่ได้รับผลกระทบ หนึ่งแถวต่อ ห้องเรียน × วัน × คาบ พร้อมรายชื่อนักเรียนของห้องนั้นที่อยู่ในคำร้อง',
  {
    ...base,
    request_id: req.string('คำร้อง', { ref: 'classLeave.ClassLeaveRequests' }),
    request_version: req.int('เวอร์ชันของคำร้อง'),
    leave_date: req.date('วันที่'),
    period_no: req.int('คาบที่'),
    classroom_id: col.string('ห้องเรียน', { ref: 'master.Classrooms' }),
    classroom_name: col.string('ชื่อห้องเรียน (สำเนา)'),
    course_id: col.string('รายวิชาที่กระทบ', { ref: 'master.Courses' }),
    course_code: col.string('รหัสวิชา (สำเนา)'),
    course_name: col.string('ชื่อรายวิชา (สำเนา หรือระบุเอง)'),
    teacher_id: col.string('ครูผู้สอน', { ref: 'master.Teachers' }),
    teacher_user_id: col.string('บัญชีผู้ใช้ของครูผู้สอน (ใช้แจ้งเตือน)', { ref: 'master.Users' }),
    student_ids: req.json<string[]>('นักเรียนของห้องนี้ที่อยู่ในคำร้อง (รหัสนักเรียนใน master.Students)'),
    student_count: req.int('จำนวนนักเรียนที่กระทบในคาบนี้'),
    verification: req.enum(
      ['auto', 'manual'],
      'auto = คำนวณจากตารางเรียน, manual = ผู้จัดทำระบุเอง (ยังไม่ได้ตรวจอัตโนมัติ)',
    ),
  },
  { phase: 3 },
);

export const ClassLeaveRecipients = defineTable(
  'classLeave',
  'ClassLeaveRecipients',
  'ครูผู้สอนและครูที่ปรึกษาที่ต้องได้รับแจ้ง แต่ละคนเห็นเฉพาะนักเรียนและคาบที่เกี่ยวข้องกับตนเอง',
  {
    ...base,
    request_id: req.string('คำร้อง', { ref: 'classLeave.ClassLeaveRequests' }),
    request_version: req.int('เวอร์ชันของคำร้อง'),
    user_id: req.string('ผู้รับแจ้ง', { ref: 'master.Users' }),
    recipient_role: req.enum(
      ['subject_teacher', 'advisor'],
      'เหตุที่ได้รับแจ้ง: ครูผู้สอนในคาบที่กระทบ / ครูที่ปรึกษา',
    ),
    notified_at: col.datetime('วันเวลาที่ระบบแจ้งเตือน'),
  },
  { uniqueKeys: [['request_id', 'request_version', 'user_id', 'recipient_role']], phase: 3 },
);

export const ClassLeaveAcknowledgements = defineTable(
  'classLeave',
  'ClassLeaveAcknowledgements',
  'การกดรับทราบของครูผู้สอน/ครูที่ปรึกษา',
  {
    ...base,
    request_id: req.string('คำร้อง', { ref: 'classLeave.ClassLeaveRequests' }),
    request_version: req.int('เวอร์ชันของคำร้องที่รับทราบ'),
    user_id: req.string('ผู้รับทราบ', { ref: 'master.Users' }),
    acknowledged_at: req.datetime('วันเวลาที่รับทราบ'),
  },
  { uniqueKeys: [['request_id', 'request_version', 'user_id']], phase: 3 },
);

export const ActivityAttendance = defineTable(
  'classLeave',
  'ActivityAttendance',
  'การเข้าร่วมกิจกรรมจริงของนักเรียน บันทึกโดยครูผู้รับผิดชอบ — ไม่ใช่เวลาเรียนทางการ และการอนุมัติหนังสือไม่ถือเป็นการเข้าร่วม',
  {
    ...base,
    request_id: req.string('คำร้อง', { ref: 'classLeave.ClassLeaveRequests' }),
    student_id: req.string('นักเรียน', { ref: 'master.Students' }),
    leave_date: req.date('วันที่'),
    status: req.enum(
      ['pending', 'attended', 'absent', 'partial', 'cancelled'],
      'รอตรวจสอบ / เข้าร่วมกิจกรรมจริง / ไม่เข้าร่วม / เข้าร่วมบางช่วงเวลา / ยกเลิกการเข้าร่วม',
    ),
    actual_start_time: col.string('เวลาเข้าร่วมจริง (HH:mm)'),
    actual_end_time: col.string('เวลาสิ้นสุดจริง (HH:mm)'),
    note: col.string('หมายเหตุ', { pii: 'personal' }),
    evidence_file_id: col.string('หลักฐานการเข้าร่วม', { ref: 'system.FileRegistry' }),
    recorded_by: req.string('ผู้บันทึก', { ref: 'master.Users' }),
    recorded_at: req.datetime('วันเวลาที่บันทึก'),
  },
  { uniqueKeys: [['request_id', 'student_id', 'leave_date']], phase: 3 },
);

export const classLeaveDatabase: DatabaseDef = {
  key: 'classLeave',
  title: 'TUNS_CLASS_LEAVE_DATABASE',
  displayName: 'Class Leave Database',
  envVar: 'GOOGLE_CLASS_LEAVE_SPREADSHEET_ID',
  description:
    'หนังสือขอเวลาเรียน รายชื่อนักเรียน วัน/คาบ ผลกระทบต่อคาบเรียน ผู้รับแจ้ง การรับทราบ และการเข้าร่วมกิจกรรมจริง',
  directAccess: 'ผู้ดูแลระบบเท่านั้น (มีรายชื่อนักเรียน)',
  tables: [
    ClassLeaveRequests,
    ClassLeaveStudents,
    ClassLeavePeriods,
    ClassLeaveImpacts,
    ClassLeaveRecipients,
    ClassLeaveAcknowledgements,
    ActivityAttendance,
  ],
};
