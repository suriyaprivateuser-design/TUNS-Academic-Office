import { beforeEach, describe, expect, it } from 'vitest';
import {
  ClassLeaveImpacts,
  ClassLeaveRecipients,
  ClassLeaveRequests,
  ClassLeaveStudents,
} from '@/schemas/database/class-leave';
import { ApprovalActions, ApprovalRequests } from '@/schemas/database/document';
import { CalendarEvents } from '@/schemas/database/meeting';
import { AuditLogs, Notifications } from '@/schemas/database/system';
import { EMPTY_CLASS_LEAVE_DRAFT, type ClassLeaveDraftInput } from '@/schemas/forms/class-leave';
import { getApprovalDetail, listApprovals } from '@/services/approvals';
import {
  acknowledgeRequest,
  cancelRequest,
  classLeaveAdapter,
  createDraft,
  decideClassLeave,
  getRequestDetail,
  listRequests,
  listTodayActivities,
  previewImpact,
  reopenRequest,
  resolveStudentCodes,
  saveDraft,
  searchStudents,
  submitRequest,
} from '@/services/class-leave';
import {
  demoStudentCode,
  demoStudentId,
  demoUserId,
  seedDemoData,
} from '@/services/demo-seed';
import { loadCurrentUser, type CurrentUser } from '@/services/identity';
import { departmentId } from '@/services/reference-data';
import { createTestContext } from '../helpers/context';

// วันจันทร์และวันอังคารของสัปดาห์เดียวกัน (ไม่ขึ้นกับวันที่รันการทดสอบ)
const MONDAY = '2026-12-07';
const TUESDAY = '2026-12-08';
const SATURDAY = '2026-12-12';
const CHAIN = ['head-sci', 'staff', 'academic-head', 'deputy', 'director'];

type Context = ReturnType<typeof createTestContext>;

