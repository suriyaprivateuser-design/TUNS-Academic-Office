/**
 * TUNS_MEETING_DATABASE — งานปฏิทินและการประชุม (Module 05)
 *
 * - ปฏิทินวิชาการ: CalendarEvents (เปิดใช้ตั้งแต่ Phase 1 เพราะหน้าแรกแสดงกำหนดการจากตารางนี้)
 * - การประชุม: Meetings → MeetingAgendas / MeetingParticipants / MeetingAttendance
 * - รายงานและมติ: MeetingMinutes → MeetingResolutions (มติแปลงเป็นงานใน Task Database ได้)
 * - ระบบนี้ไม่มีการจองห้องประชุม สถานที่จึงเป็นข้อความอิสระทุกที่
 */
import { archivable, base, term } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

/** บันทึกการประชุมของหนึ่งวาระ (MeetingMinutes.agenda_content) */
export interface MinutesAgendaContent {
  /** วาระที่บันทึก (meeting.MeetingAgendas.id) */
  agenda_id: string;
  /** เนื้อหาที่บันทึกของวาระนี้ (ข้อความล้วน) */
  content: string;
}

export const CalendarEvents = defineTable(
  'meeting',
  'CalendarEvents',
  'รายการในปฏิทินวิชาการ ทั้งที่บันทึกเองและที่เกิดจาก Module อื่น (การประชุม กำหนดส่งงาน กิจกรรมที่ขอเวลาเรียน) — หน้าแรกอ่านตารางนี้เพื่อแสดงกำหนดการ',
  {
    ...base,
    title: req.string('ชื่อรายการที่แสดงบนปฏิทิน'),
    description: col.string('รายละเอียดเพิ่มเติมของรายการ'),
    event_type: req.enum(
      [
        'meeting',
        'deadline',
        'exam',
        'academic_activity',
        'competition',
        'important_day',
        'class_leave',
        'supervision',
      ],
      'ประเภทรายการ: การประชุม / กำหนดส่งงาน / การสอบ / กิจกรรมวิชาการ / การแข่งขัน / วันสำคัญ / กิจกรรมที่ขอเวลาเรียน / การนิเทศ',
    ),
    start_at: req.datetime('วันเวลาเริ่มต้น'),
    end_at: col.datetime('วันเวลาสิ้นสุด (ว่าง = ไม่ระบุเวลาสิ้นสุด)'),
    all_day: req.boolean(
      'true = รายการทั้งวัน ไม่แสดงเวลา (วันที่ตีความตามเวลาประเทศไทย), false = มีเวลาเริ่มและสิ้นสุด',
    ),
    location: col.string('สถานที่ (ข้อความอิสระ)'),
    ...term,
    department_id: col.string(
      'กลุ่มสาระเจ้าของรายการ ใช้เมื่อ visibility = department (ว่าง = รายการระดับกลุ่มบริหารวิชาการ)',
      { ref: 'master.Departments' },
    ),
    visibility: req.enum(
      ['all', 'department', 'private'],
      'ผู้ที่มองเห็นรายการ: all = บุคลากรทุกคน, department = เฉพาะกลุ่มสาระใน department_id, private = เฉพาะผู้สร้าง',
    ),
    source_type: req.enum(
      ['manual', 'class_leave', 'task', 'meeting', 'submission_campaign'],
      'ที่มาของรายการ: manual = บันทึกเองในปฏิทิน ส่วนค่าอื่นคือรายการที่เกิดจาก Module อื่น (หนังสือขอเวลาเรียน / งานมอบหมาย / การประชุม / การเปิดรับส่งงาน) ซึ่งอ้างอิงรายการต้นทางด้วย source_id แทนการคัดลอกข้อมูลมาเก็บซ้ำ รายละเอียดให้ดูและแก้ไขที่รายการต้นทาง',
    ),
    source_id: col.string('รหัสรายการต้นทางตาม source_type (ว่างเมื่อ source_type = manual)'),
    google_event_id: col.string('รหัส event ใน Google Calendar เมื่อซิงก์แล้ว (ว่าง = ยังไม่ซิงก์)'),
    recurrence_rule: col.string('กฎการเกิดซ้ำตาม RFC 5545 (RRULE) ว่าง = ไม่เกิดซ้ำ', {
      example: 'FREQ=WEEKLY;BYDAY=MO',
    }),
    reminder_minutes: col.int('แจ้งเตือนล่วงหน้ากี่นาทีก่อน start_at (ว่าง = ไม่แจ้งเตือน)'),
    status: req.enum(
      ['scheduled', 'cancelled'],
      'scheduled = เป็นไปตามกำหนด, cancelled = ยกเลิก (เก็บแถวไว้เพื่อแสดงว่าถูกยกเลิก)',
    ),
    ...archivable,
  },
  { phase: 1 },
);

