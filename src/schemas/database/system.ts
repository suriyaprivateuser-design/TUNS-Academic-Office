/**
 * TUNS_SYSTEM_DATABASE — การตั้งค่า ทะเบียนไฟล์/โฟลเดอร์ การแจ้งเตือน Audit Log และ Operation Journal
 *
 * หมายเหตุการปรับจาก Master Prompt:
 *   - `DocumentSequences` ย้ายมาอยู่ไฟล์นี้ (เดิมอยู่ Document Database) เพื่อให้การจองเลขอ้างอิงและ
 *     การบันทึก Operation Journal เกิดในคำสั่งเขียนเดียวกันแบบ atomic (ดู docs/DATABASE.md)
 *   - เพิ่ม `AuditChain` สำหรับตรวจการแก้ไข Audit Log ย้อนหลัง
 */
import { archivable, base, logBase } from './common';
import { col, defineTable, req, type DatabaseDef } from './types';

export const SystemSettings = defineTable(
  'system',
  'SystemSettings',
  'การตั้งค่าระบบแบบ key–value (id = ชื่อคีย์) ห้ามเก็บ credentials หรือความลับใด ๆ ในตารางนี้',
  {
    ...base,
    value: col.string('ค่าของการตั้งค่า (ข้อความ หรือ JSON ตาม value_type)'),
    value_type: req.enum(['string', 'number', 'boolean', 'json'], 'ชนิดของค่า'),
    category: req.string('หมวดของการตั้งค่า', { example: 'school' }),
    description: col.string('คำอธิบาย'),
  },
  { phase: 0 },
);

export const IntegrationSettings = defineTable(
  'system',
  'IntegrationSettings',
  'การตั้งค่าการเชื่อมต่อระบบภายนอก (TUNS-SIS, TUNS-Achievements, Google Calendar ฯลฯ) — เก็บเฉพาะค่าที่ไม่เป็นความลับ',
  {
    ...base,
    integration: req.enum(
      ['tuns_sis', 'tuns_achievements', 'google_calendar', 'gmail', 'line'],
      'ระบบที่เชื่อมต่อ',
    ),
    mode: req.enum(
      ['disabled', 'import_export', 'api'],
      'รูปแบบการเชื่อมต่อ: ปิด / นำเข้า–ส่งออกไฟล์ / API ที่ได้รับอนุญาต',
    ),
    config: col.json<Record<string, string>>('ค่าตั้งค่าที่ไม่เป็นความลับ'),
    last_verified_at: col.datetime('วันเวลาที่ทดสอบการเชื่อมต่อจริงสำเร็จล่าสุด (ว่าง = ยังไม่เคยตรวจ)'),
    last_status: col.enum(['ok', 'error'], 'ผลการทดสอบล่าสุด'),
    last_message: col.string('ข้อความจากการทดสอบล่าสุด'),
  },
  { uniqueKeys: [['integration']], phase: 7 },
);

export const IntegrationSyncLogs = defineTable(
  'system',
  'IntegrationSyncLogs',
  'ประวัติการนำเข้า/ซิงก์ข้อมูลจากระบบภายนอก',
  {
    ...logBase,
    integration: req.string('ระบบที่เชื่อมต่อ'),
    direction: req.enum(['import', 'export'], 'ทิศทางข้อมูล'),
    entity: req.string('ประเภทข้อมูล', { example: 'students' }),
    status: req.enum(['success', 'partial', 'failed'], 'ผลการทำงาน'),
    records_total: req.int('จำนวนรายการทั้งหมด'),
    records_ok: req.int('จำนวนที่สำเร็จ'),
    records_failed: req.int('จำนวนที่ไม่สำเร็จ'),
    message: col.string('สรุปผลหรือข้อผิดพลาด (ไม่มีข้อมูลส่วนบุคคล)'),
    actor_id: col.string('ผู้สั่งทำงาน', { ref: 'master.Users' }),
  },
  { appendOnly: true, phase: 0 },
);

