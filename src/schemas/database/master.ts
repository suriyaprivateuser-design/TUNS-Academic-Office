/**
 * TUNS_MASTER_DATABASE — ข้อมูลหลัก: ผู้ใช้ บทบาท สิทธิ์ บุคลากร นักเรียน โครงสร้างการเรียน ตารางเรียน
 *
 * Source of Truth:
 *   - ครู นักเรียน ห้องเรียน รายวิชา ตารางเรียน → TUNS-SIS (เมื่อเชื่อมต่อแล้ว) นำเข้าด้วย Import/Sync
 *     ตารางในไฟล์นี้เป็น "สำเนาอ่าน" ที่มีคอลัมน์ source / source_ref กำกับ ห้ามแก้ข้อมูลที่มาจาก SIS ในระบบนี้
 *   - ผู้ใช้ บทบาท สิทธิ์ ปีการศึกษา → TUNS Academic Office เป็นเจ้าของ
 */
import { archivable, base, demoFlag } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

const sourceColumns = {
  source: req.enum(
    ['manual', 'import', 'sis'],
    'ที่มาของข้อมูล: manual = กรอกในระบบ, import = นำเข้าจากไฟล์, sis = ซิงก์จาก TUNS-SIS',
  ),
  source_ref: col.string('รหัสอ้างอิงในระบบต้นทาง (ใช้จับคู่ตอนซิงก์ ไม่ใช้ชื่อ)'),
} as const;

export const Users = defineTable(
  'master',
  'Users',
  'บัญชีผู้ใช้ที่ได้รับอนุญาตให้เข้าสู่ระบบ (ทำหน้าที่เป็น Email Allowlist) — การมีบัญชี Google อย่างเดียวไม่ทำให้เข้าระบบได้',
  {
    ...base,
    email: req.string('อีเมลบัญชี Google ที่อนุญาต (ตัวพิมพ์เล็ก) ใช้เป็นข้อมูลประกอบ ไม่ใช่ตัวระบุถาวร', {
      pii: 'personal',
    }),
    google_sub: col.string(
      'Google Account Subject ID ที่ตรวจสอบแล้ว เป็นตัวระบุบัญชีถาวร ผูกครั้งแรกที่เข้าสู่ระบบสำเร็จ',
      { pii: 'personal' },
    ),
    display_name: req.string('ชื่อที่แสดงในระบบ', { pii: 'personal' }),
    teacher_id: col.string('บุคลากรที่ผูกกับบัญชีนี้ (ว่างได้ เช่น ผู้ตรวจสอบภายนอก)', {
      ref: 'master.Teachers',
    }),
    status: req.enum(
      ['active', 'suspended'],
      'active = เข้าสู่ระบบได้, suspended = ระงับการใช้งาน (ตรวจทุกคำขอ ไม่ต้องรอ session หมดอายุ)',
    ),
    last_login_at: col.datetime('วันเวลาที่เข้าสู่ระบบสำเร็จล่าสุด'),
    ...demoFlag,
  },
  { uniqueKeys: [['email']], phase: 0 },
);

export const Roles = defineTable(
  'master',
  'Roles',
  'บทบาทผู้ใช้งาน 9 กลุ่ม (id ตรงกับรหัสบทบาทในโค้ด เช่น teacher, office_staff)',
  {
    ...base,
    name_th: req.string('ชื่อบทบาทภาษาไทย'),
    name_en: req.string('ชื่อบทบาทภาษาอังกฤษ'),
    description: col.string('หน้าที่ของบทบาท'),
    assignment_scope: req.enum(
      ['global', 'department', 'unit'],
      'ขอบเขตที่ต้องระบุเมื่อมอบบทบาท: ไม่ต้องระบุ / กลุ่มสาระ / กลุ่มงาน',
    ),
    sort_order: req.int('ลำดับการแสดงผล'),
  },
  { phase: 0 },
);

export const Permissions = defineTable(
  'master',
  'Permissions',
  'รายการสิทธิ์ทั้งหมด = ระบบย่อย (resource) × การกระทำ (action)',
  {
    ...base,
    resource: req.string('Resource key ของระบบย่อย', { example: 'classLeave.requests' }),
    action: req.enum(
      [
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
      ],
      'การกระทำ',
    ),
    description: col.string('คำอธิบายสิทธิ์'),
  },
  { uniqueKeys: [['resource', 'action']], phase: 0 },
);

