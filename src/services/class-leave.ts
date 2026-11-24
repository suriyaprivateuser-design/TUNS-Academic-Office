/**
 * Class Leave Service — ระบบขอเวลาเรียนนักเรียน (Module 03)
 *
 * สถานะ 3 เรื่องแยกจากกัน: สถานะอนุมัติ (ที่นี่) / การเข้าร่วมกิจกรรมจริง / เวลาเรียนทางการ (ไม่อยู่ในระบบนี้)
 *
 * เนื้อหาที่ยังแก้ไขได้ (รายชื่อ วัน/คาบ) อยู่ใน `draft_data` ของคำร้อง
 * เมื่อ "ส่ง" ระบบบันทึกเป็นแถวในตารางลูกตามเลขเวอร์ชัน (`request_version`) ซึ่งไม่ถูกแก้ไขอีก
 * การแก้ไขหลังส่ง/หลังอนุมัติจึงสร้างเวอร์ชันใหม่และเข้าสู่การพิจารณาอีกครั้งเสมอ
 */
import 'server-only';
import { activityTypeLabel, type DocumentStatus } from '@/config/reference';
import { conflict, forbidden, notFound, validation } from '@/lib/errors';
import { formatThaiDateRange, toSchoolDate } from '@/lib/utils/thai-date';
import type { Db, UnitOfWork } from '@/repositories/db';
import {
  ClassLeaveAcknowledgements,
  ClassLeaveImpacts,
  ClassLeavePeriods,
  ClassLeaveRecipients,
  ClassLeaveRequests,
  ClassLeaveStudents,
  type ClassLeaveDraftData,
} from '@/schemas/database/class-leave';
import { ApprovalRequests } from '@/schemas/database/document';
import {
  Classrooms,
  Courses,
  StudentEnrollments,
  Students,
  Teachers,
  TimetableEntries,
  TimetablePeriods,
  Users,
} from '@/schemas/database/master';
import { CalendarEvents } from '@/schemas/database/meeting';
import type { RowOf } from '@/schemas/database/types';
import {
  classLeaveDraftSchema,
  findSubmitIssues,
  type ClassLeaveDraftInput,
  type ClassLeaveIssue,
} from '@/schemas/forms/class-leave';
import {
  cancelApproval,
  decide,
  submitForApproval,
  type ApprovalSubject,
  type DecisionInput,
  type DecisionResult,
  type SubjectAdapter,
} from './approvals';
import {
  computeImpact,
  type ExistingImpact,
  type ImpactResult,
  type PeriodDef,
  type StudentRef,
  type TimetableSlot,
} from './class-leave-impact';
import type { CurrentUser } from './identity';
import { addNotifications, type NotificationInput } from './notifications';
import { getCurrentTerm, type AcademicTerm } from './settings';

export type ClassLeaveRow = RowOf<typeof ClassLeaveRequests>;

const EDITABLE: readonly DocumentStatus[] = ['draft', 'returned'];
const COUNTED: readonly DocumentStatus[] = ['submitted', 'pending_review', 'in_consideration', 'approved'];

export const classLeaveAdapter: SubjectAdapter = {
  type: 'class_leave',
  resource: 'classLeave.approvals',
  label: 'หนังสือขอเวลาเรียน',
  linkPath: (requestId) => `/documents/approvals/${requestId}`,
  async applyStatus(db, uow, subject, status, context) {
    uow.add(
      db.repo(ClassLeaveRequests).update(subject.id, {
        status,
        approval_request_id: context.requestId,
        ...(status === 'approved' ? { approved_at: uow.now } : {}),
      }),
    );
  },
};

function recordContext(row: ClassLeaveRow, extraParticipants: readonly string[] = []) {
  return {
    ownerIds: [row.owner_id],
    participantIds: [...(row.co_owner_ids ?? []), ...extraParticipants],
    departmentId: row.department_id,
    unitId: row.unit_id,
  };
}

function draftOf(row: ClassLeaveRow): ClassLeaveDraftInput {
  return {
    activityName: row.activity_name,
    activityType: row.activity_type,
    objective: row.objective ?? '',
    rationale: row.rationale ?? '',
    location: row.location ?? '',
    departmentId: row.department_id,
    unitId: row.unit_id,
    coOwnerIds: row.co_owner_ids ?? [],
    studentIds: row.draft_data?.studentIds ?? [],
    days: row.draft_data?.days ?? [],
    formStep: row.form_step,
  };
}