export const Meetings = defineTable(
  'meeting',
  'Meetings',
  'การประชุมของกลุ่มบริหารวิชาการ กลุ่มสาระ กลุ่มงาน และคณะกรรมการ — สถานที่เป็นข้อความอิสระ (ไม่มีการจองห้อง) การลงชื่อด้วย QR ใช้ token ที่มีช่วงเวลาใช้งานจำกัดและเก็บเฉพาะค่า hash',
  {
    ...base,
    reference_no: col.string('เลขอ้างอิงภายในของการประชุม ออกโดยระบบ (ไม่ใช่เลขหนังสือราชการ)'),
    name: req.string('ชื่อการประชุม'),
    meeting_no: col.string('ครั้งที่ของการประชุม ตามที่ใช้ในหนังสือเชิญและรายงานการประชุม', {
      example: '3/2569',
    }),
    meeting_type: req.enum(
      ['general', 'department', 'unit', 'committee', 'other'],
      'ประเภทการประชุม: general = ประชุมกลุ่มบริหารวิชาการ, department = ประชุมกลุ่มสาระการเรียนรู้, unit = ประชุมกลุ่มงาน, committee = ประชุมคณะกรรมการ/คณะทำงาน, other = อื่น ๆ',
    ),
    start_at: req.datetime('วันเวลาเริ่มประชุม'),
    end_at: col.datetime('วันเวลาสิ้นสุดการประชุม (โดยประมาณ)'),
    location: col.string('สถานที่ประชุม (ข้อความอิสระ — ระบบไม่มีการจองห้องประชุม)'),
    chair_id: col.string(
      'ประธานการประชุม (ต้องอยู่ใน MeetingParticipants ด้วยบทบาท chair)',
      { ref: 'master.Users' },
    ),
    secretary_id: col.string(
      'เลขานุการผู้จดรายงานการประชุม (ต้องอยู่ใน MeetingParticipants ด้วยบทบาท secretary)',
      { ref: 'master.Users' },
    ),
    objective: col.string('วัตถุประสงค์ของการประชุม'),
    department_id: col.string(
      'กลุ่มสาระเจ้าของการประชุม ใช้กำหนดขอบเขตสิทธิ์ (ว่าง = ระดับกลุ่มบริหารวิชาการ)',
      { ref: 'master.Departments' },
    ),
    unit_id: col.string('กลุ่มงานเจ้าของการประชุม ใช้กำหนดขอบเขตสิทธิ์', {
      ref: 'master.AcademicUnits',
    }),
    ...term,
    invitation_document_id: col.string(
      'หนังสือเชิญประชุมใน Document Database (อ้างอิงเอกสารเดิม ไม่คัดลอกไฟล์)',
      { ref: 'document.Documents' },
    ),
    status: req.enum(
      ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'],
      'สถานะ: ฉบับร่าง / กำหนดการแล้ว / กำลังประชุม / ประชุมเสร็จสิ้น / ยกเลิก',
    ),
    change_note: col.string(
      'เหตุผลการเลื่อน เปลี่ยนแปลง หรือยกเลิกการประชุมครั้งล่าสุด (ประวัติการแก้ไขทั้งหมดอยู่ใน Audit Log)',
    ),
    checkin_token_hash: col.string(
      'ค่า hash ของ token ลงชื่อเข้าประชุมด้วย QR ชุดปัจจุบัน — เก็บเฉพาะ hash ไม่เก็บ token จริง เมื่อออก token ใหม่ค่าเดิมใช้ไม่ได้ทันที (ว่าง = ยังไม่เปิดลงชื่อด้วย QR)',
    ),
    checkin_opens_at: col.datetime('เวลาเริ่มเปิดให้ลงชื่อเข้าประชุม'),
    checkin_closes_at: col.datetime(
      'เวลาปิดลงชื่อเข้าประชุม — token หมดอายุเมื่อพ้นเวลานี้ แม้ยังมีภาพ QR อยู่ก็ใช้ไม่ได้',
    ),
    ...archivable,
  },
  { phase: 5 },
);