export const UserRoles = defineTable(
  'master',
  'UserRoles',
  'การมอบบทบาทให้ผู้ใช้ — หนึ่งคนมีได้หลายบทบาท และบทบาทหัวหน้ากลุ่มสาระ/หัวหน้างานต้องระบุขอบเขต',
  {
    ...base,
    user_id: req.string('ผู้ใช้', { ref: 'master.Users' }),
    role_id: req.string('บทบาท', { ref: 'master.Roles' }),
    department_id: col.string('กลุ่มสาระที่บทบาทนี้ครอบคลุม (สำหรับ department_head)', {
      ref: 'master.Departments',
    }),
    unit_id: col.string('กลุ่มงานที่บทบาทนี้ครอบคลุม (สำหรับ unit_head)', {
      ref: 'master.AcademicUnits',
    }),
    status: req.enum(['active', 'revoked'], 'active = มีผล, revoked = เพิกถอนแล้ว (เก็บประวัติไว้)'),
  },
  { phase: 0 },
);

export const RolePermissions = defineTable(
  'master',
  'RolePermissions',
  'Permission Matrix ที่ใช้งานจริง: บทบาท × ระบบย่อย × การกระทำ → ขอบเขตข้อมูล',
  {
    ...base,
    role_id: req.string('บทบาท', { ref: 'master.Roles' }),
    resource: req.string('Resource key ของระบบย่อย'),
    action: req.string('การกระทำ'),
    scope: req.enum(
      ['all', 'department', 'unit', 'own'],
      'ขอบเขตข้อมูล: ทั้งหมด / กลุ่มสาระ / กลุ่มงาน / ของตนเอง',
    ),
  },
  { uniqueKeys: [['role_id', 'resource', 'action']], phase: 0 },
);

export const Teachers = defineTable(
  'master',
  'Teachers',
  'ทะเบียนครูและบุคลากรทางการศึกษา (ข้อมูลหลักของบุคคล แยกจากบัญชีผู้ใช้)',
  {
    ...base,
    teacher_code: col.string('รหัสบุคลากร (ข้อความ รักษาศูนย์นำหน้า)', { pii: 'personal' }),
    title: col.string('คำนำหน้าชื่อ', { pii: 'personal' }),
    first_name: req.string('ชื่อ', { pii: 'personal' }),
    last_name: req.string('นามสกุล', { pii: 'personal' }),
    position: col.string('ตำแหน่ง/วิทยฐานะ'),
    personnel_type: req.enum(
      ['teacher', 'staff', 'executive'],
      'ประเภทบุคลากร: ครู / เจ้าหน้าที่ / ผู้บริหาร',
    ),
    department_id: col.string('กลุ่มสาระที่สังกัด', { ref: 'master.Departments' }),
    email: col.string('อีเมลสำหรับจับคู่กับบัญชีผู้ใช้', { pii: 'personal' }),
    status: req.enum(['active', 'inactive'], 'สถานะการปฏิบัติงาน'),
    ...sourceColumns,
    ...demoFlag,
    ...archivable,
  },
  { phase: 0 },
);

export const Students = defineTable(
  'master',
  'Students',
  'ทะเบียนนักเรียนเท่าที่จำเป็นต่องานสำนักงานวิชาการ — ไม่เก็บเลขประจำตัวประชาชนหรือข้อมูลอ่อนไหวอื่น',
  {
    ...base,
    student_code: req.string('รหัสประจำตัวนักเรียน (ข้อความ รักษาศูนย์นำหน้า เช่น 00123)', {
      pii: 'personal',
      example: '00123',
    }),
    title: col.string('คำนำหน้าชื่อ', { pii: 'personal' }),
    first_name: req.string('ชื่อ', { pii: 'personal' }),
    last_name: req.string('นามสกุล', { pii: 'personal' }),
    status: req.enum(
      ['active', 'inactive', 'transferred', 'graduated'],
      'สถานะนักเรียน: กำลังศึกษา / พักการเรียน / ย้ายออก / จบการศึกษา',
    ),
    ...sourceColumns,
    ...demoFlag,
    ...archivable,
  },
  { uniqueKeys: [['student_code']], phase: 0 },
);

