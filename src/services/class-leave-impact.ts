/**
 * คำนวณผลกระทบของการขอเวลาเรียนจากตารางเรียน (ข้อ 13 Step 3)
 *
 * ฟังก์ชันบริสุทธิ์: รับข้อมูลที่อ่านมาแล้ว คืนคาบ/รายวิชา/ครูที่กระทบ ความซ้ำซ้อน และจำนวนคาบสะสม
 * ไม่ตัดสินนักเรียนจากจำนวนคาบ — ตัวเลขใช้ประกอบการพิจารณาของผู้อนุมัติเท่านั้น
 */
import { schoolWeekday } from '@/lib/utils/thai-date';
import type { ClassLeaveDay } from '@/schemas/database/class-leave';

export interface PeriodDef {
  periodNo: number;
  name: string;
  startTime: string;
  endTime: string;
  dayPart: 'am' | 'pm';
  isTeaching: boolean;
}

export interface StudentRef {
  id: string;
  classroomId: string | null;
  classroomName: string | null;
}

export interface TimetableSlot {
  classroomId: string;
  dayOfWeek: number;
  periodNo: number;
  courseId: string;
  courseCode: string;
  courseName: string;
  teacherId: string | null;
}

/** คาบที่กระทบของคำร้องอื่น (อนุมัติแล้วหรืออยู่ระหว่างพิจารณา) */
export interface ExistingImpact {
  requestId: string;
  referenceNo: string;
  activityName: string;
  status: string;
  date: string;
  periodNo: number;
  studentIds: readonly string[];
}

export interface ImpactSlot {
  date: string;
  periodNo: number;
  classroomId: string | null;
  classroomName: string | null;
  courseId: string | null;
  courseCode: string | null;
  courseName: string | null;
  teacherId: string | null;
  studentIds: string[];
  /** auto = พบในตารางเรียน, manual = ไม่พบข้อมูลตารางเรียน ต้องตรวจสอบเอง */
  verification: 'auto' | 'manual';
}

export interface LeaveConflict {
  studentId: string;
  date: string;
  periodNo: number;
  requestId: string;
  referenceNo: string;
  activityName: string;
  status: string;
}

export interface ImpactResult {
  /** คาบที่ขอในแต่ละวันหลังแปลงครึ่งวัน/เต็มวันเป็นเลขคาบ */
  days: { date: string; mode: ClassLeaveDay['mode']; periodNos: number[]; startTime: string | null; endTime: string | null }[];
  slots: ImpactSlot[];
  conflicts: LeaveConflict[];
  /** จำนวนคาบที่นักเรียนแต่ละคนขอในคำร้องนี้ */
  periodsByStudent: Record<string, number>;
  /** จำนวนคาบสะสมจากคำร้องที่อนุมัติแล้ว (ไม่รวมคำร้องนี้) */
  approvedPeriodsByStudent: Record<string, number>;
  teacherIds: string[];
  totalPeriods: number;
  verification: 'auto' | 'partial' | 'manual' | 'none';
  /** วันที่ตรงกับเสาร์–อาทิตย์ (แจ้งเตือนผู้กรอก ไม่ใช่ข้อผิดพลาด) */
  weekendDates: string[];
}

export function expandPeriods(day: ClassLeaveDay, periods: readonly PeriodDef[]): number[] {
  const teaching = periods.filter((p) => p.isTeaching);
  let selected: number[];
  switch (day.mode) {
    case 'full_day':
      selected = teaching.map((p) => p.periodNo);
      break;
    case 'half_day_am':
      selected = teaching.filter((p) => p.dayPart === 'am').map((p) => p.periodNo);
      break;
    case 'half_day_pm':
      selected = teaching.filter((p) => p.dayPart === 'pm').map((p) => p.periodNo);
      break;
    case 'periods': {
      const valid = new Set(teaching.map((p) => p.periodNo));
      // ถ้ายังไม่มีข้อมูลคาบเรียนในระบบ ยอมรับเลขคาบที่ผู้ใช้ระบุเอง
      selected = day.periodNos.filter((no) => valid.size === 0 || valid.has(no));
      break;
    }
  }
  return Array.from(new Set(selected)).sort((a, b) => a - b);
}