export const FileRegistry = defineTable(
  'system',
  'FileRegistry',
  'ทะเบียนไฟล์ทั้งหมดของระบบ — ไฟล์จริงอยู่ใน Google Drive ตารางนี้เก็บ metadata และใช้ตรวจสิทธิ์ก่อน preview/download ทุกครั้ง',
  {
    ...base,
    drive_file_id: col.string('Drive File ID ของไฟล์จริง (ว่างระหว่างรออัปโหลด)'),
    drive_folder_id: col.string('Drive Folder ID ของโฟลเดอร์ปลายทาง'),
    folder_id: col.string('โฟลเดอร์ใน Folder Registry', { ref: 'system.FolderRegistry' }),
    document_id: req.string(
      'รหัสเอกสารเชิงตรรกะ — ไฟล์ทุกเวอร์ชันของเอกสารเดียวกันใช้ document_id เดียวกัน (One Document, One Source)',
    ),
    record_id: col.string('รหัส record ของ Module ที่ไฟล์นี้สังกัด (เช่น รหัสคำร้องขอเวลาเรียน)'),
    module_code: req.string('รหัส Module ตามมาตรฐานชื่อไฟล์', { example: 'CL' }),
    document_type: req.string('ประเภทเอกสารภายใน Module', { example: 'attachment' }),
    academic_year: col.string('ปีการศึกษา พ.ศ.', { example: '2569' }),
    semester: col.string('ภาคเรียน', { example: '2' }),
    department_id: col.string('กลุ่มสาระที่เกี่ยวข้อง', { ref: 'master.Departments' }),
    unit_id: col.string('กลุ่มงานที่เกี่ยวข้อง', { ref: 'master.AcademicUnits' }),
    reference_id: col.string('เลขอ้างอิงภายในที่ใช้ในชื่อไฟล์', { example: '0001' }),
    title: col.string('ชื่อเอกสารที่แสดงต่อผู้ใช้'),
    original_filename: req.string('ชื่อไฟล์เดิมที่ผู้ใช้อัปโหลด (เก็บไว้เพื่อการค้นหา)', {
      pii: 'personal',
    }),
    stored_filename: req.string('ชื่อไฟล์มาตรฐานที่ระบบตั้งให้', {
      example: 'TUNS-CL-2569-0001-v01.pdf',
    }),
    mime_type: req.string('ชนิดไฟล์ที่ตรวจจากเนื้อไฟล์จริง'),
    file_size: req.int('ขนาดไฟล์ (ไบต์)'),
    checksum: col.string('SHA-256 ของเนื้อไฟล์ ใช้ตรวจไฟล์ซ้ำและยืนยันการอัปโหลด'),
    file_version: req.int('เวอร์ชันของไฟล์ภายในเอกสารเดียวกัน (v01 = 1)'),
    is_current: req.boolean('true = เป็นเวอร์ชันล่าสุดของเอกสาร'),
    is_locked: req.boolean(
      'true = ไฟล์ของเอกสารที่อนุมัติแล้ว ห้ามเขียนทับ การแก้ไขต้องสร้างเวอร์ชันใหม่',
    ),
    status: req.enum(
      ['active', 'superseded', 'archived', 'void'],
      'สถานะของรายการไฟล์: ใช้งาน / ถูกแทนด้วยเวอร์ชันใหม่ / จัดเก็บถาวร / โมฆะ (อัปโหลดไม่สำเร็จ)',
    ),
    upload_status: req.enum(
      ['pending', 'verified', 'pending_reconciliation', 'failed'],
      'สถานะการอัปโหลด: รอไฟล์ / ตรวจแล้วว่าอยู่ใน Drive และ metadata ครบ / ไฟล์กับ metadata ไม่ตรงกันรอกู้คืน / ล้มเหลว',
    ),
    access_level: req.enum(
      ['staff', 'department', 'record', 'restricted'],
      'ระดับการเข้าถึง: บุคลากรทุกคน / เฉพาะกลุ่มสาระหรือกลุ่มงาน / ผู้เกี่ยวข้องกับ record / เจ้าของและผู้จัดการ',
    ),
    uploaded_by: req.string('ผู้อัปโหลด', { ref: 'master.Users' }),
    uploaded_at: req.datetime('วันเวลาที่เริ่มอัปโหลด'),
    verified_at: col.datetime('วันเวลาที่ยืนยันว่าไฟล์อยู่ใน Drive ครบถ้วน'),
    ...archivable,
  },
  { phase: 0 },
);

