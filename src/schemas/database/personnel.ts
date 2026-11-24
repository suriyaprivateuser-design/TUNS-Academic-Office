/**
 * TUNS_PERSONNEL_DATABASE — งานบุคลากรและประสานงาน (Module 06)
 *
 * - โครงสร้างกลุ่มบริหารวิชาการ: OrganizationPositions (ผังรายปีการศึกษา) + PersonnelAssignments (ผู้ดำรงตำแหน่ง)
 * - ทะเบียนหน้าที่และภาระงาน: PersonnelResponsibilities
 * - ประสานงานกลุ่มสาระ: DepartmentCoordination
 * - ข้อมูลหลักของบุคลากรอยู่ที่ master.Teachers ที่เดียว ตารางในไฟล์นี้อ้างอิงด้วย teacher_id ไม่เก็บชื่อซ้ำ
 */
import { base, term } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

/** การส่งต่อเรื่องหนึ่งครั้งภายในกลุ่มสาระ (DepartmentCoordination.forwarding_history) */
export interface CoordinationForward {
  /** ผู้ส่งต่อ (master.Users.id) */
  from_user_id: string;
  /** ผู้รับเรื่องต่อ (master.Users.id) */
  to_user_id: string;
  /** วันเวลาที่ส่งต่อ (ISO 8601, UTC) */
  forwarded_at: string;
  /** ข้อความถึงผู้รับเรื่องต่อ */
  note?: string;
}

export const OrganizationPositions = defineTable(
  'personnel',
  'OrganizationPositions',
  'ตำแหน่งและคณะกรรมการในผังโครงสร้างกลุ่มบริหารวิชาการ (แต่ละแถวคือหนึ่งกล่องในผัง) จัดเก็บแยกรายปีการศึกษาเพื่อดูผังย้อนหลังได้',
  {
    ...base,
    title: req.string('ชื่อตำแหน่งหรือชื่อคณะกรรมการที่แสดงในผัง', {
      example: 'หัวหน้างานวัดผลและประเมินผล',
    }),
    position_type: req.enum(
      [
        'director',
        'deputy_director',
        'academic_head',
        'unit_head',
        'staff',
        'committee',
        'department_head',
      ],
      'ประเภทตำแหน่ง: director = ผู้อำนวยการโรงเรียน, deputy_director = รองผู้อำนวยการกลุ่มบริหารวิชาการ, academic_head = หัวหน้ากลุ่มบริหารวิชาการ, unit_head = หัวหน้างาน, staff = เจ้าหน้าที่/ผู้ปฏิบัติงาน, committee = คณะกรรมการ, department_head = หัวหน้ากลุ่มสาระการเรียนรู้',
    ),
    parent_position_id: col.string(
      'ตำแหน่งที่อยู่เหนือขึ้นไปในผัง ต้องเป็นตำแหน่งของปีการศึกษาเดียวกัน (ว่าง = ระดับบนสุด)',
      { ref: 'personnel.OrganizationPositions' },
    ),
    department_id: col.string('กลุ่มสาระที่ตำแหน่งนี้สังกัด (เช่น หัวหน้ากลุ่มสาระ)', {
      ref: 'master.Departments',
    }),
    unit_id: col.string('กลุ่มงานที่ตำแหน่งนี้สังกัด (เช่น หัวหน้างาน เจ้าหน้าที่ของงาน)', {
      ref: 'master.AcademicUnits',
    }),
    ...term,
    sort_order: req.int('ลำดับการแสดงผลของตำแหน่งในระดับเดียวกัน (น้อยไปมาก)'),
    status: req.enum(
      ['active', 'inactive'],
      'active = แสดงในผังโครงสร้าง, inactive = ยุบเลิกหรือไม่ใช้แล้ว (เก็บไว้เป็นประวัติ)',
    ),
  },
  { phase: 6 },
);

export const PersonnelAssignments = defineTable(
  'personnel',
  'PersonnelAssignments',
  'ผู้ดำรงตำแหน่งในผังโครงสร้าง — เก็บทุกช่วงเวลาเป็นประวัติ ตำแหน่งหนึ่งมีได้หลายคน (เช่น คณะกรรมการ) และคนหนึ่งดำรงได้หลายตำแหน่ง',
  {
    ...base,
    position_id: req.string('ตำแหน่งในผังโครงสร้าง', {
      ref: 'personnel.OrganizationPositions',
    }),
    teacher_id: req.string('บุคลากรผู้ดำรงตำแหน่ง', { ref: 'master.Teachers' }),
    role_title: col.string(
      'บทบาทภายในตำแหน่งหรือคณะกรรมการ (ว่าง = ดำรงตำแหน่งตามชื่อตำแหน่ง)',
      { example: 'กรรมการและเลขานุการ' },
    ),
    start_date: req.date('วันที่เริ่มดำรงตำแหน่ง'),
    end_date: col.date('วันที่พ้นจากตำแหน่ง (ว่าง = ยังดำรงตำแหน่ง)'),
    order_id: col.string('คำสั่งแต่งตั้งที่เกี่ยวข้อง', { ref: 'document.OfficialOrders' }),
    status: req.enum(
      ['active', 'ended', 'cancelled'],
      'active = ดำรงตำแหน่งอยู่, ended = พ้นจากตำแหน่งแล้ว (เก็บเป็นประวัติ), cancelled = ยกเลิกรายการ (บันทึกผิดหรือคำสั่งถูกยกเลิก ไม่นับเป็นประวัติ)',
    ),
  },
  { phase: 6 },
);