export function computeImpact(input: {
  students: readonly StudentRef[];
  days: readonly ClassLeaveDay[];
  periods: readonly PeriodDef[];
  timetable: readonly TimetableSlot[];
  existing: readonly ExistingImpact[];
}): ImpactResult {
  const periodByNo = new Map(input.periods.map((p) => [p.periodNo, p]));
  const timetable = new Map(
    input.timetable.map((slot) => [`${slot.classroomId}|${slot.dayOfWeek}|${slot.periodNo}`, slot]),
  );
  const classroomsWithTimetable = new Set(input.timetable.map((slot) => slot.classroomId));

  const byClassroom = new Map<string, { name: string | null; studentIds: string[] }>();
  for (const student of input.students) {
    const key = student.classroomId ?? '';
    const group = byClassroom.get(key) ?? { name: student.classroomName, studentIds: [] };
    group.studentIds.push(student.id);
    byClassroom.set(key, group);
  }

  const days: ImpactResult['days'] = [];
  const slots: ImpactSlot[] = [];
  const weekendDates: string[] = [];
  const seenDates = new Set<string>();

  for (const day of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (seenDates.has(day.date)) continue; // วันซ้ำในคำร้องเดียวกันนับครั้งเดียว
    seenDates.add(day.date);
    const periodNos = expandPeriods(day, input.periods);
    const first = periodByNo.get(periodNos[0] ?? -1);
    const last = periodByNo.get(periodNos[periodNos.length - 1] ?? -1);
    days.push({
      date: day.date,
      mode: day.mode,
      periodNos,
      startTime: first?.startTime ?? null,
      endTime: last?.endTime ?? null,
    });
    const weekday = schoolWeekday(day.date);
    if (weekday > 5) weekendDates.push(day.date);

    for (const [classroomId, group] of byClassroom) {
      for (const periodNo of periodNos) {
        const entry = classroomId ? timetable.get(`${classroomId}|${weekday}|${periodNo}`) : undefined;
        // ห้องที่มีตารางเรียนแต่คาบนั้นว่าง (ไม่มีการสอน) ไม่ถือเป็นผลกระทบ
        if (!entry && classroomId && classroomsWithTimetable.has(classroomId)) continue;
        slots.push({
          date: day.date,
          periodNo,
          classroomId: classroomId || null,
          classroomName: group.name,
          courseId: entry?.courseId ?? null,
          courseCode: entry?.courseCode ?? null,
          courseName: entry?.courseName ?? null,
          teacherId: entry?.teacherId ?? null,
          studentIds: [...group.studentIds],
          verification: entry ? 'auto' : 'manual',
        });
      }
    }
  }

  const requested = new Map<string, Set<string>>();
  const periodsByStudent: Record<string, number> = {};
  for (const student of input.students) periodsByStudent[student.id] = 0;
  for (const day of days) {
    for (const student of input.students) {
      periodsByStudent[student.id] = (periodsByStudent[student.id] ?? 0) + day.periodNos.length;
      const keys = requested.get(student.id) ?? new Set<string>();
      for (const periodNo of day.periodNos) keys.add(`${day.date}|${periodNo}`);
      requested.set(student.id, keys);
    }
  }

  const conflicts: LeaveConflict[] = [];
  const approvedPeriodsByStudent: Record<string, number> = {};
  const selected = new Set(input.students.map((s) => s.id));
  for (const impact of input.existing) {
    for (const studentId of impact.studentIds) {
      if (!selected.has(studentId)) continue;
      if (impact.status === 'approved') {
        approvedPeriodsByStudent[studentId] = (approvedPeriodsByStudent[studentId] ?? 0) + 1;
      }
      if (requested.get(studentId)?.has(`${impact.date}|${impact.periodNo}`)) {
        conflicts.push({
          studentId,
          date: impact.date,
          periodNo: impact.periodNo,
          requestId: impact.requestId,
          referenceNo: impact.referenceNo,
          activityName: impact.activityName,
          status: impact.status,
        });
      }
    }
  }

  const auto = slots.filter((slot) => slot.verification === 'auto').length;
  const verification: ImpactResult['verification'] =
    days.every((day) => day.periodNos.length === 0) || input.students.length === 0
      ? 'none'
      : slots.length === 0 || auto === slots.length
        ? 'auto'
        : auto === 0
          ? 'manual'
          : 'partial';

  return {
    days,
    slots,
    conflicts,
    periodsByStudent,
    approvedPeriodsByStudent,
    teacherIds: Array.from(new Set(slots.map((s) => s.teacherId).filter((id): id is string => !!id))),
    totalPeriods: days.reduce((sum, day) => sum + day.periodNos.length, 0),
    verification,
    weekendDates,
  };
}
