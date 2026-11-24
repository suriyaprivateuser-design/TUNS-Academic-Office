/**
 * Schema ของฟอร์มขอเวลาเรียน — ใช้ร่วมกันทั้งฝั่ง Client (React Hook Form) และ Server (ตรวจซ้ำทุกครั้ง)
 */
import { z } from 'zod';
import { CLASS_LEAVE_ACTIVITY_TYPE_IDS } from '@/config/reference';

export const MAX_STUDENTS_PER_REQUEST = 800;
export const MAX_DAYS_PER_REQUEST = 31;

const text = (max: number) => z.string().trim().max(max, `ยาวเกิน ${max} ตัวอักษร`);

export const classLeaveDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง'),
  mode: z.enum(['periods', 'half_day_am', 'half_day_pm', 'full_day']),
  periodNos: z.array(z.number().int().min(1).max(20)).max(20),
  note: text(200).optional(),
});

export const classLeaveDraftSchema = z.object({
  activityName: text(200),
  activityType: z.enum(CLASS_LEAVE_ACTIVITY_TYPE_IDS),
  objective: text(1000),
  rationale: text(1000),
  location: text(200),
  departmentId: z.string().max(64).nullable(),
  unitId: z.string().max(64).nullable(),
  coOwnerIds: z.array(z.string().max(64)).max(20),
  studentIds: z.array(z.string().max(64)).max(MAX_STUDENTS_PER_REQUEST, 'จำนวนนักเรียนเกินกำหนด'),
  days: z.array(classLeaveDaySchema).max(MAX_DAYS_PER_REQUEST, 'จำนวนวันเกินกำหนด'),
  formStep: z.number().int().min(1).max(5),
});

export type ClassLeaveDraftInput = z.infer<typeof classLeaveDraftSchema>;

export const EMPTY_CLASS_LEAVE_DRAFT: ClassLeaveDraftInput = {
  activityName: '',
  activityType: 'academic_competition',
  objective: '',
  rationale: '',
  location: '',
  departmentId: null,
  unitId: null,
  coOwnerIds: [],
  studentIds: [],
  days: [],
  formStep: 1,
};

export interface ClassLeaveIssue {
  step: 1 | 2 | 3 | 4 | 5;
  field: string;
  message: string;
}

/** ตรวจความครบถ้วนก่อน "ส่งอนุมัติ" (ฉบับร่างบันทึกได้แม้ยังไม่ครบ) */
export function findSubmitIssues(draft: ClassLeaveDraftInput): ClassLeaveIssue[] {
  const issues: ClassLeaveIssue[] = [];
  if (draft.activityName.length < 3) {
    issues.push({ step: 1, field: 'activityName', message: 'กรุณาระบุชื่อกิจกรรม' });
  }
  if (draft.rationale.length < 3) {
    issues.push({ step: 1, field: 'rationale', message: 'กรุณาระบุเหตุผลและความจำเป็น' });
  }
  if (draft.location.length < 2) {
    issues.push({ step: 1, field: 'location', message: 'กรุณาระบุสถานที่' });
  }
  if (draft.studentIds.length === 0) {
    issues.push({ step: 2, field: 'studentIds', message: 'กรุณาเลือกนักเรียนอย่างน้อย 1 คน' });
  }
  if (draft.days.length === 0) {
    issues.push({ step: 3, field: 'days', message: 'กรุณาเพิ่มวันที่ขอเวลาเรียนอย่างน้อย 1 วัน' });
  }
  const dates = new Set<string>();
  for (const day of draft.days) {
    if (dates.has(day.date)) {
      issues.push({ step: 3, field: 'days', message: 'มีวันที่ซ้ำกันในคำร้อง' });
      break;
    }
    dates.add(day.date);
  }
  if (draft.days.some((day) => day.mode === 'periods' && day.periodNos.length === 0)) {
    issues.push({ step: 3, field: 'days', message: 'กรุณาเลือกคาบเรียนของทุกวันที่ขอแบบรายคาบ' });
  }
  return issues;
}
