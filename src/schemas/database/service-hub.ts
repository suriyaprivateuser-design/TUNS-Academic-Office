/**
 * TUNS_SERVICE_HUB_DATABASE — ศูนย์รวมระบบและบริการวิชาการ (Module 09)
 */
import { archivable, base, logBase } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

export const ServiceCategories = defineTable(
  'serviceHub',
  'ServiceCategories',
  'หมวดหมู่ของระบบและบริการใน Academic Service Hub',
  {
    ...base,
    code: req.string('รหัสหมวดหมู่ (ไม่ซ้ำ)', { example: 'academic' }),
    name_th: req.string('ชื่อหมวดหมู่ภาษาไทย'),
    name_en: col.string('ชื่อหมวดหมู่ภาษาอังกฤษ'),
    description: col.string('คำอธิบายหมวดหมู่'),
    sort_order: req.int('ลำดับการแสดงผล (น้อยไปมาก)'),
    is_visible: req.boolean('แสดงหมวดหมู่นี้ในหน้า Service Hub หรือไม่'),
    ...archivable,
  },
  { uniqueKeys: [['code']], phase: 1 },
);

export const AcademicServices = defineTable(
  'serviceHub',
  'AcademicServices',
  'ระบบงาน เว็บไซต์ และลิงก์บริการทั้งหมดของกลุ่มบริหารวิชาการ ผู้ดูแลจัดการได้โดยไม่แก้โค้ด',
  {
    ...base,
    category_id: req.string('หมวดหมู่ของบริการ', { ref: 'serviceHub.ServiceCategories' }),
    name_th: req.string('ชื่อระบบภาษาไทย'),
    name_en: col.string('ชื่อระบบภาษาอังกฤษ (เมื่อจำเป็น)'),
    description: col.string('คำอธิบายสั้น'),
    owner_unit: col.string('หน่วยงาน/ผู้รับผิดชอบระบบ'),
    link_type: req.enum(
      ['external', 'internal'],
      'external = ลิงก์ไปเว็บไซต์ภายนอก, internal = หน้าภายใน TUNS Academic Office',
    ),
    url: col.string(
      'URL ปลายทาง (เฉพาะ https/http ที่ผ่านการตรวจ) ว่าง = “ยังไม่ได้ตั้งค่าลิงก์” ห้ามสร้าง URL ขึ้นเอง',
    ),
    internal_path: col.string('เส้นทางภายในระบบ เมื่อ link_type = internal', {
      example: '/class-leave',
    }),
    icon: req.string('คีย์ไอคอนจาก Icon Mapping กลาง (src/config/icons.ts)', {
      example: 'assessment',
    }),
    color: req.enum(
      ['terracotta', 'rose', 'burgundy', 'brown', 'sand'],
      'โทนสีของการ์ด เลือกจาก Design Token เท่านั้น',
    ),
    logo_file_id: col.string('โลโก้จริงของระบบ (ถ้ามี) อ้างอิง File Registry', {
      ref: 'system.FileRegistry',
    }),
    status: req.enum(
      ['active', 'maintenance', 'offline'],
      'สถานะการให้บริการ: เปิดให้บริการ / ปิดปรับปรุง / ปิดให้บริการ',
    ),
    is_visible: req.boolean('แสดงบริการนี้ต่อผู้ใช้หรือไม่'),
    is_pinned: req.boolean('ปักหมุดเป็นระบบสำคัญ (แสดงก่อนและอยู่ใน App Launcher)'),
    audience: req.enum(
      ['all', 'restricted'],
      'all = บุคลากรทุกคน, restricted = เฉพาะบทบาทใน ServiceRoleAccess',
    ),
    sort_order: req.int('ลำดับการแสดงผลภายในหมวดหมู่'),
    last_check_result: col.enum(
      ['ok', 'auth_required', 'blocked', 'broken', 'unreachable', 'unsafe'],
      'ผลตรวจลิงก์ล่าสุด (แยกลิงก์เสียออกจากระบบที่ต้อง Login หรือปฏิเสธการตรวจอัตโนมัติ)',
    ),
    last_checked_at: col.datetime('วันเวลาที่ตรวจลิงก์ล่าสุด'),
    ...archivable,
  },
  { phase: 1 },
);

