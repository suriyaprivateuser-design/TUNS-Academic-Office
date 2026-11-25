/**
 * ข้อมูลสาธิต (Demo Data) สำหรับ Development และการทดสอบ
 *
 * - ใช้ได้เฉพาะกับที่เก็บข้อมูล local เท่านั้น (ตรวจใน seedDemoDataIfEmpty)
 * - ทุกแถวของบุคคลติดธง `is_demo` ชื่อทุกชื่อมีคำว่า “สาธิต” และอีเมลใช้โดเมนสงวน `.test`
 *   จึงไม่มีทางสับสนกับบุคลากรหรือนักเรียนจริง
 * - คำร้องตัวอย่างสร้างผ่าน Service จริง (สร้างร่าง → ส่ง → พิจารณา) ไม่ได้เขียนแถวลงตารางโดยตรง
 */
import 'server-only';
import type { RoleId } from '@/config/roles';
import { LEARNING_AREAS } from '@/config/school';
import { getDataDriver } from '@/lib/env';
import { addDays, schoolWeekday, toSchoolDate } from '@/lib/utils/thai-date';
import { Db } from '@/repositories/db';
import { getStorage } from '@/lib/storage';
import {
  AcademicUnits,
  AcademicYears,
  Classrooms,
  Courses,
  Semesters,
  StudentEnrollments,
  Students,
  Teachers,
  TimetableEntries,
  TimetablePeriods,
  UserRoles,
  Users,
} from '@/schemas/database/master';
import { CalendarEvents } from '@/schemas/database/meeting';
import { ApprovalRequests } from '@/schemas/database/document';
import { ServiceAccessLogs, ServiceFavorites } from '@/schemas/database/service-hub';
import { EMPTY_CLASS_LEAVE_DRAFT, type ClassLeaveDraftInput } from '@/schemas/forms/class-leave';
import { createDraft, decideClassLeave, submitRequest } from './class-leave';
import { loadCurrentUser, type CurrentUser } from './identity';
import { departmentId, provisionReferenceData } from './reference-data';
import { SETTING_KEYS, putSetting } from './settings';

export const DEMO_YEAR = 2569;
export const DEMO_ACADEMIC_YEAR_ID = `AY${DEMO_YEAR}`;
export const DEMO_SEMESTER_ID = `${DEMO_ACADEMIC_YEAR_ID}-S2`;

interface Persona {
  key: string;
  title: string;
  firstName: string;
  lastName: string;
  position: string;
  type: 'teacher' | 'staff' | 'executive';
  department?: string;
  roles: { role: RoleId; department?: string; unit?: string }[];
}

const UNIT_ASSESSMENT = 'unit-assessment';