export const StudentEnrollments = defineTable(
  'master',
  'StudentEnrollments',
  'การจัดนักเรียนเข้าห้องเรียนในแต่ละปีการศึกษา',
  {
    ...base,
    student_id: req.string('นักเรียน', { ref: 'master.Students' }),
    academic_year_id: req.string('ปีการศึกษา', { ref: 'master.AcademicYears' }),
    classroom_id: req.string('ห้องเรียน', { ref: 'master.Classrooms' }),
    student_no: col.int('เลขที่ในห้อง'),
    status: req.enum(['active', 'moved', 'left'], 'สถานะการอยู่ในห้องเรียน'),
    ...sourceColumns,
  },
  { uniqueKeys: [['student_id', 'academic_year_id']], phase: 0 },
);

export const Classrooms = defineTable(
  'master',
  'Classrooms',
  'ห้องเรียนในแต่ละปีการศึกษา',
  {
    ...base,
    academic_year_id: req.string('ปีการศึกษา', { ref: 'master.AcademicYears' }),
    level: req.int('ระดับชั้นมัธยมศึกษาปีที่ (1–6)'),
    room: req.int('ลำดับห้อง'),
    name: req.string('ชื่อห้องเรียนที่แสดง', { example: 'ม.4/1' }),
    program: col.string('แผนการเรียน'),
    advisor_teacher_ids: col.json<string[]>('รหัสครูที่ปรึกษา (อ้างอิง master.Teachers)'),
    status: req.enum(['active', 'inactive'], 'สถานะห้องเรียน'),
    ...sourceColumns,
  },
  { uniqueKeys: [['academic_year_id', 'level', 'room']], phase: 0 },
);

export const Departments = defineTable(
  'master',
  'Departments',
  'กลุ่มสาระการเรียนรู้ 8 กลุ่ม และหน่วยงานอื่นที่ใช้เป็นขอบเขตสิทธิ์',
  {
    ...base,
    code: req.string('รหัสกลุ่มสาระ', { example: 'SCI' }),
    name_th: req.string('ชื่อกลุ่มสาระการเรียนรู้'),
    department_type: req.enum(
      ['learning_area', 'support'],
      'learning_area = กลุ่มสาระการเรียนรู้, support = หน่วยงานสนับสนุน',
    ),
    sort_order: req.int('ลำดับการแสดงผล'),
    status: req.enum(['active', 'inactive'], 'สถานะ'),
  },
  { uniqueKeys: [['code']], phase: 0 },
);

export const AcademicUnits = defineTable(
  'master',
  'AcademicUnits',
  'กลุ่มงานภายในกลุ่มบริหารวิชาการ (เช่น งานวัดและประเมินผล งานทะเบียน) ตามโครงสร้างจริงของโรงเรียน',
  {
    ...base,
    code: req.string('รหัสกลุ่มงาน'),
    name_th: req.string('ชื่อกลุ่มงาน'),
    description: col.string('ขอบเขตงาน'),
    sort_order: req.int('ลำดับการแสดงผล'),
    status: req.enum(['active', 'inactive'], 'สถานะ'),
    ...demoFlag,
  },
  { uniqueKeys: [['code']], phase: 0 },
);

export const AcademicYears = defineTable(
  'master',
  'AcademicYears',
  'ปีการศึกษา (id รูปแบบ AY + ปี พ.ศ. เช่น AY2569)',
  {
    ...base,
    year_be: req.int('ปีการศึกษา พ.ศ.', { example: '2569' }),
    start_date: req.date('วันเริ่มปีการศึกษา'),
    end_date: req.date('วันสิ้นสุดปีการศึกษา'),
    is_current: req.boolean('เป็นปีการศึกษาปัจจุบันหรือไม่ (มีได้ปีเดียว)'),
    status: req.enum(['planned', 'active', 'closed'], 'สถานะปีการศึกษา'),
  },
  { uniqueKeys: [['year_be']], phase: 0 },
);

export const Semesters = defineTable(
  'master',
  'Semesters',
  'ภาคเรียน (id รูปแบบ AY2569-S2)',
  {
    ...base,
    academic_year_id: req.string('ปีการศึกษา', { ref: 'master.AcademicYears' }),
    term: req.int('ภาคเรียนที่ (1, 2 หรือ 3 สำหรับภาคฤดูร้อน)'),
    name: req.string('ชื่อที่แสดง', { example: 'ภาคเรียนที่ 2' }),
    start_date: req.date('วันเปิดภาคเรียน'),
    end_date: req.date('วันปิดภาคเรียน'),
    is_current: req.boolean('เป็นภาคเรียนปัจจุบันหรือไม่ (มีได้ภาคเดียว)'),
  },
  { uniqueKeys: [['academic_year_id', 'term']], phase: 0 },
);