export const ServiceRoleAccess = defineTable(
  'serviceHub',
  'ServiceRoleAccess',
  'บทบาทที่เข้าถึงบริการแบบ restricted ได้',
  {
    ...base,
    service_id: req.string('บริการ', { ref: 'serviceHub.AcademicServices' }),
    role_id: req.string('บทบาทที่ได้รับอนุญาต', { ref: 'master.Roles' }),
    is_active: req.boolean('true = บทบาทนี้ยังมีสิทธิ์ (ถอนสิทธิ์แล้วเป็น false ไม่ลบแถว)'),
  },
  { uniqueKeys: [['service_id', 'role_id']], phase: 1 },
);

export const ServiceFavorites = defineTable(
  'serviceHub',
  'ServiceFavorites',
  'รายการโปรดของผู้ใช้แต่ละคน',
  {
    ...base,
    user_id: req.string('ผู้ใช้', { ref: 'master.Users' }),
    service_id: req.string('บริการ', { ref: 'serviceHub.AcademicServices' }),
    is_active: req.boolean('true = ยังเป็นรายการโปรด (ยกเลิกแล้วเป็น false ไม่ลบแถว)'),
  },
  { uniqueKeys: [['user_id', 'service_id']], phase: 1 },
);

export const ServiceAccessLogs = defineTable(
  'serviceHub',
  'ServiceAccessLogs',
  'บันทึกการเปิดลิงก์บริการ ใช้ทำ Recently/Frequently Used และสถิติ — นับ “ครั้งที่เปิดลิงก์” ไม่ใช่จำนวนผู้ใช้ของเว็บไซต์ปลายทาง',
  {
    ...logBase,
    service_id: req.string('บริการที่ถูกเปิด', { ref: 'serviceHub.AcademicServices' }),
    user_id: req.string('ผู้ใช้ที่เปิด', { ref: 'master.Users' }),
    source: req.enum(
      ['hub', 'workspace', 'launcher', 'search'],
      'ตำแหน่งในระบบที่ผู้ใช้กดเปิดลิงก์',
    ),
  },
  { appendOnly: true, phase: 1 },
);

export const ServiceHealthChecks = defineTable(
  'serviceHub',
  'ServiceHealthChecks',
  'ประวัติการตรวจสถานะลิงก์จากฝั่ง Server (มีการป้องกัน SSRF)',
  {
    ...logBase,
    service_id: req.string('บริการที่ตรวจ', { ref: 'serviceHub.AcademicServices' }),
    result: req.enum(
      ['ok', 'auth_required', 'blocked', 'broken', 'unreachable', 'unsafe'],
      'ผลการตรวจ',
    ),
    http_status: col.int('HTTP status ที่ได้รับ (ถ้ามี)'),
    response_ms: col.int('เวลาตอบสนอง (มิลลิวินาที)'),
    message: col.string('รายละเอียดเพิ่มเติม'),
    checked_by: col.string('ผู้สั่งตรวจ (ว่าง = งานอัตโนมัติ)', { ref: 'master.Users' }),
  },
  { appendOnly: true, phase: 1 },
);

export const serviceHubDatabase: DatabaseDef = {
  key: 'serviceHub',
  title: 'TUNS_SERVICE_HUB_DATABASE',
  displayName: 'Service Hub Database',
  envVar: 'GOOGLE_SERVICE_HUB_SPREADSHEET_ID',
  description: 'ลิงก์และบริการของ Academic Service Hub รายการโปรด และสถิติการเปิดลิงก์',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    ServiceCategories,
    AcademicServices,
    ServiceRoleAccess,
    ServiceFavorites,
    ServiceAccessLogs,
    ServiceHealthChecks,
  ],
};