describe('class leave: request → approval → teacher notice', () => {
  let ctx: Context;
  const users: Record<string, CurrentUser> = {};

  const as = (key: string) => {
    const user = users[key];
    if (!user) throw new Error(`unknown persona ${key}`);
    return user;
  };

  const draft = (overrides: Partial<ClassLeaveDraftInput> = {}): ClassLeaveDraftInput => ({
    ...EMPTY_CLASS_LEAVE_DRAFT,
    activityName: 'แข่งขันตอบปัญหาวิทยาศาสตร์',
    activityType: 'academic_competition',
    objective: 'เข้าร่วมการแข่งขัน',
    rationale: 'ได้รับหนังสือเชิญจากหน่วยงานจัดการแข่งขัน',
    location: 'หอประชุม',
    departmentId: departmentId('SCI'),
    // นักเรียนข้ามห้อง: ม.4/1 จำนวน 3 คน และ ม.5/2 จำนวน 2 คน
    studentIds: [
      demoStudentId(4, 1, 1),
      demoStudentId(4, 1, 2),
      demoStudentId(4, 1, 3),
      demoStudentId(5, 2, 1),
      demoStudentId(5, 2, 2),
    ],
    days: [{ date: MONDAY, mode: 'periods', periodNos: [1, 2] }],
    formStep: 5,
    ...overrides,
  });

  async function submitNew(key = 'teacher-sci', overrides: Partial<ClassLeaveDraftInput> = {}) {
    const created = await createDraft(ctx.db, as(key), draft(overrides));
    const submitted = await submitRequest(ctx.db, as(key), created.id, created.version);
    return { ...created, ...submitted };
  }

  async function approveAll(approvalRequestId: string, chain = CHAIN) {
    for (const key of chain) {
      const request = await ctx.db.repo(ApprovalRequests).byId(approvalRequestId);
      if (!request || request.status !== 'pending') break;
      await decideClassLeave(ctx.db, as(key), {
        requestId: approvalRequestId,
        decision: 'approve',
        expectedVersion: request.version,
      });
    }
  }

  beforeEach(async () => {
    ctx = createTestContext();
    await seedDemoData(ctx.db, { samples: false });
    for (const key of [...CHAIN, 'teacher-sci', 'teacher-mat', 'teacher-tha', 'admin', 'auditor']) {
      const user = await loadCurrentUser(ctx.db, demoUserId(key));
      if (!user) throw new Error(`persona ${key} was not seeded`);
      users[key] = user;
    }
  });

  it('seeds complete sample data through the real services', async () => {
    const seeded = createTestContext();
    await seedDemoData(seeded.db);
    const requests = await seeded.db.repo(ClassLeaveRequests).all();
    expect(requests.map((r) => r.status).sort()).toEqual(
      ['approved', 'draft', 'pending_review', 'pending_review', 'returned'].sort(),
    );
    expect(new Set(requests.map((r) => r.reference_no)).size).toBe(5);
  });

  it('finds students across classrooms and keeps leading zeros in codes', async () => {
    const byCode = await searchStudents(ctx.db, as('teacher-sci'), { q: demoStudentCode(4, 1, 1) });
    expect(byCode.students[0]).toMatchObject({ code: '04101', classroomName: 'ม.4/1' });

    const room = await searchStudents(ctx.db, as('teacher-sci'), { classroomIds: ['demo-room-5-2'] });
    expect(room.total).toBe(15);

    const resolved = await resolveStudentCodes(ctx.db, as('teacher-sci'), ['04101', '4101', '05201', '04101', '99999']);
    expect(resolved.matched.map((s) => s.code)).toEqual(['04101', '05201']);
    // "4101" ไม่ถูกตีความเป็น "04101"
    expect(resolved.notFound).toEqual(['4101', '99999']);
    expect(resolved.duplicates).toEqual(['04101']);
  });

  it('computes affected periods, courses and teachers from the timetable', async () => {
    const impact = await previewImpact(ctx.db, as('teacher-sci'), draft(), null);
    expect(impact.verification).toBe('auto');
    expect(impact.totalPeriods).toBe(2);
    // 2 ห้อง × 2 คาบ
    expect(impact.slots).toHaveLength(4);
    expect(impact.slots.every((slot) => slot.courseName && slot.teacherId)).toBe(true);
    expect(impact.slots.find((s) => s.classroomName === 'ม.4/1')?.studentIds).toHaveLength(3);
    expect(impact.periodsByStudent[demoStudentId(4, 1, 1)]).toBe(2);
    expect(impact.teachers.length).toBeGreaterThan(0);
    expect(impact.conflicts).toEqual([]);
  });

  it('expands half-day and full-day requests and flags weekends', async () => {
    const impact = await previewImpact(
      ctx.db,
      as('teacher-sci'),
      draft({
        days: [
          { date: MONDAY, mode: 'half_day_am', periodNos: [] },
          { date: TUESDAY, mode: 'full_day', periodNos: [] },
          { date: SATURDAY, mode: 'periods', periodNos: [1] },
        ],
      }),
      null,
    );
    expect(impact.days.map((d) => d.periodNos)).toEqual([[1, 2, 3, 4], [1, 2, 3, 4, 5, 6, 7, 8], [1]]);
    expect(impact.totalPeriods).toBe(13);
    expect(impact.weekendDates).toEqual([SATURDAY]);
    // วันเสาร์ไม่มีตารางเรียน จึงไม่นับเป็นคาบที่กระทบ
    expect(impact.slots.filter((s) => s.date === SATURDAY)).toEqual([]);
  });

  it('issues unique sequential reference numbers even when drafts are created together', async () => {
    const created = await Promise.all(
      Array.from({ length: 12 }, () => createDraft(ctx.db, as('teacher-sci'), draft())),
    );
    const numbers = created.map((c) => c.referenceNo).sort();
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[0]).toBe('CL-2569-0001');
    expect(numbers[11]).toBe('CL-2569-0012');
  });

  it('returns the same draft when the create request is retried with the same key', async () => {
    const first = await createDraft(ctx.db, as('teacher-sci'), draft(), 'form-123');
    const retry = await createDraft(ctx.db, as('teacher-sci'), draft(), 'form-123');
    expect(retry).toEqual(first);
    expect(await ctx.db.repo(ClassLeaveRequests).count()).toBe(1);
  });

  it('saves drafts with optimistic locking', async () => {
    const created = await createDraft(ctx.db, as('teacher-sci'), draft({ studentIds: [] }));
    const saved = await saveDraft(ctx.db, as('teacher-sci'), created.id, draft(), created.version);
    expect(saved.version).toBe(2);
    // แท็บเก่าที่ยังถือเวอร์ชัน 1 บันทึกทับไม่ได้
    await expect(
      saveDraft(ctx.db, as('teacher-sci'), created.id, draft({ activityName: 'ทับ' }), created.version),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await ctx.db.repo(ClassLeaveRequests).byId(created.id))?.student_count).toBe(5);
  });

  it('refuses to submit an incomplete request', async () => {
    const created = await createDraft(ctx.db, as('teacher-sci'), draft({ studentIds: [], days: [] }));
    await expect(submitRequest(ctx.db, as('teacher-sci'), created.id, created.version)).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { studentIds: expect.any(String), days: expect.any(String) },
    });
    expect((await ctx.db.repo(ClassLeaveRequests).byId(created.id))?.status).toBe('draft');
    expect(await ctx.db.repo(ApprovalRequests).count()).toBe(0);
  });

  it('routes a submitted request to the department head and snapshots students by version', async () => {
    const submitted = await submitNew();
    expect(submitted.status).toBe('pending_review');
    expect(submitted.waitingAt).toBe('หัวหน้ากลุ่มสาระตรวจสอบ');

    const students = await ctx.db.repo(ClassLeaveStudents).filter((s) => s.request_id === submitted.id);
    expect(students).toHaveLength(5);
    expect(students.every((s) => s.request_version === 1)).toBe(true);
    expect(students[0]).toMatchObject({ student_code: '04101', classroom_name: 'ม.4/1' });

    const inbox = await listApprovals(ctx.db, as('head-sci'), [classLeaveAdapter], 'awaiting_me');
    expect(inbox.map((item) => item.id)).toEqual([submitted.approvalRequestId]);
    // ผู้พิจารณาขั้นถัดไปยังไม่เห็นใน “รอฉันพิจารณา”
    expect(await listApprovals(ctx.db, as('director'), [classLeaveAdapter], 'awaiting_me')).toEqual([]);

    const notified = await ctx.db.repo(Notifications).filter((n) => n.type === 'approval_pending');
    expect(notified.map((n) => n.user_id)).toEqual([demoUserId('head-sci')]);
  });

  it('skips the department step when the department has no head', async () => {
    const submitted = await submitNew('teacher-mat', { departmentId: departmentId('MAT') });
    expect(submitted.waitingAt).toBe('สำนักงานวิชาการตรวจสอบ');
    const actions = await ctx.db.repo(ApprovalActions).filter((a) => a.request_id === submitted.approvalRequestId);
    expect(actions.find((a) => a.action === 'skip')).toMatchObject({ step_order: 1, actor_id: null });
  });

  it('completes the full approval chain, then notifies only the teachers involved', async () => {
    const submitted = await submitNew();
    await approveAll(submitted.approvalRequestId);

    const request = await ctx.db.repo(ClassLeaveRequests).byId(submitted.id);
    expect(request).toMatchObject({ status: 'approved' });
    expect(request?.approved_at).toBeTruthy();

    const actions = await ctx.db.repo(ApprovalActions).filter((a) => a.request_id === submitted.approvalRequestId);
    expect(actions.filter((a) => a.action === 'approve').map((a) => a.actor_id)).toEqual(CHAIN.map(demoUserId));
    expect(actions.every((a) => a.subject_version === 1)).toBe(true);

    const impacts = await ctx.db.repo(ClassLeaveImpacts).filter((i) => i.request_id === submitted.id);
    const teacherUsers = new Set(impacts.map((i) => i.teacher_user_id).filter(Boolean));
    const recipients = await ctx.db.repo(ClassLeaveRecipients).filter((r) => r.request_id === submitted.id);
    for (const userId of teacherUsers) {
      if (userId !== demoUserId('teacher-sci')) {
        expect(recipients.some((r) => r.user_id === userId)).toBe(true);
      }
    }
    // ผู้จัดทำไม่ถูกแจ้งซ้ำในฐานะครูผู้สอน
    expect(recipients.some((r) => r.user_id === demoUserId('teacher-sci'))).toBe(false);

    const notices = await ctx.db.repo(Notifications).filter((n) => n.type === 'class_leave');
    expect(new Set(notices.map((n) => n.user_id))).toEqual(new Set(recipients.map((r) => r.user_id)));
    // ข้อความแจ้งเตือนไม่มีชื่อหรือรหัสนักเรียน
    expect(notices.every((n) => !/นักเรียนสาธิต|0\d{4}/.test(`${n.title} ${n.body}`))).toBe(true);

    const events = await ctx.db.repo(CalendarEvents).filter((e) => e.source_id === submitted.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'class_leave', source_type: 'class_leave' });
  });

  it('shows a recipient only their own students and periods, and hides the request from everyone else', async () => {
    const submitted = await submitNew();
    await approveAll(submitted.approvalRequestId);
    const persona = async (key: string) => {
      const user = await loadCurrentUser(ctx.db, demoUserId(key));
      if (!user) throw new Error(`persona ${key} missing`);
      return user;
    };
    const full = await getRequestDetail(ctx.db, as('teacher-sci'), submitted.id);
    expect(full.scopedToViewer).toBe(false);
    expect(full.students).toHaveLength(5);
    expect(full.impacts).toHaveLength(4);

    // ครูสังคมศึกษาสอน ม.5/2 คาบ 1 วันจันทร์ (ตามตารางสอนสาธิต) → เห็นเฉพาะนักเรียน ม.5/2 และคาบของตน
    const subjectTeacher = await persona('teacher-soc');
    const scoped = await getRequestDetail(ctx.db, subjectTeacher, submitted.id);
    expect(scoped.scopedToViewer).toBe(true);
    expect(scoped.draft.studentIds).toEqual([]);
    expect(scoped.students.map((s) => s.classroomName)).toEqual(['ม.5/2', 'ม.5/2']);
    expect(scoped.impacts).toEqual([expect.objectContaining({ classroomName: 'ม.5/2', periodNo: 1, isMine: true })]);
    expect(scoped.canEdit).toBe(false);
    expect(scoped.canCancel).toBe(false);
    expect(scoped.acknowledgement).toBeNull();
    expect(scoped.canAcknowledge).toBe(true);

    // ครูที่ปรึกษา ม.4/1 → เห็นนักเรียนในห้องของตนและทุกคาบของห้องนั้น
    const advisor = await persona('teacher-occ');
    const advised = await getRequestDetail(ctx.db, advisor, submitted.id);
    expect(advised.scopedToViewer).toBe(true);
    expect(advised.students.map((s) => s.classroomName)).toEqual(['ม.4/1', 'ม.4/1', 'ม.4/1']);
    expect(advised.impacts.map((i) => i.isMine)).toEqual([false, false]);

    await acknowledgeRequest(ctx.db, subjectTeacher, submitted.id);
    await acknowledgeRequest(ctx.db, subjectTeacher, submitted.id); // กดซ้ำไม่เกิดแถวซ้ำ
    expect((await getRequestDetail(ctx.db, subjectTeacher, submitted.id)).acknowledgedAt).toBeTruthy();
    expect((await getRequestDetail(ctx.db, as('teacher-sci'), submitted.id)).acknowledgement).toEqual({
      total: 5,
      acknowledged: 1,
    });

    // ครูที่ไม่เกี่ยวข้อง: เปลี่ยนรหัสใน URL แล้วได้ "ไม่พบ" เหมือนรหัสที่ไม่มีอยู่จริง
    const outsider = as('teacher-tha');
    await expect(getRequestDetail(ctx.db, outsider, submitted.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(acknowledgeRequest(ctx.db, outsider, submitted.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getRequestDetail(ctx.db, as('teacher-sci'), 'does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps other teachers out of a colleague’s draft', async () => {
    const created = await createDraft(ctx.db, as('teacher-sci'), draft());
    await expect(getRequestDetail(ctx.db, as('teacher-mat'), created.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(saveDraft(ctx.db, as('teacher-mat'), created.id, draft(), created.version)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(submitRequest(ctx.db, as('teacher-mat'), created.id, created.version)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await listRequests(ctx.db, as('teacher-mat'))).map((r) => r.id)).not.toContain(created.id);
    // เจ้าหน้าที่สำนักงานเห็นทั้งหมดตาม Permission Matrix
    expect((await listRequests(ctx.db, as('staff'))).map((r) => r.id)).toContain(created.id);
    // ผู้ตรวจสอบดูได้แต่แก้ไขไม่ได้
    expect((await getRequestDetail(ctx.db, as('auditor'), created.id)).canEdit).toBe(false);
    await expect(saveDraft(ctx.db, as('auditor'), created.id, draft(), created.version)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets only one of two simultaneous decisions succeed', async () => {
    const submitted = await submitNew();
    await approveAll(submitted.approvalRequestId, ['head-sci']);
    const request = await ctx.db.repo(ApprovalRequests).byId(submitted.approvalRequestId);
    if (!request) throw new Error('missing approval request');
    const decision = (decisionType: 'approve' | 'return') =>
      decideClassLeave(ctx.db, as('staff'), {
        requestId: request.id,
        decision: decisionType,
        comment: 'ตรวจสอบแล้ว',
        expectedVersion: request.version,
      });
    const results = await Promise.allSettled([decision('approve'), decision('return')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CONFLICT' });
    const actions = await ctx.db.repo(ApprovalActions).filter((a) => a.request_id === request.id && a.step_order === 2);
    expect(actions).toHaveLength(1);
  });

  it('enforces who may decide', async () => {
    const submitted = await submitNew();
    const request = await ctx.db.repo(ApprovalRequests).byId(submitted.approvalRequestId);
    if (!request) throw new Error('missing approval request');
    const attempt = (key: string) =>
      decideClassLeave(ctx.db, as(key), { requestId: request.id, decision: 'approve', expectedVersion: request.version });

    // ผู้เสนออนุมัติเอกสารของตนเองไม่ได้
    await expect(attempt('teacher-sci')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Super Admin ไม่มีสิทธิ์อนุมัติเอกสารโดยตำแหน่ง
    await expect(attempt('admin')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // ผู้อำนวยการมีสิทธิ์อนุมัติ แต่ยังไม่ถึงขั้นของตน
    await expect(attempt('director')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // ต้องระบุเหตุผลเมื่อส่งกลับ
    await expect(
      decideClassLeave(ctx.db, as('head-sci'), { requestId: request.id, decision: 'return', comment: ' ', expectedVersion: request.version }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await ctx.db.repo(ApprovalRequests).byId(request.id))?.status).toBe('pending');
  });

  it('creates a new version when a returned request is revised and resubmitted', async () => {
    const submitted = await submitNew();
    const request = await ctx.db.repo(ApprovalRequests).byId(submitted.approvalRequestId);
    if (!request) throw new Error('missing approval request');
    await decideClassLeave(ctx.db, as('head-sci'), {
      requestId: request.id,
      decision: 'return',
      comment: 'กรุณาเพิ่มนักเรียนให้ครบ',
      expectedVersion: request.version,
    });
    const returned = await ctx.db.repo(ClassLeaveRequests).byId(submitted.id);
    expect(returned?.status).toBe('returned');
    expect((await ctx.db.repo(Notifications).filter((n) => n.type === 'approval_returned')).map((n) => n.user_id)).toEqual([demoUserId('teacher-sci')]);

    const revised = draft({ studentIds: [...draft().studentIds, demoStudentId(4, 1, 4)] });
    const saved = await saveDraft(ctx.db, as('teacher-sci'), submitted.id, revised, returned?.version ?? 0);
    const again = await submitRequest(ctx.db, as('teacher-sci'), submitted.id, saved.version);
    expect(again.requestVersion).toBe(2);
    expect(again.approvalRequestId).not.toBe(submitted.approvalRequestId);

    const students = await ctx.db.repo(ClassLeaveStudents).filter((s) => s.request_id === submitted.id);
    expect(students.filter((s) => s.request_version === 1)).toHaveLength(5);
    expect(students.filter((s) => s.request_version === 2)).toHaveLength(6);
    expect((await getRequestDetail(ctx.db, as('teacher-sci'), submitted.id)).students).toHaveLength(6);

    const detail = await getApprovalDetail(ctx.db, as('head-sci'), [classLeaveAdapter], again.approvalRequestId);
    expect(detail.timeline[0]).toMatchObject({ action: 'submit', subjectVersion: 2 });
    expect(detail.canDecide).toBe(true);
  });

  it('requires re-approval when an approved request is changed', async () => {
    const submitted = await submitNew();
    await approveAll(submitted.approvalRequestId);
    await expect(saveDraft(ctx.db, as('teacher-sci'), submitted.id, draft(), 99)).rejects.toMatchObject({ code: 'CONFLICT' });

    await reopenRequest(ctx.db, as('teacher-sci'), submitted.id, 'เปลี่ยนรายชื่อนักเรียนตัวแทน');
    const reopened = await ctx.db.repo(ClassLeaveRequests).byId(submitted.id);
    expect(reopened).toMatchObject({ status: 'draft', request_version: 1 });
    const saved = await saveDraft(ctx.db, as('teacher-sci'), submitted.id, draft({ studentIds: [demoStudentId(4, 1, 9)] }), reopened?.version ?? 0);
    const again = await submitRequest(ctx.db, as('teacher-sci'), submitted.id, saved.version);
    expect(again).toMatchObject({ requestVersion: 2, status: 'pending_review' });
    // เวอร์ชันที่อนุมัติไปแล้วยังอยู่ครบ ไม่ถูกเขียนทับ
    const v1 = await ctx.db.repo(ClassLeaveStudents).filter((s) => s.request_id === submitted.id && s.request_version === 1);
    expect(v1).toHaveLength(5);
  });

  it('detects students already committed to another activity in the same periods', async () => {
    await submitNew();
    const overlap = await previewImpact(
      ctx.db,
      as('teacher-mat'),
      draft({ studentIds: [demoStudentId(4, 1, 1), demoStudentId(6, 1, 1)], days: [{ date: MONDAY, mode: 'periods', periodNos: [2, 3] }] }),
      null,
    );
    expect(overlap.conflicts).toEqual([
      expect.objectContaining({ studentId: demoStudentId(4, 1, 1), date: MONDAY, periodNo: 2, referenceNo: 'CL-2569-0001' }),
    ]);
  });

  it('counts cumulative approved periods per student without judging them', async () => {
    const first = await submitNew();
    await approveAll(first.approvalRequestId);
    const impact = await previewImpact(ctx.db, as('teacher-sci'), draft({ days: [{ date: TUESDAY, mode: 'periods', periodNos: [5] }] }), null);
    expect(impact.approvedPeriodsByStudent[demoStudentId(4, 1, 1)]).toBe(2);
    expect(impact.periodsByStudent[demoStudentId(4, 1, 1)]).toBe(1);
  });

  it('lists today’s activities for the people involved only', async () => {
    const submitted = await submitNew();
    await approveAll(submitted.approvalRequestId);
    const owner = await listTodayActivities(ctx.db, as('teacher-sci'), MONDAY);
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ relation: 'owner', studentCount: 5, periodNos: [1, 2] });
    expect(await listTodayActivities(ctx.db, as('teacher-sci'), TUESDAY)).toEqual([]);
    expect((await listTodayActivities(ctx.db, as('staff'), MONDAY))[0]?.relation).toBe('staff');

    const recipients = await ctx.db.repo(ClassLeaveRecipients).filter((r) => r.request_id === submitted.id);
    for (const persona of Object.values(users)) {
      const visible = await listTodayActivities(ctx.db, persona, MONDAY);
      const involved =
        persona.id === demoUserId('teacher-sci') ||
        recipients.some((r) => r.user_id === persona.id) ||
        persona.permissions.canAll('classLeave.requests', 'view');
      expect(visible.length > 0, persona.displayName).toBe(involved);
    }
  });

  it('cancels drafts directly and pending requests through the approval record', async () => {
    const created = await createDraft(ctx.db, as('teacher-sci'), draft());
    await cancelRequest(ctx.db, as('teacher-sci'), created.id, 'กิจกรรมถูกเลื่อน');
    expect((await ctx.db.repo(ClassLeaveRequests).byId(created.id))?.status).toBe('cancelled');

    const submitted = await submitNew();
    await expect(cancelRequest(ctx.db, as('teacher-mat'), submitted.id, 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await cancelRequest(ctx.db, as('teacher-sci'), submitted.id, 'ผู้จัดยกเลิกการแข่งขัน');
    expect((await ctx.db.repo(ClassLeaveRequests).byId(submitted.id))?.status).toBe('cancelled');
    expect((await ctx.db.repo(ApprovalRequests).byId(submitted.approvalRequestId))?.status).toBe('cancelled');
  });

  it('writes an audit trail for every state change', async () => {
    const submitted = await submitNew();
    await approveAll(submitted.approvalRequestId);
    const actions = (await ctx.db.repo(AuditLogs).all()).map((log) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining(['classLeave.createDraft', 'approvals.submit', 'approvals.approve']),
    );
    expect(actions.filter((a) => a === 'approvals.approve')).toHaveLength(5);
    const logs = await ctx.db.repo(AuditLogs).all();
    expect(logs.every((log) => log.row_hash && log.prev_hash)).toBe(true);
  });
});