export const PersonnelResponsibilities = defineTable(
  'personnel',
  'PersonnelResponsibilities',
  'ทะเบียนหน้าที่และภาระงานของบุคลากร — หนึ่งแถวต่อหนึ่งหน้าที่ บุคลากรหนึ่งคนมีได้หลายหน้าที่',
  {
    ...base,
    teacher_id: req.string('บุคลากรผู้รับผิดชอบ', { ref: 'master.Teachers' }),
    title: req.string('ชื่อหน้าที่หรือภาระงาน'),
    details: col.string('รายละเอียดขอบเขตงานที่รับผิดชอบ'),
    responsibility_type: req.enum(
      ['teaching', 'unit_work', 'committee', 'special_duty', 'other'],
      'ประเภทภาระงาน: งานสอน / งานในกลุ่มงาน / คณะกรรมการ / หน้าที่พิเศษ / อื่น ๆ',
    ),
    unit_id: col.string('กลุ่มงานที่หน้าที่นี้สังกัด', { ref: 'master.AcademicUnits' }),
    department_id: col.string('กลุ่มสาระที่หน้าที่นี้สังกัด', { ref: 'master.Departments' }),
    order_id: col.string('คำสั่งที่มอบหมายหน้าที่นี้', { ref: 'document.OfficialOrders' }),
    start_date: col.date('วันที่เริ่มรับผิดชอบ'),
    end_date: col.date('วันที่สิ้นสุดการรับผิดชอบ (ว่าง = ยังรับผิดชอบอยู่)'),
    ...term,
    status: req.enum(
      ['active', 'ended', 'cancelled'],
      'active = รับผิดชอบอยู่, ended = สิ้นสุดแล้ว (เก็บเป็นประวัติ), cancelled = ยกเลิกรายการ (บันทึกผิดหรือคำสั่งถูกยกเลิก)',
    ),
  },
  { phase: 6 },
);

export const DepartmentCoordination = defineTable(
  'personnel',
  'DepartmentCoordination',
  'เรื่องที่ส่งประสานงานไปยังกลุ่มสาระการเรียนรู้ทั้ง 8 กลุ่ม — หนึ่งแถวต่อหนึ่งกลุ่มสาระปลายทาง ติดตามการรับทราบ การส่งต่อ และผลการดำเนินการ',
  {
    ...base,
    subject: req.string('เรื่องที่ประสานงาน'),
    details: col.string(
      'รายละเอียดสิ่งที่ขอให้กลุ่มสาระดำเนินการ (อาจระบุชื่อบุคคลหรือนักเรียน)',
      { pii: 'personal' },
    ),
    kind: req.enum(
      ['document', 'announcement', 'task', 'request'],
      'ลักษณะเรื่อง: document = ส่งต่อหนังสือ/เอกสาร, announcement = แจ้งประกาศ, task = มอบหมายงาน, request = ขอข้อมูลหรือความร่วมมือ',
    ),
    sender_id: req.string('ผู้ส่งเรื่อง', { ref: 'master.Users' }),
    sender_unit_id: col.string(
      'กลุ่มงานต้นเรื่อง ใช้กำหนดขอบเขตสิทธิ์ของหัวหน้างาน (ว่าง = ส่งในนามกลุ่มบริหารวิชาการ)',
      { ref: 'master.AcademicUnits' },
    ),
    target_department_id: req.string('กลุ่มสาระการเรียนรู้ปลายทาง', {
      ref: 'master.Departments',
    }),
    responsible_user_id: col.string(
      'ผู้รับผิดชอบเรื่องในกลุ่มสาระ (ผู้ที่ได้รับการส่งต่อล่าสุด)',
      { ref: 'master.Users' },
    ),
    linked_entity_type: col.string(
      'ตารางของรายการที่เชื่อมโยง ในรูป database.Worksheet (ว่าง = ไม่มีรายการเชื่อมโยง)',
      { example: 'document.IncomingDocuments' },
    ),
    linked_entity_id: col.string('รหัสรายการที่เชื่อมโยงในตารางตาม linked_entity_type'),
    status: req.enum(
      ['sent', 'acknowledged', 'in_progress', 'done', 'cancelled'],
      'สถานะ: ส่งแล้ว / รับทราบแล้ว / กำลังดำเนินการ / ดำเนินการเสร็จ / ยกเลิก',
    ),
    acknowledged_at: col.datetime('วันเวลาที่กลุ่มสาระรับทราบ (ว่าง = ยังไม่รับทราบ)'),
    acknowledged_by: col.string('ผู้รับทราบแทนกลุ่มสาระ', { ref: 'master.Users' }),
    forwarding_history: col.json<CoordinationForward[]>(
      'ประวัติการส่งต่อภายในกลุ่มสาระ เรียงตามเวลา [{ from_user_id, to_user_id, forwarded_at, note }] เพิ่มต่อท้ายเท่านั้น ไม่แก้รายการเดิม',
      { pii: 'personal' },
    ),
    due_date: col.date('วันที่ต้องดำเนินการให้แล้วเสร็จ'),
    ...term,
  },
  { phase: 6 },
);

export const personnelDatabase: DatabaseDef = {
  key: 'personnel',
  title: 'TUNS_PERSONNEL_DATABASE',
  displayName: 'Personnel Database',
  envVar: 'GOOGLE_PERSONNEL_SPREADSHEET_ID',
  description:
    'โครงสร้างกลุ่มบริหารวิชาการ ผู้ดำรงตำแหน่ง ทะเบียนหน้าที่และภาระงาน และการประสานงานกลุ่มสาระการเรียนรู้',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    OrganizationPositions,
    PersonnelAssignments,
    PersonnelResponsibilities,
    DepartmentCoordination,
  ],
};
