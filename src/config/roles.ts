/**
 * บทบาทผู้ใช้งาน 9 กลุ่ม (ข้อ 10 ของ Master Prompt)
 * บุคลากรหนึ่งคนมีได้หลายบทบาท (ตาราง UserRoles) และบทบาทบางประเภทผูกกับกลุ่มสาระหรือกลุ่มงาน
 */
export const ROLE_IDS = [
  'super_admin',
  'director',
  'deputy_director',
  'academic_head',
  'office_staff',
  'department_head',
  'unit_head',
  'teacher',
  'auditor',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleDef {
  id: RoleId;
  order: number;
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  /** ขอบเขตที่บทบาทนี้ต้องระบุเมื่อมอบหมาย: กลุ่มสาระ / กลุ่มงาน / ไม่ต้องระบุ */
  assignmentScope: 'global' | 'department' | 'unit';
}

export const ROLES: readonly RoleDef[] = [
  {
    id: 'super_admin',
    order: 1,
    nameTh: 'ผู้ดูแลระบบสูงสุด',
    nameEn: 'Super Admin',
    descriptionTh:
      'ตั้งค่าระบบ จัดการบัญชี บทบาท และสิทธิ์ ตั้งค่า Google Workspace ตรวจสอบ System Health สำรอง/กู้คืนข้อมูล และตรวจ Audit Log ไม่มีสิทธิ์อนุมัติเอกสารราชการโดยอัตโนมัติ',
    assignmentScope: 'global',
  },
  {
    id: 'director',
    order: 2,
    nameTh: 'ผู้อำนวยการโรงเรียน',
    nameEn: 'School Director',
    descriptionTh: 'ดูข้อมูลภาพรวมและรายงาน พิจารณาอนุมัติเอกสารตามอำนาจหน้าที่',
    assignmentScope: 'global',
  },
  {
    id: 'deputy_director',
    order: 3,
    nameTh: 'รองผู้อำนวยการกลุ่มบริหารวิชาการ',
    nameEn: 'Academic Deputy Director',
    descriptionTh: 'กำกับดูแลงานวิชาการ ตรวจสอบและอนุมัติเอกสาร มอบหมายงาน ดูรายงานการดำเนินงาน',
    assignmentScope: 'global',
  },
  {
    id: 'academic_head',
    order: 4,
    nameTh: 'หัวหน้ากลุ่มบริหารวิชาการ',
    nameEn: 'Head of Academic Affairs',
    descriptionTh: 'กำกับติดตามงานสำนักงาน ตรวจสอบเอกสาร ประสานงานกลุ่มสาระ ติดตามงานค้าง',
    assignmentScope: 'global',
  },
  {
    id: 'office_staff',
    order: 5,
    nameTh: 'เจ้าหน้าที่สำนักงานวิชาการ',
    nameEn: 'Academic Office Staff',
    descriptionTh:
      'จัดการหนังสือรับ–ส่ง ตรวจสอบเอกสาร จัดการแม่แบบ หนังสือขอเวลาเรียน การประชุม เปิดรับส่งงาน และลิงก์บริการวิชาการ',
    assignmentScope: 'global',
  },
  {
    id: 'department_head',
    order: 6,
    nameTh: 'หัวหน้ากลุ่มสาระการเรียนรู้',
    nameEn: 'Head of Department',
    descriptionTh:
      'ตรวจสอบเอกสารภายในกลุ่มสาระ ติดตามการส่งงานของครู รับทราบหนังสือ มอบหมายงานภายในกลุ่มสาระ',
    assignmentScope: 'department',
  },
  {
    id: 'unit_head',
    order: 7,
    nameTh: 'หัวหน้างาน',
    nameEn: 'Head of Academic Unit',
    descriptionTh: 'จัดการงานเฉพาะส่วนที่รับผิดชอบ มอบหมายงาน ตรวจสอบเอกสารและรายงานภายในขอบเขตงาน',
    assignmentScope: 'unit',
  },
  {
    id: 'teacher',
    order: 8,
    nameTh: 'ครู',
    nameEn: 'Teacher',
    descriptionTh:
      'ใช้ Academic Service Hub สร้างบันทึกข้อความและหนังสือขอเวลาเรียน เสนออนุมัติ ส่งงาน รับทราบหนังสือ ดูปฏิทินและคลังเอกสาร',
    assignmentScope: 'global',
  },
  {
    id: 'auditor',
    order: 9,
    nameTh: 'ผู้ตรวจสอบ (อ่านอย่างเดียว)',
    nameEn: 'Read-only Auditor',
    descriptionTh: 'ตรวจสอบข้อมูลและดูรายงานเฉพาะที่ได้รับอนุญาต ไม่มีสิทธิ์แก้ไขหรืออนุมัติ',
    assignmentScope: 'global',
  },
];

const ROLE_BY_ID = new Map(ROLES.map((role) => [role.id, role]));

export function getRole(id: RoleId): RoleDef {
  const role = ROLE_BY_ID.get(id);
  if (!role) throw new Error(`Unknown role: ${id}`);
  return role;
}

export function isRoleId(value: string): value is RoleId {
  return ROLE_BY_ID.has(value as RoleId);
}