export const Courses = defineTable(
  'master',
  'Courses',
  'รายวิชาที่เปิดสอน',
  {
    ...base,
    course_code: req.string('รหัสวิชา', { example: 'ว31101' }),
    name_th: req.string('ชื่อรายวิชา'),
    department_id: col.string('กลุ่มสาระเจ้าของรายวิชา', { ref: 'master.Departments' }),
    level: col.int('ระดับชั้น (1–6)'),
    credits: col.number('หน่วยกิต'),
    status: req.enum(['active', 'inactive'], 'สถานะ'),
    ...sourceColumns,
    ...demoFlag,
  },
  { phase: 3 },
);

export const TeachingAssignments = defineTable(
  'master',
  'TeachingAssignments',
  'ครูผู้สอนของรายวิชาในแต่ละห้องเรียนและภาคเรียน',
  {
    ...base,
    academic_year_id: req.string('ปีการศึกษา', { ref: 'master.AcademicYears' }),
    semester_id: req.string('ภาคเรียน', { ref: 'master.Semesters' }),
    course_id: req.string('รายวิชา', { ref: 'master.Courses' }),
    classroom_id: req.string('ห้องเรียน', { ref: 'master.Classrooms' }),
    teacher_id: req.string('ครูผู้สอน', { ref: 'master.Teachers' }),
    ...sourceColumns,
  },
  { phase: 3 },
);

export const TimetablePeriods = defineTable(
  'master',
  'TimetablePeriods',
  'คาบเรียนและช่วงเวลาของวัน',
  {
    ...base,
    period_no: req.int('คาบที่'),
    name: req.string('ชื่อคาบ', { example: 'คาบ 1' }),
    start_time: req.string('เวลาเริ่ม (HH:mm)', { example: '08:30' }),
    end_time: req.string('เวลาสิ้นสุด (HH:mm)', { example: '09:20' }),
    day_part: req.enum(['am', 'pm'], 'ช่วงของวัน ใช้กับการขอเวลาเรียนครึ่งวัน'),
    is_teaching: req.boolean('เป็นคาบเรียน (false = พักกลางวัน/กิจกรรมหน้าเสาธง)'),
  },
  { uniqueKeys: [['period_no']], phase: 3 },
);

export const TimetableEntries = defineTable(
  'master',
  'TimetableEntries',
  'ตารางเรียน/ตารางสอน: ห้องเรียน × วัน × คาบ → รายวิชาและครูผู้สอน ใช้คำนวณผลกระทบของการขอเวลาเรียน',
  {
    ...base,
    academic_year_id: req.string('ปีการศึกษา', { ref: 'master.AcademicYears' }),
    semester_id: req.string('ภาคเรียน', { ref: 'master.Semesters' }),
    classroom_id: req.string('ห้องเรียน', { ref: 'master.Classrooms' }),
    day_of_week: req.int('วันในสัปดาห์ (1 = จันทร์ … 5 = ศุกร์)'),
    period_no: req.int('คาบที่'),
    course_id: req.string('รายวิชา', { ref: 'master.Courses' }),
    teacher_id: col.string('ครูผู้สอน', { ref: 'master.Teachers' }),
    location: col.string('ห้อง/สถานที่เรียน'),
    ...sourceColumns,
  },
  { uniqueKeys: [['semester_id', 'classroom_id', 'day_of_week', 'period_no']], phase: 3 },
);

export const masterDatabase: DatabaseDef = {
  key: 'master',
  title: 'TUNS_MASTER_DATABASE',
  displayName: 'Master Database',
  envVar: 'GOOGLE_MASTER_SPREADSHEET_ID',
  description:
    'ข้อมูลหลักของระบบ: ผู้ใช้ บทบาท สิทธิ์ บุคลากร นักเรียน ห้องเรียน ปีการศึกษา รายวิชา และตารางเรียน',
  directAccess: 'ผู้ดูแลระบบเท่านั้น (มีข้อมูลส่วนบุคคลของนักเรียนและบุคลากร)',
  tables: [
    Users,
    Roles,
    Permissions,
    UserRoles,
    RolePermissions,
    Teachers,
    Students,
    StudentEnrollments,
    Classrooms,
    Departments,
    AcademicUnits,
    AcademicYears,
    Semesters,
    Courses,
    TeachingAssignments,
    TimetablePeriods,
    TimetableEntries,
  ],
};