/** บัญชีสาธิตครบทั้ง 9 บทบาท และครูประจำกลุ่มสาระสำหรับตารางสอน */
export const DEMO_PERSONAS: readonly Persona[] = [
  { key: 'admin', title: '', firstName: 'ผู้ดูแลระบบ', lastName: 'สาธิต', position: 'ผู้ดูแลระบบ', type: 'staff', roles: [{ role: 'super_admin' }] },
  { key: 'director', title: '', firstName: 'ผู้อำนวยการ', lastName: 'สาธิต', position: 'ผู้อำนวยการโรงเรียน', type: 'executive', roles: [{ role: 'director' }] },
  { key: 'deputy', title: '', firstName: 'รองผู้อำนวยการ', lastName: 'สาธิต', position: 'รองผู้อำนวยการกลุ่มบริหารวิชาการ', type: 'executive', roles: [{ role: 'deputy_director' }] },
  { key: 'academic-head', title: 'ครู', firstName: 'สาธิต', lastName: 'หัวหน้าวิชาการ', position: 'หัวหน้ากลุ่มบริหารวิชาการ', type: 'teacher', department: 'MAT', roles: [{ role: 'academic_head' }, { role: 'teacher' }] },
  { key: 'staff', title: '', firstName: 'เจ้าหน้าที่วิชาการ', lastName: 'สาธิต', position: 'เจ้าหน้าที่สำนักงานวิชาการ', type: 'staff', roles: [{ role: 'office_staff' }] },
  { key: 'head-sci', title: 'ครู', firstName: 'สาธิต', lastName: 'หัวหน้าวิทยาศาสตร์', position: 'หัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี', type: 'teacher', department: 'SCI', roles: [{ role: 'department_head', department: 'SCI' }, { role: 'teacher' }] },
  { key: 'unit-head', title: 'ครู', firstName: 'สาธิต', lastName: 'หัวหน้างานวัดผล', position: 'หัวหน้างานวัดและประเมินผล', type: 'teacher', department: 'MAT', roles: [{ role: 'unit_head', unit: UNIT_ASSESSMENT }, { role: 'teacher' }] },
  { key: 'teacher-sci', title: 'ครู', firstName: 'สาธิต', lastName: 'วิทยาศาสตร์', position: 'ครู', type: 'teacher', department: 'SCI', roles: [{ role: 'teacher' }] },
  { key: 'teacher-tha', title: 'ครู', firstName: 'สาธิต', lastName: 'ภาษาไทย', position: 'ครู', type: 'teacher', department: 'THA', roles: [{ role: 'teacher' }] },
  { key: 'teacher-mat', title: 'ครู', firstName: 'สาธิต', lastName: 'คณิตศาสตร์', position: 'ครู', type: 'teacher', department: 'MAT', roles: [{ role: 'teacher' }] },
  { key: 'teacher-soc', title: 'ครู', firstName: 'สาธิต', lastName: 'สังคมศึกษา', position: 'ครู', type: 'teacher', department: 'SOC', roles: [{ role: 'teacher' }] },
  { key: 'teacher-hpe', title: 'ครู', firstName: 'สาธิต', lastName: 'พลศึกษา', position: 'ครู', type: 'teacher', department: 'HPE', roles: [{ role: 'teacher' }] },
  { key: 'teacher-art', title: 'ครู', firstName: 'สาธิต', lastName: 'ศิลปะ', position: 'ครู', type: 'teacher', department: 'ART', roles: [{ role: 'teacher' }] },
  { key: 'teacher-occ', title: 'ครู', firstName: 'สาธิต', lastName: 'การงานอาชีพ', position: 'ครู', type: 'teacher', department: 'OCC', roles: [{ role: 'teacher' }] },
  { key: 'teacher-for', title: 'ครู', firstName: 'สาธิต', lastName: 'ภาษาต่างประเทศ', position: 'ครู', type: 'teacher', department: 'FOR', roles: [{ role: 'teacher' }] },
  { key: 'auditor', title: '', firstName: 'ผู้ตรวจสอบ', lastName: 'สาธิต', position: 'ผู้ตรวจสอบ', type: 'staff', roles: [{ role: 'auditor' }] },
];

export const demoUserId = (key: string) => `demo-user-${key}`;
export const demoTeacherId = (key: string) => `demo-teacher-${key}`;
export const demoClassroomId = (level: number, room: number) => `demo-room-${level}-${room}`;
export const demoStudentId = (level: number, room: number, no: number) =>
  `demo-student-${level}${room}${String(no).padStart(2, '0')}`;
/** รหัสนักเรียนสาธิตขึ้นต้นด้วย 0 เพื่อทดสอบการรักษาศูนย์นำหน้าตลอดทั้งระบบ */
export const demoStudentCode = (level: number, room: number, no: number) =>
  `0${level}${room}${String(no).padStart(2, '0')}`;