export const FolderRegistry = defineTable(
  'system',
  'FolderRegistry',
  'ทะเบียนโฟลเดอร์ Google Drive ที่ระบบสร้าง — อ้างอิงโฟลเดอร์ด้วย Drive Folder ID เสมอ ไม่ค้นหาจากชื่อ',
  {
    ...base,
    folder_key: req.string(
      'คีย์เชิงตรรกะของโฟลเดอร์ (ไม่ซ้ำ) ใช้กันการสร้างซ้ำและทำให้การสร้างเป็น idempotent',
      { example: 'ay:2569/sem:2/mod:CL/ref:CL-2569-0001/sub:02' },
    ),
    drive_folder_id: col.string('Drive Folder ID (ว่างขณะอยู่ระหว่างสร้าง)'),
    parent_folder_id: col.string('โฟลเดอร์แม่ใน Folder Registry', {
      ref: 'system.FolderRegistry',
    }),
    folder_name: req.string('ชื่อโฟลเดอร์ที่แสดงใน Drive'),
    folder_type: req.enum(
      [
        'root',
        'system',
        'academic_year',
        'semester',
        'module',
        'category',
        'department',
        'record',
        'sub',
      ],
      'ประเภทของโฟลเดอร์ในโครงสร้าง',
    ),
    academic_year: col.string('ปีการศึกษา พ.ศ.'),
    semester: col.string('ภาคเรียน'),
    module_code: col.string('รหัส Module'),
    department_id: col.string('กลุ่มสาระ', { ref: 'master.Departments' }),
    reference_id: col.string('รหัสอ้างอิงของ record เจ้าของโฟลเดอร์'),
    access_scope: req.enum(
      ['staff', 'module', 'record', 'system'],
      'ขอบเขตการมองเห็นโฟลเดอร์ใน Document Explorer: บุคลากรทุกคน / ผู้มีสิทธิ์ทั้ง Module / ผู้เกี่ยวข้องกับ record / เฉพาะผู้ดูแลระบบ',
    ),
    owner_user_id: col.string('เจ้าของ record (สำหรับ access_scope = record)', {
      ref: 'master.Users',
    }),
    last_verified_at: col.datetime('วันเวลาที่ตรวจกับ Google Drive ล่าสุดว่าโฟลเดอร์ยังอยู่'),
    status: req.enum(
      ['creating', 'active', 'missing', 'archived'],
      'creating = จองไว้กำลังสร้าง, active = ใช้งาน, missing = ไม่พบใน Drive, archived = เก็บถาวร',
    ),
  },
  { uniqueKeys: [['folder_key']], phase: 0 },
);

export const Notifications = defineTable(
  'system',
  'Notifications',
  'การแจ้งเตือนในระบบของผู้ใช้แต่ละคน',
  {
    ...base,
    user_id: req.string('ผู้รับการแจ้งเตือน', { ref: 'master.Users' }),
    type: req.string('ประเภทการแจ้งเตือน', { example: 'approval_pending' }),
    title: req.string('หัวข้อ'),
    body: col.string('รายละเอียดสั้น (ไม่ใส่รายชื่อนักเรียน)'),
    link_path: col.string('เส้นทางภายในระบบสำหรับ Deep Link', { example: '/documents/approvals/…' }),
    entity_type: col.string('ประเภท record ที่เกี่ยวข้อง'),
    entity_id: col.string('รหัส record ที่เกี่ยวข้อง'),
    dedupe_key: col.string(
      'คีย์กันการแจ้งเตือนซ้ำ — (user_id, dedupe_key) ต้องไม่ซ้ำเมื่อมีค่า',
    ),
    is_read: req.boolean('อ่านแล้วหรือยัง'),
    read_at: col.datetime('วันเวลาที่อ่าน'),
  },
  { uniqueKeys: [['user_id', 'dedupe_key']], phase: 1 },
);

export const NotificationPreferences = defineTable(
  'system',
  'NotificationPreferences',
  'การตั้งค่าการรับแจ้งเตือนของผู้ใช้ แยกตามประเภท',
  {
    ...base,
    user_id: req.string('ผู้ใช้', { ref: 'master.Users' }),
    type: req.string('ประเภทการแจ้งเตือน'),
    in_app: req.boolean('รับในระบบ'),
    email: req.boolean('รับทางอีเมล'),
  },
  { uniqueKeys: [['user_id', 'type']], phase: 1 },
);

