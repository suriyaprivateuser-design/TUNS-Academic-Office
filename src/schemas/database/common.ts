/**
 * ชุดคอลัมน์มาตรฐานที่ใช้ซ้ำในหลายตาราง (ข้อ 25 Data Structure Standard)
 */
import { col, req } from './types';

/** คอลัมน์พื้นฐานของทุกตารางที่แก้ไขได้ — `id` ต้องอยู่ลำดับแรกเสมอ */
export const base = {
  id: req.string('รหัสถาวรของรายการ (UUID หรือรหัสถาวร) เป็น Primary Key ห้ามใช้เลขแถว'),
  version: req.int(
    'เลขเวอร์ชันของแถว เริ่มที่ 1 และเพิ่มทุกครั้งที่แก้ไข ใช้ตรวจการแก้ไขชนกัน (optimistic locking)',
  ),
  created_at: req.datetime('วันเวลาที่สร้างรายการ (ISO 8601, UTC)'),
  created_by: col.string('รหัสผู้ใช้ที่สร้างรายการ', { ref: 'master.Users' }),
  updated_at: col.datetime('วันเวลาที่แก้ไขล่าสุด (ISO 8601, UTC)'),
  updated_by: col.string('รหัสผู้ใช้ที่แก้ไขล่าสุด', { ref: 'master.Users' }),
} as const;

/** คอลัมน์พื้นฐานของตารางแบบเพิ่มอย่างเดียว (log) */
export const logBase = {
  id: req.string('รหัสถาวรของรายการ (UUID)'),
  created_at: req.datetime('วันเวลาที่บันทึก (ISO 8601, UTC)'),
} as const;

/** การจัดเก็บถาวร — ระบบไม่ลบข้อมูลจริง */
export const archivable = {
  archived_at: col.datetime('วันเวลาที่จัดเก็บถาวร (ว่าง = ยังใช้งาน)'),
  archived_by: col.string('รหัสผู้ใช้ที่จัดเก็บถาวร', { ref: 'master.Users' }),
} as const;

/** ปีการศึกษาและภาคเรียนของรายการ */
export const term = {
  academic_year_id: req.string('รหัสปีการศึกษา เช่น AY2569', {
    ref: 'master.AcademicYears',
    example: 'AY2569',
  }),
  semester_id: col.string('รหัสภาคเรียน เช่น AY2569-S2', {
    ref: 'master.Semesters',
    example: 'AY2569-S2',
  }),
} as const;

/** ธงข้อมูลสาธิต — true เฉพาะข้อมูลที่ระบบสร้างเพื่อการพัฒนา/ทดสอบ (ห้ามมีใน Production) */
export const demoFlag = {
  is_demo: col.boolean('true = ข้อมูลสาธิต (Demo Data) ที่สร้างเพื่อพัฒนา/ทดสอบ ไม่ใช่ข้อมูลจริง'),
} as const;