function parseDraft(input: unknown): ClassLeaveDraftInput {
  const parsed = classLeaveDraftSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.')] ??= issue.message;
    }
    throw validation('ข้อมูลในฟอร์มไม่ถูกต้อง', fieldErrors);
  }
  const draft = parsed.data;
  return {
    ...draft,
    studentIds: Array.from(new Set(draft.studentIds)),
    coOwnerIds: Array.from(new Set(draft.coOwnerIds)),
    days: [...draft.days].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function requireTerm(db: Db): Promise<AcademicTerm & { semesterId: string; semester: string }> {
  const term = await getCurrentTerm(db);
  if (!term?.semesterId || !term.semester) {
    throw validation('ยังไม่ได้ตั้งค่าปีการศึกษาและภาคเรียนปัจจุบัน กรุณาติดต่อผู้ดูแลระบบ');
  }
  return term as AcademicTerm & { semesterId: string; semester: string };
}

// ── นักเรียน ───────────────────────────────────────────────────────────────────

export interface StudentOption {
  id: string;
  code: string;
  name: string;
  classroomId: string | null;
  classroomName: string | null;
  level: number | null;
  program: string | null;
  studentNo: number | null;
}

export interface ClassroomOption {
  id: string;
  name: string;
  level: number;
  room: number;
  program: string | null;
  studentCount: number;
}

interface StudentDirectory {
  students: StudentOption[];
  classrooms: ClassroomOption[];
}

/** รายชื่อนักเรียนของปีการศึกษาปัจจุบันจากฐานข้อมูลกลาง (เฉพาะสถานะกำลังศึกษา) */
async function loadStudentDirectory(db: Db, academicYearId: string): Promise<StudentDirectory> {
  const [students, enrollments, classrooms] = await Promise.all([
    db.repo(Students).all(),
    db.repo(StudentEnrollments).all(),
    db.repo(Classrooms).all(),
  ]);
  const classroomById = new Map(
    classrooms.filter((c) => c.academic_year_id === academicYearId).map((c) => [c.id, c]),
  );
  const enrollmentByStudent = new Map(
    enrollments
      .filter((e) => e.academic_year_id === academicYearId && e.status === 'active')
      .map((e) => [e.student_id, e]),
  );
  const counts = new Map<string, number>();
  const options: StudentOption[] = [];
  for (const student of students) {
    if (student.status !== 'active' || student.archived_at) continue;
    const enrollment = enrollmentByStudent.get(student.id);
    const classroom = classroomById.get(enrollment?.classroom_id ?? '') ?? null;
    if (classroom) counts.set(classroom.id, (counts.get(classroom.id) ?? 0) + 1);
    options.push({
      id: student.id,
      code: student.student_code,
      name: `${student.title ?? ''}${student.first_name} ${student.last_name}`.trim(),
      classroomId: classroom?.id ?? null,
      classroomName: classroom?.name ?? null,
      level: classroom?.level ?? null,
      program: classroom?.program ?? null,
      studentNo: enrollment?.student_no ?? null,
    });
  }
  options.sort(
    (a, b) =>
      (a.level ?? 99) - (b.level ?? 99) ||
      (a.classroomName ?? '').localeCompare(b.classroomName ?? '', 'th', { numeric: true }) ||
      (a.studentNo ?? 999) - (b.studentNo ?? 999) ||
      a.code.localeCompare(b.code),
  );
  return {
    students: options,
    classrooms: Array.from(classroomById.values())
      .filter((c) => c.status === 'active')
      .map((c) => ({
        id: c.id,
        name: c.name,
        level: c.level,
        room: c.room,
        program: c.program,
        studentCount: counts.get(c.id) ?? 0,
      }))
      .sort((a, b) => a.level - b.level || a.room - b.room),
  };
}

function assertCanPickStudents(user: CurrentUser): void {
  if (
    !user.permissions.can('classLeave.requests', 'create') &&
    !user.permissions.can('classLeave.requests', 'view')
  ) {
    throw forbidden();
  }
}

export async function listClassrooms(db: Db, user: CurrentUser): Promise<ClassroomOption[]> {
  assertCanPickStudents(user);
  const term = await getCurrentTerm(db);
  if (!term) return [];
  return (await loadStudentDirectory(db, term.academicYearId)).classrooms;
}

export interface StudentQuery {
  q?: string;
  classroomIds?: readonly string[];
  level?: number | null;
  program?: string | null;
  ids?: readonly string[];
  limit?: number;
}

/** ค้นหานักเรียนสำหรับ Student Picker — จำกัดจำนวนผลลัพธ์เสมอ ไม่ส่งรายชื่อทั้งโรงเรียนไปยัง browser */
export async function searchStudents(
  db: Db,
  user: CurrentUser,
  query: StudentQuery,
): Promise<{ students: StudentOption[]; total: number }> {
  assertCanPickStudents(user);
  const term = await getCurrentTerm(db);
  if (!term) return { students: [], total: 0 };
  const { students } = await loadStudentDirectory(db, term.academicYearId);
  const q = query.q?.trim().toLowerCase() ?? '';
  const ids = query.ids ? new Set(query.ids) : null;
  const classroomIds = query.classroomIds?.length ? new Set(query.classroomIds) : null;
  const matches = students.filter(
    (student) =>
      (!ids || ids.has(student.id)) &&
      (!classroomIds || (student.classroomId !== null && classroomIds.has(student.classroomId))) &&
      (!query.level || student.level === query.level) &&
      (!query.program || student.program === query.program) &&
      (!q || student.code.toLowerCase().includes(q) || student.name.toLowerCase().includes(q)),
  );
  const limit = Math.min(Math.max(1, query.limit ?? 100), ids || classroomIds ? 1000 : 200);
  return { students: matches.slice(0, limit), total: matches.length };
}

/** จับคู่รหัสนักเรียนที่นำเข้า (วาง/ไฟล์) กับฐานข้อมูล — รหัสเทียบแบบข้อความ รักษาศูนย์นำหน้า */
export async function resolveStudentCodes(
  db: Db,
  user: CurrentUser,
  codes: readonly string[],
): Promise<{ matched: StudentOption[]; notFound: string[]; duplicates: string[] }> {
  assertCanPickStudents(user);
  const term = await getCurrentTerm(db);
  if (!term) return { matched: [], notFound: [...codes], duplicates: [] };
  const { students } = await loadStudentDirectory(db, term.academicYearId);
  const byCode = new Map(students.map((student) => [student.code, student]));
  const seen = new Set<string>();
  const matched: StudentOption[] = [];
  const notFound: string[] = [];
  const duplicates: string[] = [];
  for (const raw of codes.slice(0, 2000)) {
    const code = raw.trim();
    if (!code) continue;
    if (seen.has(code)) {
      duplicates.push(code);
      continue;
    }
    seen.add(code);
    const student = byCode.get(code);
    if (student) matched.push(student);
    else notFound.push(code);
  }
  return { matched, notFound, duplicates };
}

// ── ผลกระทบต่อคาบเรียน ─────────────────────────────────────────────────────────

export interface ImpactView extends ImpactResult {
  periods: PeriodDef[];
  students: StudentOption[];
  teachers: { teacherId: string; name: string; userId: string | null; slotCount: number }[];
  hasTimetable: boolean;
}

async function buildImpact(
  db: Db,
  term: AcademicTerm,
  draft: Pick<ClassLeaveDraftInput, 'studentIds' | 'days'>,
  excludeRequestId: string | null,
): Promise<ImpactView> {
  const [directory, periodRows, timetableRows, courses, teachers, users, requests, impacts] =
    await Promise.all([
      loadStudentDirectory(db, term.academicYearId),
      db.repo(TimetablePeriods).all(),
      db.repo(TimetableEntries).all(),
      db.repo(Courses).all(),
      db.repo(Teachers).all(),
      db.repo(Users).all(),
      db.repo(ClassLeaveRequests).all(),
      db.repo(ClassLeaveImpacts).all(),
    ]);
  const byId = new Map(directory.students.map((student) => [student.id, student]));
  const students = draft.studentIds
    .map((id) => byId.get(id))
    .filter((student): student is StudentOption => !!student);
  const periods: PeriodDef[] = periodRows
    .map((p) => ({
      periodNo: p.period_no,
      name: p.name,
      startTime: p.start_time,
      endTime: p.end_time,
      dayPart: p.day_part,
      isTeaching: p.is_teaching,
    }))
    .sort((a, b) => a.periodNo - b.periodNo);
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const timetable: TimetableSlot[] = timetableRows
    .filter((entry) => entry.semester_id === term.semesterId)
    .map((entry) => {
      const course = courseById.get(entry.course_id);
      return {
        classroomId: entry.classroom_id,
        dayOfWeek: entry.day_of_week,
        periodNo: entry.period_no,
        courseId: entry.course_id,
        courseCode: course?.course_code ?? '',
        courseName: course?.name_th ?? '',
        teacherId: entry.teacher_id,
      };
    });

  const requestById = new Map(requests.map((request) => [request.id, request]));
  const existing: ExistingImpact[] = [];
  for (const impact of impacts) {
    const request = requestById.get(impact.request_id);
    if (
      !request ||
      request.id === excludeRequestId ||
      impact.request_version !== request.request_version ||
      !COUNTED.includes(request.status) ||
      request.semester_id !== term.semesterId
    ) {
      continue;
    }
    existing.push({
      requestId: request.id,
      referenceNo: request.reference_no,
      activityName: request.activity_name,
      status: request.status,
      date: impact.leave_date,
      periodNo: impact.period_no,
      studentIds: impact.student_ids,
    });
  }

  const result = computeImpact({
    students: students.map<StudentRef>((s) => ({
      id: s.id,
      classroomId: s.classroomId,
      classroomName: s.classroomName,
    })),
    days: draft.days,
    periods,
    timetable,
    existing,
  });

  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const userByTeacher = new Map(
    users.filter((u) => u.teacher_id && u.status === 'active').map((u) => [u.teacher_id as string, u.id]),
  );
  return {
    ...result,
    periods,
    students,
    hasTimetable: timetable.length > 0,
    teachers: result.teacherIds.map((teacherId) => {
      const teacher = teacherById.get(teacherId);
      return {
        teacherId,
        name: teacher ? `${teacher.title ?? ''}${teacher.first_name} ${teacher.last_name}`.trim() : 'ไม่ทราบชื่อ',
        userId: userByTeacher.get(teacherId) ?? null,
        slotCount: result.slots.filter((slot) => slot.teacherId === teacherId).length,
      };
    }),
  };
}

/** คำนวณผลกระทบของฉบับร่าง (Step 3 และหน้าสรุป) */
export async function previewImpact(
  db: Db,
  user: CurrentUser,
  draft: Pick<ClassLeaveDraftInput, 'studentIds' | 'days'>,
  requestId: string | null,
): Promise<ImpactView> {
  assertCanPickStudents(user);
  return buildImpact(db, await requireTerm(db), draft, requestId);
}

// ── ฉบับร่าง ───────────────────────────────────────────────────────────────────

export async function createDraft(
  db: Db,
  user: CurrentUser,
  input: unknown,
  idempotencyKey?: string,
): Promise<{ id: string; referenceNo: string; version: number }> {
  user.permissions.assertCan('classLeave.requests', 'create');
  const draft = parseDraft(input);
  const term = await requireTerm(db);
  const uow = db.unitOfWork({ action: 'classLeave.createDraft', actorId: user.id, idempotencyKey });
  const sequenceKey = `CL-${term.year}`;
  const referenceNo = `${sequenceKey}-${uow.sequence('ref', sequenceKey, 4)}`;
  const data: ClassLeaveDraftData = { studentIds: draft.studentIds, days: draft.days };
  const created = db.repo(ClassLeaveRequests).insert({
    reference_no: referenceNo,
    academic_year_id: term.academicYearId,
    semester_id: term.semesterId,
    activity_name: draft.activityName || 'กิจกรรมยังไม่ได้ตั้งชื่อ',
    activity_type: draft.activityType,
    objective: draft.objective || null,
    rationale: draft.rationale || null,
    location: draft.location || null,
    department_id: draft.departmentId ?? user.departmentId,
    unit_id: draft.unitId,
    owner_id: user.id,
    co_owner_ids: draft.coOwnerIds.filter((id) => id !== user.id),
    start_date: draft.days[0]?.date ?? null,
    end_date: draft.days[draft.days.length - 1]?.date ?? null,
    student_count: draft.studentIds.length,
    period_count: 0,
    timetable_verification: 'none',
    status: 'draft',
    request_version: 1,
    form_step: draft.formStep,
    draft_data: data,
  });
  uow.add(created).data('id', created.id).data('referenceNo', referenceNo);
  uow.audit({
    action: 'classLeave.createDraft',
    category: 'create',
    resource: 'classLeave.requests',
    entityType: 'class_leave',
    entityId: created.id,
    summary: 'สร้างฉบับร่างหนังสือขอเวลาเรียน',
  });
  const result = await uow.commit();
  // กรณีเรียกซ้ำด้วยคีย์เดิม ใช้ id และเลขอ้างอิงของครั้งแรก
  return {
    id: result.data.id ?? created.id,
    referenceNo: result.data.referenceNo ?? referenceNo,
    version: 1,
  };
}

async function loadOwned(db: Db, user: CurrentUser, id: string, action: 'edit' | 'submit' | 'cancel') {
  const row = await db.repo(ClassLeaveRequests).byId(id);
  // ไม่แยก "ไม่มี" กับ "ไม่มีสิทธิ์" เพื่อไม่ให้เดารหัสคำร้องได้
  if (!row || !user.permissions.canOnRecord('classLeave.requests', 'view', recordContext(row))) {
    throw notFound('ไม่พบคำร้อง');
  }
  if (!user.permissions.canOnRecord('classLeave.requests', action, recordContext(row))) {
    throw forbidden();
  }
  return row;
}

export async function saveDraft(
  db: Db,
  user: CurrentUser,
  id: string,
  input: unknown,
  expectedVersion: number,
): Promise<{ version: number }> {
  const row = await loadOwned(db, user, id, 'edit');
  if (!EDITABLE.includes(row.status)) {
    throw conflict('คำร้องนี้ส่งแล้ว ไม่สามารถแก้ไขได้ หากต้องการแก้ไขให้ใช้ “ขอแก้ไข” จากหน้ารายละเอียด');
  }
  const draft = parseDraft(input);
  const uow = db.unitOfWork({ action: 'classLeave.saveDraft', actorId: user.id });
  uow.add(
    db.repo(ClassLeaveRequests).update(
      id,
      {
        activity_name: draft.activityName || 'กิจกรรมยังไม่ได้ตั้งชื่อ',
        activity_type: draft.activityType,
        objective: draft.objective || null,
        rationale: draft.rationale || null,
        location: draft.location || null,
        department_id: draft.departmentId,
        unit_id: draft.unitId,
        co_owner_ids: draft.coOwnerIds.filter((userId) => userId !== row.owner_id),
        start_date: draft.days[0]?.date ?? null,
        end_date: draft.days[draft.days.length - 1]?.date ?? null,
        student_count: draft.studentIds.length,
        form_step: Math.max(row.form_step, draft.formStep),
        draft_data: { studentIds: draft.studentIds, days: draft.days },
      },
      expectedVersion,
    ),
  );
  const result = await uow.commit();
  return { version: result.versions[`${ClassLeaveRequests.key}:${id}`] ?? expectedVersion + 1 };
}

export interface SubmitOutcome {
  status: DocumentStatus;
  approvalRequestId: string;
  waitingAt: string | null;
  requestVersion: number;
}

/**
 * ส่งคำร้องเข้าสู่การพิจารณา: ตรวจความครบถ้วน → คำนวณผลกระทบจากตารางเรียน (ฝั่ง Server)
 * → บันทึกรายชื่อ/วัน/คาบ/ผลกระทบของเวอร์ชันนี้ + เปิดคำขออนุมัติ ในคำสั่งเขียนเดียว
 */
export async function submitRequest(
  db: Db,
  user: CurrentUser,
  id: string,
  expectedVersion: number,
  idempotencyKey?: string,
): Promise<SubmitOutcome> {
  const row = await loadOwned(db, user, id, 'submit');
  if (!EDITABLE.includes(row.status)) throw conflict('คำร้องนี้ถูกส่งไปแล้ว');
  if (row.version !== expectedVersion) throw conflict();
  const draft = draftOf(row);
  const issues = findSubmitIssues(draft);
  if (issues.length > 0) {
    throw validation(issues[0]?.message ?? 'ข้อมูลยังไม่ครบ', toFieldErrors(issues));
  }
  const term = await requireTerm(db);
  const impact = await buildImpact(db, term, draft, row.id);
  if (impact.students.length !== draft.studentIds.length) {
    throw validation('มีนักเรียนบางคนไม่อยู่ในฐานข้อมูลปีการศึกษาปัจจุบัน กรุณาตรวจรายชื่ออีกครั้ง');
  }
  if (impact.totalPeriods === 0) throw validation('ไม่พบคาบเรียนในช่วงเวลาที่ขอ กรุณาตรวจวันและคาบ');

  // ส่งครั้งแรกใช้เวอร์ชัน 1 ส่งใหม่หลังแก้ไขเพิ่มเวอร์ชัน (แถวของเวอร์ชันก่อนยังอยู่ครบ)
  const hasSubmittedBefore = (await db.repo(ClassLeaveStudents).find((s) => s.request_id === id)) !== null;
  const requestVersion = hasSubmittedBefore ? row.request_version + 1 : row.request_version;

  const uow = db.unitOfWork({ action: 'classLeave.submit', actorId: user.id, idempotencyKey });
  impact.students.forEach((student, index) => {
    uow.add(
      db.repo(ClassLeaveStudents).insert({
        request_id: id,
        request_version: requestVersion,
        student_id: student.id,
        student_code: student.code,
        student_name: student.name,
        classroom_id: student.classroomId,
        classroom_name: student.classroomName,
        student_no: student.studentNo,
        sort_order: index + 1,
      }),
    );
  });
  for (const day of impact.days) {
    uow.add(
      db.repo(ClassLeavePeriods).insert({
        request_id: id,
        request_version: requestVersion,
        leave_date: day.date,
        mode: day.mode,
        period_nos: day.periodNos,
        start_time: day.startTime,
        end_time: day.endTime,
        note: draft.days.find((d) => d.date === day.date)?.note || null,
      }),
    );
  }
  const userByTeacher = new Map(impact.teachers.map((teacher) => [teacher.teacherId, teacher.userId]));
  for (const slot of impact.slots) {
    uow.add(
      db.repo(ClassLeaveImpacts).insert({
        request_id: id,
        request_version: requestVersion,
        leave_date: slot.date,
        period_no: slot.periodNo,
        classroom_id: slot.classroomId,
        classroom_name: slot.classroomName,
        course_id: slot.courseId,
        course_code: slot.courseCode,
        course_name: slot.courseName,
        teacher_id: slot.teacherId,
        teacher_user_id: slot.teacherId ? (userByTeacher.get(slot.teacherId) ?? null) : null,
        student_ids: slot.studentIds,
        student_count: slot.studentIds.length,
        verification: slot.verification,
      }),
    );
  }

  uow.add(
    db.repo(ClassLeaveRequests).update(
      id,
      {
        request_version: requestVersion,
        student_count: impact.students.length,
        period_count: impact.totalPeriods,
        timetable_verification: impact.verification,
        start_date: impact.days[0]?.date ?? null,
        end_date: impact.days[impact.days.length - 1]?.date ?? null,
        submitted_at: uow.now,
        form_step: 5,
      },
      expectedVersion,
    ),
  );
  const subject: ApprovalSubject = {
    type: classLeaveAdapter.type,
    id,
    version: requestVersion,
    refNo: row.reference_no,
    title: row.activity_name,
    requesterId: row.owner_id,
    departmentId: row.department_id,
    unitId: row.unit_id,
  };
  // applyStatus ของ adapter จะแก้แถวคำร้องเดียวกัน จึงรวมเข้ากับคำสั่ง update ด้านบน
  const submitted = await submitForApproval(db, uow, mergingAdapter(uow, id), subject);
  await uow.commit();
  return {
    status: submitted.status,
    approvalRequestId: submitted.requestId,
    waitingAt: submitted.waitingAt,
    requestVersion,
  };
}

/**
 * Write Gateway อนุญาตให้หนึ่งคำสั่งแก้แถวเดียวกันได้ครั้งเดียว
 * adapter นี้จึงรวมการเปลี่ยนสถานะเข้ากับคำสั่ง update ของคำร้องที่อยู่ใน UnitOfWork แล้ว
 */
function mergingAdapter(uow: UnitOfWork, requestId: string): SubjectAdapter {
  return {
    ...classLeaveAdapter,
    async applyStatus(_db, _uow, _subject, status, context) {
      const pending = (uow as unknown as { mutations: { op: string; table: string; id?: string; set?: Record<string, string> }[] })
        .mutations;
      const update = pending.find(
        (m) => m.op === 'update' && m.table === ClassLeaveRequests.key && m.id === requestId,
      );
      if (!update?.set) throw new Error('class leave update is missing from the unit of work');
      update.set.status = status;
      update.set.approval_request_id = context.requestId;
      if (status === 'approved') update.set.approved_at = uow.now;
    },
  };
}

function toFieldErrors(issues: readonly ClassLeaveIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[issue.field] ??= issue.message;
  return errors;
}

/** ยกเลิกคำร้อง: ฉบับร่างยกเลิกได้ทันที คำร้องที่รอพิจารณายกเลิกผ่านกระบวนการอนุมัติ */
export async function cancelRequest(
  db: Db,
  user: CurrentUser,
  id: string,
  reason: string,
): Promise<void> {
  const row = await loadOwned(db, user, id, 'cancel');
  if (row.status === 'cancelled') return;
  if (EDITABLE.includes(row.status)) {
    const uow = db.unitOfWork({ action: 'classLeave.cancel', actorId: user.id });
    uow.add(
      db.repo(ClassLeaveRequests).update(id, { status: 'cancelled', cancel_reason: reason.trim() || null }, row.version),
    );
    uow.audit({
      action: 'classLeave.cancel',
      category: 'cancel',
      resource: 'classLeave.requests',
      entityType: 'class_leave',
      entityId: id,
      summary: `ยกเลิกหนังสือขอเวลาเรียน ${row.reference_no}`,
    });
    await uow.commit();
    return;
  }
  const approval = await db.repo(ApprovalRequests).byId(row.approval_request_id);
  if (!approval || approval.status !== 'pending') {
    throw conflict('คำร้องนี้พิจารณาเสร็จแล้ว ไม่สามารถยกเลิกจากหน้านี้ได้');
  }
  await cancelApproval(db, user, classLeaveAdapter, 'classLeave.requests', {
    requestId: approval.id,
    reason,
    expectedVersion: approval.version,
  });
}

/**
 * ขอแก้ไขคำร้องที่อนุมัติแล้ว/ถูกปฏิเสธ: กลับเป็นฉบับร่างเพื่อแก้ไขและส่งพิจารณาใหม่เป็นเวอร์ชันถัดไป
 * ผู้ที่ได้รับแจ้งของเวอร์ชันเดิมจะได้รับแจ้งว่ามีการเปลี่ยนแปลง (เวอร์ชันเดิมยังเก็บไว้ครบ)
 */
export async function reopenRequest(db: Db, user: CurrentUser, id: string, reason: string): Promise<void> {
  const row = await loadOwned(db, user, id, 'edit');
  if (row.status !== 'approved' && row.status !== 'rejected') {
    throw conflict('ขอแก้ไขได้เฉพาะคำร้องที่พิจารณาเสร็จแล้ว');
  }
  if (reason.trim().length < 3) throw validation('กรุณาระบุเหตุผลที่ขอแก้ไข');
  const recipients = await db
    .repo(ClassLeaveRecipients)
    .filter((r) => r.request_id === id && r.request_version === row.request_version);
  const uow = db.unitOfWork({ action: 'classLeave.reopen', actorId: user.id });
  uow.add(db.repo(ClassLeaveRequests).update(id, { status: 'draft', approved_at: null }, row.version));
  if (row.status === 'approved') {
    await addNotifications(
      db,
      uow,
      Array.from(new Set(recipients.map((r) => r.user_id))).map((userId) => ({
        userId,
        type: 'class_leave' as const,
        title: `มีการแก้ไขกิจกรรม: ${row.activity_name}`,
        body: `${row.reference_no} · อยู่ระหว่างแก้ไขและจะเสนอพิจารณาใหม่`,
        linkPath: `/class-leave/${id}`,
        entityType: 'class_leave',
        entityId: id,
        dedupeKey: `class-leave:${id}:reopen:v${row.request_version}`,
      })),
    );
  }
  uow.audit({
    action: 'classLeave.reopen',
    category: 'update',
    resource: 'classLeave.requests',
    entityType: 'class_leave',
    entityId: id,
    summary: `ขอแก้ไขหนังสือขอเวลาเรียน ${row.reference_no} หลังการพิจารณา (เวอร์ชัน ${row.request_version})`,
    metadata: { reason: reason.trim() },
  });
  await uow.commit();
}

// ── การพิจารณา ─────────────────────────────────────────────────────────────────

/** พิจารณาคำร้อง เมื่ออนุมัติครบทุกขั้น: แจ้งครูผู้สอน/ครูที่ปรึกษาที่เกี่ยวข้อง และลงปฏิทินวิชาการ */
export async function decideClassLeave(
  db: Db,
  user: CurrentUser,
  input: DecisionInput,
): Promise<DecisionResult> {
  return decide(db, user, classLeaveAdapter, input, async (uow, result) => {
    if (!result.finalApproval) return;
    const request = await db.repo(ClassLeaveRequests).byId(result.subject.id);
    if (!request) return;
    const [impacts, classrooms, users] = await Promise.all([
      db
        .repo(ClassLeaveImpacts)
        .filter((i) => i.request_id === request.id && i.request_version === request.request_version),
      db.repo(Classrooms).all(),
      db.repo(Users).all(),
    ]);
    const userByTeacher = new Map(
      users.filter((u) => u.teacher_id && u.status === 'active').map((u) => [u.teacher_id as string, u.id]),
    );
    const recipients = new Map<string, 'subject_teacher' | 'advisor'>();
    for (const impact of impacts) {
      if (impact.teacher_user_id) recipients.set(impact.teacher_user_id, 'subject_teacher');
    }
    const classroomIds = new Set(impacts.map((i) => i.classroom_id).filter(Boolean));
    for (const classroom of classrooms) {
      if (!classroomIds.has(classroom.id)) continue;
      for (const teacherId of classroom.advisor_teacher_ids ?? []) {
        const userId = userByTeacher.get(teacherId);
        if (userId && !recipients.has(userId)) recipients.set(userId, 'advisor');
      }
    }
    recipients.delete(request.owner_id);

    const notifications: NotificationInput[] = [];
    const range = formatThaiDateRange(request.start_date ?? '', request.end_date);
    for (const [userId, role] of recipients) {
      uow.add(
        db.repo(ClassLeaveRecipients).insert({
          request_id: request.id,
          request_version: request.request_version,
          user_id: userId,
          recipient_role: role,
          notified_at: uow.now,
        }),
      );
      notifications.push({
        userId,
        type: 'class_leave',
        title: `นักเรียนได้รับอนุญาตเข้าร่วมกิจกรรม: ${request.activity_name}`,
        // ไม่ใส่รายชื่อนักเรียนในข้อความแจ้งเตือน ผู้รับเปิดดูเฉพาะส่วนของตนในระบบ
        body: `${range} · โปรดตรวจรายชื่อและคาบที่เกี่ยวข้องกับท่าน`,
        linkPath: `/class-leave/${request.id}`,
        entityType: 'class_leave',
        entityId: request.id,
        dedupeKey: `class-leave:${request.id}:approved:v${request.request_version}`,
      });
    }
    await addNotifications(db, uow, notifications);

    if (request.start_date) {
      // ปฏิทินอ้างอิงคำร้องต้นทาง ไม่คัดลอกรายละเอียด (One Document, One Source)
      const events = db.repo(CalendarEvents);
      const existing = await events.find((e) => e.source_type === 'class_leave' && e.source_id === request.id);
      const values = {
        title: request.activity_name,
        description: `${activityTypeLabel(request.activity_type)} · ${request.reference_no}`,
        start_at: new Date(`${request.start_date}T08:00:00+07:00`).toISOString(),
        end_at: new Date(`${request.end_date ?? request.start_date}T16:30:00+07:00`).toISOString(),
        location: request.location,
        department_id: request.department_id,
        status: 'scheduled' as const,
      };
      if (existing) uow.add(events.update(existing.id, values));
      else {
        uow.add(
          events.insert({
            ...values,
            event_type: 'class_leave',
            all_day: true,
            academic_year_id: request.academic_year_id,
            semester_id: request.semester_id,
            visibility: 'all',
            source_type: 'class_leave',
            source_id: request.id,
          }),
        );
      }
    }
  });
}

// ── การอ่านข้อมูล ───────────────────────────────────────────────────────────────

export interface ClassLeaveListItem {
  id: string;
  version: number;
  referenceNo: string;
  activityName: string;
  activityTypeLabel: string;
  status: DocumentStatus;
  ownerId: string;
  ownerName: string;
  studentCount: number;
  periodCount: number;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
  isMine: boolean;
  approvalRequestId: string | null;
}

function toListItem(row: ClassLeaveRow, ownerName: string, userId: string): ClassLeaveListItem {
  return {
    id: row.id,
    version: row.version,
    referenceNo: row.reference_no,
    activityName: row.activity_name,
    activityTypeLabel: activityTypeLabel(row.activity_type),
    status: row.status,
    ownerId: row.owner_id,
    ownerName,
    studentCount: row.student_count,
    periodCount: row.period_count,
    startDate: row.start_date,
    endDate: row.end_date,
    updatedAt: row.updated_at ?? row.created_at,
    isMine: row.owner_id === userId || (row.co_owner_ids ?? []).includes(userId),
    approvalRequestId: row.approval_request_id,
  };
}

/** คำร้องที่ผู้ใช้มีสิทธิ์เห็นตาม Permission Matrix (กรองที่ Server) */
export async function listRequests(db: Db, user: CurrentUser): Promise<ClassLeaveListItem[]> {
  const [rows, users] = await Promise.all([db.repo(ClassLeaveRequests).all(), db.repo(Users).all()]);
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  return user.permissions
    .filter('classLeave.requests', 'view', rows, (row) => recordContext(row))
    .filter((row) => !row.archived_at)
    .map((row) => toListItem(row, nameById.get(row.owner_id) ?? 'ไม่ทราบชื่อ', user.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface ClassLeaveDetail {
  item: ClassLeaveListItem;
  draft: ClassLeaveDraftInput;
  objective: string | null;
  rationale: string | null;
  location: string | null;
  departmentId: string | null;
  requestVersion: number;
  submittedAt: string | null;
  approvedAt: string | null;
  timetableVerification: ClassLeaveRow['timetable_verification'];
  /** รายชื่อของเวอร์ชันที่ส่งล่าสุด — ผู้รับแจ้งเห็นเฉพาะนักเรียนที่เกี่ยวข้องกับตน */
  students: { id: string; code: string; name: string; classroomName: string | null; studentNo: number | null }[];
  days: { date: string; mode: string; periodNos: number[]; startTime: string | null; endTime: string | null; note: string | null }[];
  impacts: { date: string; periodNo: number; classroomName: string | null; courseCode: string | null; courseName: string | null; teacherName: string | null; studentCount: number; verification: string; isMine: boolean }[];
  /** true = ผู้ใช้เห็นเฉพาะส่วนที่เกี่ยวข้องกับตนเอง (ครูผู้สอน/ครูที่ปรึกษา) */
  scopedToViewer: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canAcknowledge: boolean;
  acknowledgedAt: string | null;
  acknowledgement: { total: number; acknowledged: number } | null;
}

type ViewerAccess = 'full' | 'recipient' | 'none';

async function accessOf(db: Db, user: CurrentUser, row: ClassLeaveRow): Promise<ViewerAccess> {
  if (user.permissions.canOnRecord('classLeave.requests', 'view', recordContext(row))) return 'full';
  // ผู้พิจารณาของคำขออนุมัติ (ทุกขั้น) เห็นข้อมูลครบเพื่อประกอบการพิจารณา
  const approval = await db.repo(ApprovalRequests).byId(row.approval_request_id);
  if (approval) {
    const context = {
      ownerIds: [approval.requester_id],
      participantIds: approval.steps.flatMap((step) => step.approverIds),
      departmentId: approval.department_id,
      unitId: approval.unit_id,
    };
    if (user.permissions.canOnRecord('classLeave.approvals', 'view', context)) return 'full';
  }
  if (row.status === 'approved' && user.permissions.can('classLeave.notices', 'view')) {
    const recipient = await db
      .repo(ClassLeaveRecipients)
      .find((r) => r.request_id === row.id && r.request_version === row.request_version && r.user_id === user.id);
    if (recipient) return 'recipient';
  }
  return 'none';
}

/** ใช้โดย endpoint ของไฟล์: ผู้ใช้เห็นคำร้องนี้ได้หรือไม่ */
export async function canViewRequest(db: Db, user: CurrentUser, requestId: string): Promise<boolean> {
  const row = await db.repo(ClassLeaveRequests).byId(requestId);
  return row ? (await accessOf(db, user, row)) !== 'none' : false;
}

export async function getRequestDetail(db: Db, user: CurrentUser, id: string): Promise<ClassLeaveDetail> {
  const row = await db.repo(ClassLeaveRequests).byId(id);
  const access = row ? await accessOf(db, user, row) : 'none';
  if (!row || access === 'none') throw notFound('ไม่พบคำร้อง');

  const version = row.request_version;
  const [students, periods, impacts, teachers, users, recipients, acknowledgements] = await Promise.all([
    db.repo(ClassLeaveStudents).filter((s) => s.request_id === id && s.request_version === version),
    db.repo(ClassLeavePeriods).filter((p) => p.request_id === id && p.request_version === version),
    db.repo(ClassLeaveImpacts).filter((i) => i.request_id === id && i.request_version === version),
    db.repo(Teachers).all(),
    db.repo(Users).all(),
    db.repo(ClassLeaveRecipients).filter((r) => r.request_id === id && r.request_version === version),
    db.repo(ClassLeaveAcknowledgements).filter((a) => a.request_id === id && a.request_version === version),
  ]);
  const teacherName = new Map(
    teachers.map((t) => [t.id, `${t.title ?? ''}${t.first_name} ${t.last_name}`.trim()]),
  );
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  const context = recordContext(row);
  const scoped = access === 'recipient';

  // ผู้รับแจ้ง: เห็นเฉพาะคาบที่ตนสอน และนักเรียนในห้องที่ตนเป็นครูที่ปรึกษา/สอนในคาบนั้น
  let visibleImpacts = impacts;
  let visibleStudentIds: Set<string> | null = null;
  if (scoped) {
    const mine = impacts.filter((i) => i.teacher_user_id === user.id);
    const advisorRooms = new Set(
      (await db.repo(Classrooms).all())
        .filter((c) => user.teacherId && (c.advisor_teacher_ids ?? []).includes(user.teacherId))
        .map((c) => c.id),
    );
    visibleImpacts = impacts.filter((i) => i.teacher_user_id === user.id || advisorRooms.has(i.classroom_id ?? ''));
    visibleStudentIds = new Set(visibleImpacts.flatMap((i) => i.student_ids));
    if (mine.length === 0 && visibleImpacts.length === 0) throw notFound('ไม่พบคำร้อง');
  }

  const isRecipient = recipients.some((r) => r.user_id === user.id);
  const myAcknowledgement = acknowledgements.find((a) => a.user_id === user.id) ?? null;
  const editable = EDITABLE.includes(row.status);

  return {
    item: toListItem(row, nameById.get(row.owner_id) ?? 'ไม่ทราบชื่อ', user.id),
    draft: scoped ? { ...draftOf(row), studentIds: [], coOwnerIds: [] } : draftOf(row),
    objective: row.objective,
    rationale: row.rationale,
    location: row.location,
    departmentId: row.department_id,
    requestVersion: version,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    timetableVerification: row.timetable_verification,
    students: students
      .filter((s) => !visibleStudentIds || visibleStudentIds.has(s.student_id))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        id: s.student_id,
        code: s.student_code,
        name: s.student_name,
        classroomName: s.classroom_name,
        studentNo: s.student_no,
      })),
    days: periods
      .sort((a, b) => a.leave_date.localeCompare(b.leave_date))
      .map((p) => ({
        date: p.leave_date,
        mode: p.mode,
        periodNos: p.period_nos,
        startTime: p.start_time,
        endTime: p.end_time,
        note: p.note,
      })),
    impacts: visibleImpacts
      .sort((a, b) => a.leave_date.localeCompare(b.leave_date) || a.period_no - b.period_no)
      .map((i) => ({
        date: i.leave_date,
        periodNo: i.period_no,
        classroomName: i.classroom_name,
        courseCode: i.course_code,
        courseName: i.course_name,
        teacherName: i.teacher_id ? (teacherName.get(i.teacher_id) ?? null) : null,
        studentCount: i.student_count,
        verification: i.verification,
        isMine: i.teacher_user_id === user.id,
      })),
    scopedToViewer: scoped,
    canEdit: editable && user.permissions.canOnRecord('classLeave.requests', 'edit', context),
    canSubmit: editable && user.permissions.canOnRecord('classLeave.requests', 'submit', context),
    canCancel:
      !['cancelled', 'approved', 'rejected', 'archived'].includes(row.status) &&
      user.permissions.canOnRecord('classLeave.requests', 'cancel', context),
    canReopen:
      (row.status === 'approved' || row.status === 'rejected') &&
      user.permissions.canOnRecord('classLeave.requests', 'edit', context),
    canAcknowledge: row.status === 'approved' && isRecipient && !myAcknowledgement,
    acknowledgedAt: myAcknowledgement?.acknowledged_at ?? null,
    acknowledgement:
      access === 'full' && row.status === 'approved'
        ? {
            total: new Set(recipients.map((r) => r.user_id)).size,
            acknowledged: new Set(acknowledgements.map((a) => a.user_id)).size,
          }
        : null,
  };
}

/** ครูผู้สอน/ครูที่ปรึกษากดรับทราบ (เฉพาะผู้ที่ได้รับแจ้งของเวอร์ชันปัจจุบัน) */
export async function acknowledgeRequest(db: Db, user: CurrentUser, id: string): Promise<void> {
  const row = await db.repo(ClassLeaveRequests).byId(id);
  if (!row || row.status !== 'approved') throw notFound('ไม่พบคำร้อง');
  const recipient = await db
    .repo(ClassLeaveRecipients)
    .find((r) => r.request_id === id && r.request_version === row.request_version && r.user_id === user.id);
  if (!recipient) throw notFound('ไม่พบคำร้อง');
  const existing = await db
    .repo(ClassLeaveAcknowledgements)
    .find((a) => a.request_id === id && a.request_version === row.request_version && a.user_id === user.id);
  if (existing) return;
  const uow = db.unitOfWork({ action: 'classLeave.acknowledge', actorId: user.id });
  uow.add(
    db.repo(ClassLeaveAcknowledgements).insert({
      request_id: id,
      request_version: row.request_version,
      user_id: user.id,
      acknowledged_at: uow.now,
    }),
  );
  await uow.commit();
}

export interface TodayActivity {
  requestId: string;
  referenceNo: string;
  activityName: string;
  location: string | null;
  periodNos: number[];
  /** จำนวนนักเรียนที่เกี่ยวข้องกับผู้ใช้ในวันนี้ */
  studentCount: number;
  classroomNames: string[];
  relation: 'owner' | 'subject_teacher' | 'advisor' | 'staff';
}

/** Today’s Student Activities — นักเรียนที่ได้รับอนุญาตเข้าร่วมกิจกรรมในเวลาเรียนวันนี้ เฉพาะที่เกี่ยวข้องกับผู้ใช้ */
export async function listTodayActivities(
  db: Db,
  user: CurrentUser,
  date: string = toSchoolDate(),
): Promise<TodayActivity[]> {
  const [requests, impacts, recipients, classrooms] = await Promise.all([
    db.repo(ClassLeaveRequests).filter((r) => r.status === 'approved'),
    db.repo(ClassLeaveImpacts).filter((i) => i.leave_date === date),
    db.repo(ClassLeaveRecipients).filter((r) => r.user_id === user.id),
    db.repo(Classrooms).all(),
  ]);
  const advisorRooms = new Set(
    classrooms
      .filter((c) => user.teacherId && (c.advisor_teacher_ids ?? []).includes(user.teacherId))
      .map((c) => c.id),
  );
  const seeAll = user.permissions.canAll('classLeave.requests', 'view');
  const result: TodayActivity[] = [];
  for (const request of requests) {
    const today = impacts.filter(
      (i) => i.request_id === request.id && i.request_version === request.request_version,
    );
    if (today.length === 0) continue;
    const isOwner = request.owner_id === user.id || (request.co_owner_ids ?? []).includes(user.id);
    const recipient = recipients.find(
      (r) => r.request_id === request.id && r.request_version === request.request_version,
    );
    let relevant = today;
    let relation: TodayActivity['relation'];
    if (isOwner) relation = 'owner';
    else if (recipient) {
      relation = recipient.recipient_role;
      relevant = today.filter((i) => i.teacher_user_id === user.id || advisorRooms.has(i.classroom_id ?? ''));
    } else if (seeAll) relation = 'staff';
    else continue;
    if (relevant.length === 0) continue;
    result.push({
      requestId: request.id,
      referenceNo: request.reference_no,
      activityName: request.activity_name,
      location: request.location,
      periodNos: Array.from(new Set(relevant.map((i) => i.period_no))).sort((a, b) => a - b),
      studentCount: new Set(relevant.flatMap((i) => i.student_ids)).size,
      classroomNames: Array.from(new Set(relevant.map((i) => i.classroom_name ?? ''))).filter(Boolean),
      relation,
    });
  }
  return result;
}