export const NotificationDeliveries = defineTable(
  'system',
  'NotificationDeliveries',
  'ประวัติการส่งแจ้งเตือนออกช่องทางภายนอก (อีเมล/LINE) — เนื้อหาที่ส่งออกต้องไม่มีข้อมูลนักเรียนโดยไม่จำเป็น',
  {
    ...logBase,
    notification_id: req.string('การแจ้งเตือน', { ref: 'system.Notifications' }),
    channel: req.enum(['email', 'line'], 'ช่องทาง'),
    status: req.enum(['sent', 'failed', 'skipped'], 'ผลการส่ง'),
    error: col.string('ข้อผิดพลาด (ถ้ามี)'),
  },
  { appendOnly: true, phase: 1 },
);

export const AuditLogs = defineTable(
  'system',
  'AuditLogs',
  'บันทึกการดำเนินงานสำคัญ (เพิ่มอย่างเดียว) แต่ละแถวผูกกับแถวก่อนหน้าด้วย hash เพื่อให้ตรวจพบการแก้ไขย้อนหลัง ห้ามบันทึก token หรือความลับ',
  {
    ...logBase,
    actor_id: col.string('ผู้ดำเนินการ (ว่าง = ระบบ)', { ref: 'master.Users' }),
    action: req.string('การกระทำ', { example: 'classLeave.submit' }),
    category: req.enum(
      [
        'auth',
        'create',
        'update',
        'submit',
        'approve',
        'reject',
        'return',
        'cancel',
        'export',
        'permission',
        'archive',
        'restore',
        'file',
        'system',
      ],
      'หมวดของการกระทำ',
    ),
    resource: col.string('Resource key ของระบบย่อย'),
    entity_type: col.string('ประเภท record'),
    entity_id: col.string('รหัส record'),
    outcome: req.enum(['success', 'denied', 'error'], 'ผลลัพธ์'),
    summary: req.string('สรุปเหตุการณ์ (ไม่มีข้อมูลลับ)'),
    metadata: col.json<Record<string, unknown>>('ข้อมูลประกอบที่ไม่เป็นความลับ'),
    prev_hash: col.string('hash ของแถวก่อนหน้า (เติมโดย Write Gateway)'),
    row_hash: col.string('SHA-256 ของแถวนี้รวม prev_hash (เติมโดย Write Gateway)'),
  },
  { appendOnly: true, phase: 0 },
);

export const AuditChain = defineTable(
  'system',
  'AuditChain',
  'หัวของสาย hash ของ Audit Log (มีแถวเดียว id = head) ใช้ยืนยันว่า Audit Log ไม่ถูกลบหรือแก้ไข',
  {
    ...base,
    last_hash: req.string('row_hash ของ Audit Log แถวล่าสุด'),
    entry_count: req.int('จำนวนแถวใน Audit Log ที่อยู่ในสาย'),
  },
  { phase: 0 },
);

export const OperationLogs = defineTable(
  'system',
  'OperationLogs',
  'Operation Journal ของ Write Gateway: ทุกคำสั่งเขียนถูกบันทึกพร้อม Idempotency Key เพื่อกันการทำซ้ำและใช้กู้คืนงานที่ค้างครึ่งทาง',
  {
    ...logBase,
    idempotency_key: req.string('คีย์กันการทำซ้ำของคำสั่ง (ไม่ซ้ำ)'),
    action: req.string('ชื่อคำสั่ง', { example: 'classLeave.submit' }),
    actor_id: col.string('ผู้สั่ง', { ref: 'master.Users' }),
    status: req.enum(
      ['pending', 'applied', 'failed'],
      'pending = เริ่มแล้วยังไม่ครบ, applied = เขียนครบทุกฐานข้อมูล, failed = ต้องตรวจสอบ',
    ),
    databases: col.json<string[]>('ฐานข้อมูลที่คำสั่งนี้ต้องเขียน'),
    applied_databases: col.json<string[]>('ฐานข้อมูลที่เขียนสำเร็จแล้ว'),
    row_refs: col.json<string[]>('รายการ table:id ที่คำสั่งนี้แตะ ใช้ตอน Reconciliation'),
    result_json: col.string('ผลลัพธ์ของคำสั่ง (JSON) ส่งคืนเมื่อมีการเรียกซ้ำด้วยคีย์เดิม'),
    error: col.string('ข้อผิดพลาด (ถ้ามี)'),
    completed_at: col.datetime('วันเวลาที่เขียนครบ'),
  },
  { appendOnly: true, phase: 0 },
);

