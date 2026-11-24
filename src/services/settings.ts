/**
 * การตั้งค่าระบบและปีการศึกษา/ภาคเรียนปัจจุบัน
 */
import 'server-only';
import { SYSTEM } from '@/config/school';
import type { Db, UnitOfWork } from '@/repositories/db';
import { AcademicYears, Semesters } from '@/schemas/database/master';
import { SystemSettings } from '@/schemas/database/system';

export interface AcademicTerm {
  academicYearId: string;
  /** ปีการศึกษา พ.ศ. ในรูปข้อความ เช่น "2569" */
  year: string;
  semesterId: string | null;
  /** ภาคเรียนในรูปข้อความ เช่น "2" */
  semester: string | null;
  /** "ปีการศึกษา 2569 ภาคเรียนที่ 2" */
  label: string;
}

/** ปีการศึกษาและภาคเรียนปัจจุบันจากข้อมูลจริง — คืน null เมื่อยังไม่ได้ตั้งค่า (ไม่มีการสมมติปี) */
export async function getCurrentTerm(db: Db): Promise<AcademicTerm | null> {
  const [years, semesters] = await Promise.all([
    db.repo(AcademicYears).all(),
    db.repo(Semesters).all(),
  ]);
  const year = years.find((row) => row.is_current);
  if (!year) return null;
  const semester = semesters.find((row) => row.academic_year_id === year.id && row.is_current) ?? null;
  return {
    academicYearId: year.id,
    year: String(year.year_be),
    semesterId: semester?.id ?? null,
    semester: semester ? String(semester.term) : null,
    label: semester
      ? `ปีการศึกษา ${year.year_be} ${semester.name}`
      : `ปีการศึกษา ${year.year_be}`,
  };
}

export const SETTING_KEYS = {
  initialized: 'system.initialized',
  demoData: 'system.demo_data',
  schoolName: 'school.name_th',
  schoolCrestFileId: 'school.crest_file_id',
  adminContact: 'school.admin_contact',
  cumulativePeriodWarning: 'class_leave.cumulative_period_warning',
} as const;

export async function getSetting(db: Db, key: string): Promise<string | null> {
  return (await db.repo(SystemSettings).byId(key))?.value ?? null;
}

export async function getSettings(db: Db, keys: readonly string[]): Promise<Record<string, string | null>> {
  const rows = await db.repo(SystemSettings).byIds(keys);
  const byId = new Map(rows.map((row) => [row.id, row.value]));
  return Object.fromEntries(keys.map((key) => [key, byId.get(key) ?? null]));
}

/** เพิ่มคำสั่งตั้งค่าเข้า UnitOfWork (สร้างใหม่หรือแก้ไขตามที่มีอยู่) */
export async function putSetting(
  db: Db,
  uow: UnitOfWork,
  input: {
    key: string;
    value: string;
    category: string;
    valueType?: 'string' | 'number' | 'boolean' | 'json';
    description?: string;
  },
): Promise<void> {
  const repo = db.repo(SystemSettings);
  const existing = await repo.byId(input.key);
  if (existing) {
    if (existing.value !== input.value) uow.add(repo.update(existing.id, { value: input.value }));
    return;
  }
  uow.add(
    repo.insert({
      id: input.key,
      value: input.value,
      value_type: input.valueType ?? 'string',
      category: input.category,
      description: input.description ?? null,
    }),
  );
}

export interface SchoolIdentity {
  schoolName: string;
  crestFileId: string | null;
  adminContact: string | null;
  isDemoData: boolean;
}

export async function getSchoolIdentity(db: Db): Promise<SchoolIdentity> {
  const values = await getSettings(db, [
    SETTING_KEYS.schoolName,
    SETTING_KEYS.schoolCrestFileId,
    SETTING_KEYS.adminContact,
    SETTING_KEYS.demoData,
  ]);
  return {
    schoolName: values[SETTING_KEYS.schoolName] || SYSTEM.schoolNameTh,
    crestFileId: values[SETTING_KEYS.schoolCrestFileId] || null,
    adminContact: values[SETTING_KEYS.adminContact] || null,
    isDemoData: values[SETTING_KEYS.demoData] === 'true',
  };
}