const LEVELS = [1, 2, 3, 4, 5, 6];
const ROOMS = [1, 2];
const STUDENTS_PER_ROOM = 15;
const COURSE_PREFIX: Record<string, string> = { THA: 'ท', MAT: 'ค', SCI: 'ว', SOC: 'ส', HPE: 'พ', ART: 'ศ', OCC: 'ง', FOR: 'อ' };
const PERIODS = [
  ['08:30', '09:20', 'am'],
  ['09:20', '10:10', 'am'],
  ['10:20', '11:10', 'am'],
  ['11:10', '12:00', 'am'],
  ['13:00', '13:50', 'pm'],
  ['13:50', '14:40', 'pm'],
  ['14:50', '15:40', 'pm'],
  ['15:40', '16:30', 'pm'],
] as const;

const fullName = (p: Persona) => `${p.title}${p.firstName} ${p.lastName}`.trim();

async function seedMasterData(db: Db): Promise<void> {
  const uow = db.unitOfWork({ action: 'demo.seedMaster', actorId: null });
  const source = { source: 'manual' as const, is_demo: true };

  uow.add(
    db.repo(AcademicYears).insert({
      id: DEMO_ACADEMIC_YEAR_ID,
      year_be: DEMO_YEAR,
      start_date: '2026-05-16',
      end_date: '2027-03-31',
      is_current: true,
      status: 'active',
    }),
    db.repo(Semesters).insert({
      id: `${DEMO_ACADEMIC_YEAR_ID}-S1`,
      academic_year_id: DEMO_ACADEMIC_YEAR_ID,
      term: 1,
      name: 'ภาคเรียนที่ 1',
      start_date: '2026-05-16',
      end_date: '2026-10-10',
      is_current: false,
    }),
    db.repo(Semesters).insert({
      id: DEMO_SEMESTER_ID,
      academic_year_id: DEMO_ACADEMIC_YEAR_ID,
      term: 2,
      name: 'ภาคเรียนที่ 2',
      start_date: '2026-11-01',
      end_date: '2027-03-31',
      is_current: true,
    }),
    db.repo(AcademicUnits).insert({
      id: UNIT_ASSESSMENT,
      code: 'ASSESSMENT',
      name_th: 'งานวัดและประเมินผล',
      description: 'กลุ่มงานสาธิต',
      sort_order: 1,
      status: 'active',
      is_demo: true,
    }),
  );

  for (const persona of DEMO_PERSONAS) {
    uow.add(
      db.repo(Teachers).insert({
        id: demoTeacherId(persona.key),
        teacher_code: `D-${persona.key}`,
        title: persona.title || null,
        first_name: persona.firstName,
        last_name: persona.lastName,
        position: persona.position,
        personnel_type: persona.type,
        department_id: persona.department ? departmentId(persona.department) : null,
        email: `demo.${persona.key}@example.test`,
        status: 'active',
        ...source,
      }),
      db.repo(Users).insert({
        id: demoUserId(persona.key),
        email: `demo.${persona.key}@example.test`,
        display_name: fullName(persona),
        teacher_id: demoTeacherId(persona.key),
        status: 'active',
        is_demo: true,
      }),
    );
    for (const assignment of persona.roles) {
      uow.add(
        db.repo(UserRoles).insert({
          id: `${demoUserId(persona.key)}:${assignment.role}`,
          user_id: demoUserId(persona.key),
          role_id: assignment.role,
          department_id: assignment.department ? departmentId(assignment.department) : null,
          unit_id: assignment.unit ?? null,
          status: 'active',
        }),
      );
    }
  }

  const teachersByDepartment = new Map<string, string[]>();
  for (const persona of DEMO_PERSONAS) {
    if (persona.type !== 'teacher' || !persona.department) continue;
    const list = teachersByDepartment.get(persona.department) ?? [];
    list.push(demoTeacherId(persona.key));
    teachersByDepartment.set(persona.department, list);
  }
  const advisors = DEMO_PERSONAS.filter((p) => p.type === 'teacher').map((p) => demoTeacherId(p.key));

  PERIODS.forEach(([start, end, part], index) => {
    uow.add(
      db.repo(TimetablePeriods).insert({
        id: `period-${index + 1}`,
        period_no: index + 1,
        name: `คาบ ${index + 1}`,
        start_time: start,
        end_time: end,
        day_part: part,
        is_teaching: true,
      }),
    );
  });

  for (const level of LEVELS) {
    for (const area of LEARNING_AREAS) {
      uow.add(
        db.repo(Courses).insert({
          id: `demo-course-${area.code}-${level}`,
          course_code: `${COURSE_PREFIX[area.code]}${level <= 3 ? 2 : 3}${level <= 3 ? level : level - 3}101`,
          name_th: `${area.nameTh} ม.${level} (สาธิต)`,
          department_id: departmentId(area.code),
          level,
          credits: 1,
          status: 'active',
          ...source,
        }),
      );
    }
    for (const room of ROOMS) {
      const classroomId = demoClassroomId(level, room);
      const program = level <= 3 ? 'ทั่วไป (สาธิต)' : room === 1 ? 'วิทย์–คณิต (สาธิต)' : 'ศิลป์–ภาษา (สาธิต)';
      uow.add(
        db.repo(Classrooms).insert({
          id: classroomId,
          academic_year_id: DEMO_ACADEMIC_YEAR_ID,
          level,
          room,
          name: `ม.${level}/${room}`,
          program,
          advisor_teacher_ids: [advisors[(level * 2 + room) % advisors.length] as string],
          status: 'active',
          source: 'manual',
        }),
      );
      for (let no = 1; no <= STUDENTS_PER_ROOM; no += 1) {
        const studentId = demoStudentId(level, room, no);
        const title = level <= 3 ? (no % 2 ? 'เด็กชาย' : 'เด็กหญิง') : no % 2 ? 'นาย' : 'นางสาว';
        uow.add(
          db.repo(Students).insert({
            id: studentId,
            student_code: demoStudentCode(level, room, no),
            title,
            first_name: 'นักเรียนสาธิต',
            last_name: `${level}/${room}-${String(no).padStart(2, '0')}`,
            status: 'active',
            ...source,
          }),
          db.repo(StudentEnrollments).insert({
            id: `enroll-${studentId}`,
            student_id: studentId,
            academic_year_id: DEMO_ACADEMIC_YEAR_ID,
            classroom_id: classroomId,
            student_no: no,
            status: 'active',
            source: 'manual',
          }),
        );
      }
      for (let day = 1; day <= 5; day += 1) {
        for (let period = 1; period <= PERIODS.length; period += 1) {
          const area = LEARNING_AREAS[(day * 3 + period + level + room) % LEARNING_AREAS.length];
          if (!area) continue;
          const teachers = teachersByDepartment.get(area.code) ?? [];
          uow.add(
            db.repo(TimetableEntries).insert({
              id: `tt-${level}-${room}-${day}-${period}`,
              academic_year_id: DEMO_ACADEMIC_YEAR_ID,
              semester_id: DEMO_SEMESTER_ID,
              classroom_id: classroomId,
              day_of_week: day,
              period_no: period,
              course_id: `demo-course-${area.code}-${level}`,
              teacher_id: teachers[(level + room + period) % Math.max(teachers.length, 1)] ?? null,
              source: 'manual',
            }),
          );
        }
      }
    }
  }

  const today = toSchoolDate();
  const event = (id: string, title: string, type: 'meeting' | 'deadline' | 'exam', offset: number, hour: number) =>
    db.repo(CalendarEvents).insert({
      id,
      title,
      event_type: type,
      start_at: new Date(`${addDays(today, offset)}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString(),
      end_at: new Date(`${addDays(today, offset)}T${String(hour + 2).padStart(2, '0')}:00:00+07:00`).toISOString(),
      all_day: type !== 'meeting',
      location: type === 'meeting' ? 'ห้องประชุมวิชาการ (สาธิต)' : null,
      academic_year_id: DEMO_ACADEMIC_YEAR_ID,
      semester_id: DEMO_SEMESTER_ID,
      visibility: 'all',
      source_type: 'manual',
      status: 'scheduled',
    });
  uow.add(
    event('demo-event-meeting', 'ประชุมกลุ่มบริหารวิชาการ (สาธิต)', 'meeting', 2, 14),
    event('demo-event-deadline', 'กำหนดส่งแผนการจัดการเรียนรู้ (สาธิต)', 'deadline', 6, 9),
    event('demo-event-exam', 'สอบกลางภาคเรียนที่ 2 (สาธิต)', 'exam', 21, 8),
  );

  await putSetting(db, uow, {
    key: SETTING_KEYS.demoData,
    value: 'true',
    valueType: 'boolean',
    category: 'system',
    description: 'ฐานข้อมูลนี้เป็นข้อมูลสาธิต',
  });
  await putSetting(db, uow, {
    key: SETTING_KEYS.initialized,
    value: 'true',
    valueType: 'boolean',
    category: 'system',
  });
  await uow.commit();
}

/** วันทำการ (จันทร์–ศุกร์) ถัดจาก date ไป offset วันทำการ — offset 0 คืนวันนี้ถ้าเป็นวันทำการ */
function schoolDay(date: string, offset: number): string {
  let current = date;
  while (schoolWeekday(current) > 5) current = addDays(current, 1);
  for (let moved = 0; moved < offset; ) {
    current = addDays(current, 1);
    if (schoolWeekday(current) <= 5) moved += 1;
  }
  return current;
}

async function approveThrough(db: Db, users: Record<string, CurrentUser>, requestId: string, approvers: string[]) {
  for (const key of approvers) {
    const request = await db.repo(ApprovalRequests).byId(requestId);
    if (!request || request.status !== 'pending') return;
    await decideClassLeave(db, users[key] as CurrentUser, {
      requestId,
      decision: 'approve',
      expectedVersion: request.version,
    });
  }
}

async function seedClassLeaveSamples(db: Db): Promise<void> {
  const users: Record<string, CurrentUser> = {};
  for (const persona of DEMO_PERSONAS) {
    const user = await loadCurrentUser(db, demoUserId(persona.key));
    if (user) users[persona.key] = user;
  }
  const teacher = users['teacher-sci'];
  const mathTeacher = users['teacher-mat'];
  if (!teacher || !mathTeacher) return;
  const today = toSchoolDate();
  const students = (level: number, room: number, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => demoStudentId(level, room, from + i));
  const draft = (overrides: Partial<ClassLeaveDraftInput>): ClassLeaveDraftInput => ({
    ...EMPTY_CLASS_LEAVE_DRAFT,
    departmentId: departmentId('SCI'),
    formStep: 5,
    ...overrides,
  });

  // 1) อนุมัติครบแล้ว และมีผลวันนี้ → แสดงใน “กิจกรรมนักเรียนวันนี้”
  const approved = await createDraft(
    db,
    teacher,
    draft({
      activityName: 'ซ้อมการแข่งขันโครงงานวิทยาศาสตร์ (สาธิต)',
      activityType: 'competition_practice',
      objective: 'เตรียมความพร้อมก่อนการแข่งขันโครงงานวิทยาศาสตร์ระดับเขตพื้นที่',
      rationale: 'นักเรียนตัวแทนต้องฝึกซ้อมการนำเสนอร่วมกับครูที่ปรึกษาโครงงาน',
      location: 'ห้องปฏิบัติการวิทยาศาสตร์ (สาธิต)',
      studentIds: [...students(4, 1, 1, 6), ...students(5, 2, 1, 4)],
      days: [{ date: schoolDay(today, 0), mode: 'periods', periodNos: [3, 4] }],
    }),
  );
  const approvedSubmit = await submitRequest(db, teacher, approved.id, 1);
  await approveThrough(db, users, approvedSubmit.approvalRequestId, ['head-sci', 'staff', 'academic-head', 'deputy', 'director']);

  // 2) รอสำนักงานวิชาการตรวจสอบ
  const pending = await createDraft(
    db,
    teacher,
    draft({
      activityName: 'แข่งขันทักษะวิชาการ กลุ่มสาระวิทยาศาสตร์ (สาธิต)',
      activityType: 'academic_competition',
      objective: 'นำนักเรียนเข้าร่วมการแข่งขันทักษะวิชาการ',
      rationale: 'โรงเรียนได้รับเชิญให้ส่งตัวแทนเข้าร่วมการแข่งขัน',
      location: 'สถานที่จัดการแข่งขัน (สาธิต)',
      studentIds: [...students(4, 1, 1, 8), ...students(6, 1, 3, 7)],
      days: [
        { date: schoolDay(today, 5), mode: 'full_day', periodNos: [] },
        { date: schoolDay(today, 6), mode: 'half_day_am', periodNos: [] },
      ],
    }),
  );
  const pendingSubmit = await submitRequest(db, teacher, pending.id, 1);
  await approveThrough(db, users, pendingSubmit.approvalRequestId, ['head-sci']);

  // 3) ถูกส่งกลับแก้ไข
  const returned = await createDraft(
    db,
    teacher,
    draft({
      activityName: 'ค่ายวิทยาศาสตร์สัญจร (สาธิต)',
      activityType: 'academic_camp',
      objective: 'จัดค่ายบูรณาการวิทยาศาสตร์และเทคโนโลยี',
      rationale: 'ส่งเสริมทักษะกระบวนการทางวิทยาศาสตร์นอกห้องเรียน',
      location: 'ศูนย์การเรียนรู้ (สาธิต)',
      studentIds: students(5, 1, 1, 12),
      days: [{ date: schoolDay(today, 9), mode: 'full_day', periodNos: [] }],
    }),
  );
  const returnedSubmit = await submitRequest(db, teacher, returned.id, 1);
  const returnedRequest = await db.repo(ApprovalRequests).byId(returnedSubmit.approvalRequestId);
  if (returnedRequest && users['head-sci']) {
    await decideClassLeave(db, users['head-sci'], {
      requestId: returnedRequest.id,
      decision: 'return',
      comment: 'กรุณาแนบกำหนดการของค่ายและระบุครูผู้ร่วมรับผิดชอบเพิ่มเติม',
      expectedVersion: returnedRequest.version,
    });
  }

  // 4) ฉบับร่างที่ยังกรอกไม่ครบ
  await createDraft(
    db,
    teacher,
    draft({
      activityName: 'ศึกษาดูงานพิพิธภัณฑ์วิทยาศาสตร์ (สาธิต)',
      activityType: 'study_visit',
      studentIds: students(4, 2, 1, 5),
      formStep: 2,
    }),
  );

  // 5) คำร้องจากกลุ่มสาระที่ยังไม่มีหัวหน้า → ขั้นแรกถูกข้าม และรอสำนักงานวิชาการ
  const math = await createDraft(
    db,
    mathTeacher,
    draft({
      activityName: 'แข่งขันคณิตคิดเร็ว (สาธิต)',
      activityType: 'academic_competition',
      objective: 'นำนักเรียนเข้าร่วมการแข่งขันคณิตคิดเร็ว',
      rationale: 'เป็นกิจกรรมตามปฏิทินวิชาการของกลุ่มสาระคณิตศาสตร์',
      location: 'หอประชุมโรงเรียน (สาธิต)',
      departmentId: departmentId('MAT'),
      studentIds: [...students(2, 1, 1, 5), ...students(4, 1, 5, 9)],
      days: [{ date: schoolDay(today, 3), mode: 'periods', periodNos: [5, 6, 7] }],
    }),
  );
  await submitRequest(db, mathTeacher, math.id, 1);
}

/**
 * ประวัติการเปิดลิงก์ (สาธิต) ย้อนหลังราว 4 เดือน และรายการโปรดของบัญชีสาธิต
 * - จำนวนกำหนดตายตัว ไม่สุ่ม ผลจึงเหมือนเดิมทุกครั้งที่สร้างฐานข้อมูลใหม่
 * - ใช้เฉพาะบริการที่เปิดได้จริงในชุดตั้งต้น (หน้าภายในระบบและเครื่องมือ Google) ไม่มีการสร้าง URL ของโรงเรียน
 */
async function seedServiceUsageSamples(db: Db): Promise<void> {
  const services = [
    'svc-class-leave',
    'svc-library',
    'svc-google-drive',
    'svc-approvals',
    'svc-google-classroom',
    'svc-google-calendar',
    'svc-google-forms',
  ];
  const personas = ['teacher-sci', 'staff', 'teacher-mat', 'head-sci', 'academic-head'];
  const sources = ['hub', 'workspace', 'launcher', 'search'] as const;
  const logs = db.repo(ServiceAccessLogs);
  const WEEKS = 18;
  for (let week = WEEKS - 1; week >= 0; week -= 1) {
    // สัปดาห์ล่าสุดมาก่อนเวลาปัจจุบัน 2 ชั่วโมง เพื่อไม่ให้มีรายการในอนาคต
    const at = new Date(Date.now() - (week * 7 * 24 + 2) * 3600_000);
    const uow = db.unitOfWork({ action: 'demo.seedServiceUsage', actorId: null }, at);
    services.forEach((serviceId, serviceIndex) => {
      personas.forEach((persona, personaIndex) => {
        // ระบบแรก ๆ ถูกเปิดบ่อยกว่า และการใช้งานค่อย ๆ เพิ่มขึ้นเมื่อเข้าใกล้ปัจจุบัน
        const weight = (WEEKS - week + personaIndex * 2 + serviceIndex * 5) % (serviceIndex + 3);
        const times = weight === 0 ? (week < 9 ? 2 : 1) : 0;
        for (let count = 0; count < times; count += 1) {
          uow.add(
            logs.insert({
              service_id: serviceId,
              user_id: demoUserId(persona),
              source: sources[(serviceIndex + personaIndex + count) % sources.length] ?? 'hub',
            }),
          );
        }
      });
    });
    if (uow.size > 0) await uow.commit();
  }

  const favorites = db.repo(ServiceFavorites);
  const uow = db.unitOfWork({ action: 'demo.seedServiceFavorites', actorId: null });
  for (const [persona, serviceId] of [
    ['teacher-sci', 'svc-class-leave'],
    ['teacher-sci', 'svc-google-classroom'],
    ['staff', 'svc-library'],
    ['staff', 'svc-google-drive'],
  ] as const) {
    uow.add(favorites.insert({ user_id: demoUserId(persona), service_id: serviceId, is_active: true }));
  }
  await uow.commit();
}

/** เติมข้อมูลสาธิตเมื่อฐานข้อมูล local ยังว่าง — ไม่ทำงานกับ Google Sheets ไม่ว่ากรณีใด */
export async function seedDemoDataIfEmpty(): Promise<boolean> {
  if (getDataDriver() !== 'local') return false;
  if (process.env.DEMO_SEED === 'false') return false;
  const db = new Db(getStorage());
  if ((await db.repo(Users).count()) > 0) return false;
  await provisionReferenceData(db, null);
  await seedMasterData(db);
  await seedClassLeaveSamples(db);
  await seedServiceUsageSamples(db);
  return true;
}

/** ใช้ในการทดสอบ: เติมข้อมูลสาธิตลงฐานข้อมูลที่ระบุ */
export async function seedDemoData(db: Db, options: { samples?: boolean } = {}): Promise<void> {
  await provisionReferenceData(db, null);
  await seedMasterData(db);
  if (options.samples !== false) {
    await seedClassLeaveSamples(db);
    await seedServiceUsageSamples(db);
  }
}