export const DocumentSequences = defineTable(
  'system',
  'DocumentSequences',
  'ตัวนับเลขอ้างอิงภายใน (id = คีย์ของชุดเลข เช่น CL-2569) จองเลขภายใต้ lock ของ Write Gateway เท่านั้น — เป็นเลขอ้างอิงภายในระบบ ไม่ใช่เลขหนังสือราชการ',
  {
    ...base,
    current_value: req.int('เลขล่าสุดที่ถูกจองไปแล้ว'),
  },
  { phase: 0 },
);

export const FeatureFlags = defineTable(
  'system',
  'FeatureFlags',
  'สวิตช์เปิด–ปิดความสามารถของระบบ (id = ชื่อ flag)',
  {
    ...base,
    enabled: req.boolean('เปิดใช้งานหรือไม่'),
    description: col.string('คำอธิบาย'),
  },
  { phase: 7 },
);

export const BackupLogs = defineTable(
  'system',
  'BackupLogs',
  'ประวัติการสำรองข้อมูลและการทดสอบกู้คืน',
  {
    ...logBase,
    backup_type: req.enum(['daily', 'weekly', 'monthly', 'manual'], 'ประเภทการสำรอง'),
    status: req.enum(['success', 'failed', 'partial'], 'ผลการสำรอง'),
    drive_folder_id: col.string('Drive Folder ID ของชุดสำรอง'),
    manifest_file_id: col.string('Drive File ID ของ manifest'),
    databases: col.json<string[]>('ฐานข้อมูลที่อยู่ในชุดสำรอง'),
    file_count: col.int('จำนวนไฟล์ในชุดสำรอง'),
    verification_status: col.enum(
      ['not_verified', 'verified', 'mismatch'],
      'ผลการตรวจสอบชุดสำรอง',
    ),
    verified_at: col.datetime('วันเวลาที่ตรวจสอบชุดสำรอง'),
    finished_at: col.datetime('วันเวลาที่ทำเสร็จ'),
    message: col.string('รายละเอียด'),
    actor_id: col.string('ผู้สั่ง (ว่าง = งานอัตโนมัติ)', { ref: 'master.Users' }),
  },
  { appendOnly: true, phase: 7 },
);

export const SchemaVersions = defineTable(
  'system',
  'SchemaVersions',
  'ประวัติการปรับโครงสร้าง Worksheet ของแต่ละฐานข้อมูล',
  {
    ...logBase,
    database_key: req.string('ฐานข้อมูล', { example: 'classLeave' }),
    schema_version: req.int('เลขเวอร์ชัน schema'),
    changes: col.string('สรุปการเปลี่ยนแปลง (Worksheet/คอลัมน์ที่เพิ่ม)'),
    actor_id: col.string('ผู้ดำเนินการ', { ref: 'master.Users' }),
  },
  { appendOnly: true, phase: 0 },
);

export const systemDatabase: DatabaseDef = {
  key: 'system',
  title: 'TUNS_SYSTEM_DATABASE',
  displayName: 'System Database',
  envVar: 'GOOGLE_SYSTEM_SPREADSHEET_ID',
  description:
    'การตั้งค่าระบบ ทะเบียนไฟล์และโฟลเดอร์ การแจ้งเตือน Audit Log, Operation Journal, เลขอ้างอิง และประวัติการสำรองข้อมูล',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    SystemSettings,
    IntegrationSettings,
    IntegrationSyncLogs,
    FileRegistry,
    FolderRegistry,
    Notifications,
    NotificationPreferences,
    NotificationDeliveries,
    AuditLogs,
    AuditChain,
    OperationLogs,
    DocumentSequences,
    FeatureFlags,
    BackupLogs,
    SchemaVersions,
  ],
};