export const MeetingAgendas = defineTable(
  'meeting',
  'MeetingAgendas',
  'ระเบียบวาระการประชุม เรียงตาม sort_order',
  {
    ...base,
    meeting_id: req.string('การประชุม', { ref: 'meeting.Meetings' }),
    agenda_no: req.string('เลขระเบียบวาระ เก็บเป็นข้อความเพื่อรองรับวาระย่อย', {
      example: '3.1',
    }),
    sort_order: req.int(
      'ลำดับของวาระ (น้อยไปมาก) — ใช้เรียงแทน agenda_no ซึ่งเป็นข้อความ (เช่น 10 ต้องมาหลัง 9)',
    ),
    title: req.string('ชื่อเรื่องของวาระ'),
    details: col.string(
      'รายละเอียดและข้อมูลประกอบการพิจารณา (อาจระบุชื่อบุคคลหรือนักเรียน)',
      { pii: 'personal' },
    ),
    presenter_id: col.string('ผู้นำเสนอวาระ', { ref: 'master.Users' }),
    attachment_file_ids: col.json<string[]>(
      'เอกสารประกอบวาระ เป็นรายการรหัสไฟล์ใน system.FileRegistry',
    ),
  },
  { phase: 5 },
);

export const MeetingParticipants = defineTable(
  'meeting',
  'MeetingParticipants',
  'ผู้ที่ได้รับเชิญเข้าประชุม บทบาทในการประชุม และการตอบรับคำเชิญ',
  {
    ...base,
    meeting_id: req.string('การประชุม', { ref: 'meeting.Meetings' }),
    user_id: req.string('ผู้ได้รับเชิญ', { ref: 'master.Users' }),
    role: req.enum(
      ['chair', 'secretary', 'member', 'guest'],
      'บทบาทในการประชุม: chair = ประธาน, secretary = เลขานุการ, member = องค์ประชุม, guest = ผู้เข้าร่วมประชุมที่ไม่ใช่องค์ประชุม',
    ),
    is_required: req.boolean('true = จำเป็นต้องเข้าประชุม, false = เชิญเข้าร่วมโดยไม่บังคับ'),
    rsvp_status: req.enum(
      ['pending', 'accepted', 'declined'],
      'การตอบรับคำเชิญ: รอตอบรับ / ตอบรับเข้าประชุม / แจ้งไม่เข้าประชุม',
    ),
    responded_at: col.datetime('วันเวลาที่ตอบรับล่าสุด (ว่าง = ยังไม่ตอบรับ)'),
    rsvp_note: col.string(
      'หมายเหตุประกอบการตอบรับ เช่น เหตุที่ไม่สามารถเข้าประชุม (อาจมีข้อมูลสุขภาพ เช่น ลาป่วย)',
      { pii: 'sensitive' },
    ),
  },
  { uniqueKeys: [['meeting_id', 'user_id']], phase: 5 },
);

export const MeetingAttendance = defineTable(
  'meeting',
  'MeetingAttendance',
  'ผลการลงชื่อเข้าประชุม หนึ่งแถวต่อผู้เข้าประชุมหนึ่งคนต่อการประชุม จึงลงชื่อซ้ำไม่ได้แม้ใช้ QR เดิม',
  {
    ...base,
    meeting_id: req.string('การประชุม', { ref: 'meeting.Meetings' }),
    user_id: req.string('ผู้เข้าประชุม', { ref: 'master.Users' }),
    status: req.enum(
      ['present', 'late', 'leave', 'absent'],
      'ผลการเข้าประชุม: มาประชุม / มาสาย / ลา / ขาด',
    ),
    checked_in_at: col.datetime('วันเวลาที่ลงชื่อเข้าประชุม (ว่างเมื่อ status = leave หรือ absent)'),
    method: req.enum(
      ['web', 'qr', 'manual'],
      'วิธีบันทึก: web = ผู้เข้าประชุมบันทึกเองในระบบ, qr = สแกน QR ของการประชุมด้วยบัญชีของตนเอง, manual = เลขานุการบันทึกแทน',
    ),
    note: col.string(
      'หมายเหตุการเข้าประชุม เช่น เหตุผลการลาหรือมาสาย ใช้ประกอบรายงานการประชุม (อาจมีข้อมูลสุขภาพ เช่น ลาป่วย)',
      { pii: 'sensitive' },
    ),
    corrected_by: col.string('ผู้แก้ไขผลการลงชื่อภายหลัง (ว่าง = ไม่เคยแก้ไข)', {
      ref: 'master.Users',
    }),
    corrected_at: col.datetime('วันเวลาที่แก้ไขผลการลงชื่อล่าสุด'),
    correction_note: col.string('เหตุผลการแก้ไข (ต้องระบุทุกครั้งที่แก้ไข)', {
      pii: 'personal',
    }),
  },
  { uniqueKeys: [['meeting_id', 'user_id']], phase: 5 },
);

export const MeetingMinutes = defineTable(
  'meeting',
  'MeetingMinutes',
  'รายงานการประชุม หนึ่งแถวต่อหนึ่งการประชุม — ฉบับที่รับรองแล้วแก้ไขไม่ได้ ต้องออกฉบับใหม่ (minutes_version) มติแยกเก็บใน MeetingResolutions',
  {
    ...base,
    meeting_id: req.string('การประชุม', { ref: 'meeting.Meetings' }),
    minutes_version: req.int(
      'ฉบับที่ของรายงานการประชุม เริ่มที่ 1 และเพิ่มเมื่อแก้ไขหลังเสนอรับรองแล้ว (คนละความหมายกับ version ที่ใช้ตรวจการแก้ไขชนกัน)',
    ),
    status: req.enum(
      ['draft', 'pending_approval', 'approved'],
      'สถานะ: ฉบับร่าง / รอรับรอง / รับรองแล้ว',
    ),
    agenda_content: col.json<MinutesAgendaContent[]>(
      'บันทึกการประชุมแยกตามวาระ [{ agenda_id, content }] รวมไม่เกิน 50,000 อักขระต่อ cell (ตรวจก่อนบันทึก) — รายละเอียดที่ยาวมากให้อ้างถึงเอกสารประกอบวาระแทนการพิมพ์ซ้ำ',
      { pii: 'personal' },
    ),
    summary: col.string('สรุปสาระสำคัญของการประชุม', { pii: 'personal' }),
    approved_by: col.string('ผู้รับรองรายงานการประชุม', { ref: 'master.Users' }),
    approved_at: col.datetime('วันเวลาที่รับรองรายงานการประชุม'),
    pdf_file_id: col.string('ไฟล์รายงานการประชุมฉบับส่งออก PDF', {
      ref: 'system.FileRegistry',
    }),
    docx_file_id: col.string('ไฟล์รายงานการประชุมฉบับส่งออก DOCX', {
      ref: 'system.FileRegistry',
    }),
    ...archivable,
  },
  { uniqueKeys: [['meeting_id']], phase: 5 },
);

export const MeetingResolutions = defineTable(
  'meeting',
  'MeetingResolutions',
  'มติที่ประชุมรายวาระ ผู้รับผิดชอบ และการติดตามผล — มติที่แปลงเป็นงานเชื่อมกับ task.Tasks ทั้งสองทาง จึงเปิดย้อนกลับมายังรายงานการประชุมต้นทางได้',
  {
    ...base,
    meeting_id: req.string('การประชุม', { ref: 'meeting.Meetings' }),
    minutes_id: req.string('รายงานการประชุมที่บันทึกมตินี้ (ที่มาของมติ)', {
      ref: 'meeting.MeetingMinutes',
    }),
    agenda_id: req.string('วาระที่ลงมติ', { ref: 'meeting.MeetingAgendas' }),
    resolution_text: req.string('มติที่ประชุม (อาจระบุชื่อบุคคลหรือนักเรียน)', {
      pii: 'personal',
    }),
    opinion_notes: col.string('ข้อคิดเห็นและข้อเสนอแนะของที่ประชุมประกอบมติ', {
      pii: 'personal',
    }),
    responsible_user_id: col.string('ผู้รับผิดชอบดำเนินการตามมติ (รายบุคคล)', {
      ref: 'master.Users',
    }),
    responsible_department_id: col.string('กลุ่มสาระที่รับผิดชอบดำเนินการตามมติ', {
      ref: 'master.Departments',
    }),
    responsible_unit_id: col.string('กลุ่มงานที่รับผิดชอบดำเนินการตามมติ', {
      ref: 'master.AcademicUnits',
    }),
    due_date: col.date('กำหนดแล้วเสร็จของการดำเนินการตามมติ'),
    follow_up_status: req.enum(
      ['none', 'task_created', 'done'],
      'การติดตามมติ: none = ยังไม่มีการติดตาม, task_created = แปลงเป็นงานแล้ว (ดู task_id), done = ดำเนินการตามมติเสร็จแล้ว',
    ),
    task_id: col.string(
      'งานใน Task Database ที่สร้างจากมตินี้ — งานนั้นอ้างกลับด้วย source_type = meeting_resolution และ source_id = id ของมตินี้',
      { ref: 'task.Tasks' },
    ),
  },
  { phase: 5 },
);

export const meetingDatabase: DatabaseDef = {
  key: 'meeting',
  title: 'TUNS_MEETING_DATABASE',
  displayName: 'Meeting Database',
  envVar: 'GOOGLE_MEETING_SPREADSHEET_ID',
  description:
    'ปฏิทินวิชาการ การประชุม ระเบียบวาระ ผู้เข้าประชุม การลงชื่อเข้าประชุม รายงานการประชุม และมติที่ประชุม',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    CalendarEvents,
    Meetings,
    MeetingAgendas,
    MeetingParticipants,
    MeetingAttendance,
    MeetingMinutes,
    MeetingResolutions,
  ],
};
