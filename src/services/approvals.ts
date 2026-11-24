/**
 * Approval Workflow Engine กลาง (ข้อ 12 / 02.3) — ทุก Module ที่ต้องเสนออนุมัติใช้กลไกนี้ร่วมกัน
 *
 * - ขั้นตอนกำหนดได้ตามประเภทเอกสาร (ApprovalWorkflows / ApprovalSteps) ไม่บังคับให้ผ่านทุกตำแหน่ง
 * - ตอนส่ง ขั้นตอนถูกถ่ายสำเนาไว้กับคำขอ การแก้ Workflow ภายหลังไม่กระทบคำขอที่ค้างอยู่
 * - ทุกการดำเนินการบันทึกผู้ดำเนินการ เวลา ความเห็น และเวอร์ชันของเอกสารที่พิจารณา
 * - การเปลี่ยนสถานะตรวจเวอร์ชันของคำขอใน Write Gateway: สองคนกดพร้อมกัน สำเร็จได้คนเดียว
 * - การอนุมัติในระบบ "ไม่ใช่" การลงนามอิเล็กทรอนิกส์ที่มีผลทางราชการ และระบบไม่ใช้ภาพลายเซ็นของใคร
 *
 * Module เจ้าของเอกสารส่ง `SubjectAdapter` เข้ามาเพื่อปรับสถานะของเอกสารตนเองในคำสั่งเขียนเดียวกัน
 */
import 'server-only';
import type { ResourceKey } from '@/config/modules';
import type { DocumentStatus } from '@/config/reference';
import type { RoleId } from '@/config/roles';
import { conflict, forbidden, notFound, validation } from '@/lib/errors';
import type { Db, UnitOfWork } from '@/repositories/db';
import {
  ApprovalActions,
  ApprovalDelegations,
  ApprovalRequests,
  ApprovalSteps,
  ApprovalWorkflows,
  type ApprovalStepSnapshot,
} from '@/schemas/database/document';
import { UserRoles, Users } from '@/schemas/database/master';
import type { RowOf } from '@/schemas/database/types';
import type { CurrentUser } from './identity';
import { addNotifications, type NotificationInput } from './notifications';

export type ApprovalRequestRow = RowOf<typeof ApprovalRequests>;
export type ApprovalActionRow = RowOf<typeof ApprovalActions>;
export type ApprovalDecision = 'approve' | 'reject' | 'return';

export interface ApprovalSubject {
  type: string;
  id: string;
  /** เวอร์ชันของเนื้อหาที่ส่งพิจารณา */
  version: number;
  refNo: string;
  title: string;
  requesterId: string;
  departmentId: string | null;
  unitId: string | null;
}

export type ApprovalEvent = 'submitted' | 'advanced' | 'approved' | 'rejected' | 'returned' | 'cancelled';

export interface SubjectAdapter {
  type: string;
  /** ระบบย่อยที่ใช้ตัดสินสิทธิ์ approve / reject / return */
  resource: ResourceKey;
  /** ชื่อประเภทเอกสารสำหรับข้อความแจ้งเตือน */
  label: string;
  /** เส้นทางของหน้ารายละเอียดคำขออนุมัติ */
  linkPath(requestId: string): string;
  /** ปรับสถานะของเอกสารต้นทางใน UnitOfWork เดียวกัน */
  applyStatus(
    db: Db,
    uow: UnitOfWork,
    subject: ApprovalSubject,
    status: DocumentStatus,
    context: { event: ApprovalEvent; requestId: string; actorId: string | null },
  ): Promise<void>;
}

/** สถานะที่แสดงของเอกสารระหว่างรอพิจารณา ขึ้นกับชนิดของขั้นปัจจุบัน */
export function pendingStatusFor(step: ApprovalStepSnapshot | undefined): DocumentStatus {
  if (!step) return 'submitted';
  return step.kind === 'review' ? 'pending_review' : 'in_consideration';
}

interface Directory {
  activeUserIds: Set<string>;
  roles: readonly RowOf<typeof UserRoles>[];
  delegations: readonly RowOf<typeof ApprovalDelegations>[];
}

async function loadDirectory(db: Db): Promise<Directory> {
  const [users, roles, delegations] = await Promise.all([
    db.repo(Users).all(),
    db.repo(UserRoles).all(),
    db.repo(ApprovalDelegations).all(),
  ]);
  return {
    activeUserIds: new Set(users.filter((user) => user.status === 'active').map((user) => user.id)),
    roles: roles.filter((role) => role.status === 'active'),
    delegations: delegations.filter((delegation) => delegation.status === 'active'),
  };
}

/** ผู้มีสิทธิ์พิจารณาในขั้นหนึ่ง ณ เวลาที่ถาม (ไม่รวมผู้พิจารณาแทน) */
function resolveApprovers(
  directory: Directory,
  step: Pick<ApprovalStepSnapshot, 'approverType' | 'approverRef'>,
  subject: Pick<ApprovalSubject, 'departmentId'>,
): string[] {
  const withRole = (roleId: RoleId, match?: (row: RowOf<typeof UserRoles>) => boolean) =>
    directory.roles
      .filter((row) => row.role_id === roleId && (!match || match(row)))
      .map((row) => row.user_id);

  let ids: string[] = [];
  switch (step.approverType) {
    case 'user':
      ids = step.approverRef ? [step.approverRef] : [];
      break;
    case 'role':
      ids = step.approverRef ? withRole(step.approverRef as RoleId) : [];
      break;
    case 'requester_department_head':
      ids = subject.departmentId
        ? withRole('department_head', (row) => row.department_id === subject.departmentId)
        : [];
      break;
    case 'unit_head':
      ids = step.approverRef ? withRole('unit_head', (row) => row.unit_id === step.approverRef) : [];
      break;
  }
  return Array.from(new Set(ids)).filter((id) => directory.activeUserIds.has(id));
}

/** ผู้ที่ userId พิจารณาแทนได้ในขณะนี้ สำหรับเอกสารชนิดที่กำหนด */
function delegatorsOf(directory: Directory, userId: string, subjectType: string, at: string): string[] {
  return directory.delegations
    .filter(
      (d) =>
        d.delegate_id === userId &&
        d.starts_at <= at &&
        d.ends_at >= at &&
        (!d.subject_type || d.subject_type === subjectType),
    )
    .map((d) => d.delegator_id);
}

export interface Eligibility {
  eligible: boolean;
  /** ระบุเมื่อดำเนินการแทนผู้อื่น */
  onBehalfOf: string | null;
}

function eligibilityFor(
  directory: Directory,
  request: Pick<ApprovalRequestRow, 'subject_type' | 'requester_id' | 'department_id'>,
  step: ApprovalStepSnapshot,
  userId: string,
  at: string,
  allowSelf: boolean,
): Eligibility {
  if (userId === request.requester_id && !allowSelf) return { eligible: false, onBehalfOf: null };
  const approvers = resolveApprovers(directory, step, { departmentId: request.department_id });
  if (approvers.includes(userId)) return { eligible: true, onBehalfOf: null };
  const delegator = delegatorsOf(directory, userId, request.subject_type, at).find(
    (id) => approvers.includes(id) && id !== request.requester_id,
  );
  return delegator ? { eligible: true, onBehalfOf: delegator } : { eligible: false, onBehalfOf: null };
}

async function findWorkflow(db: Db, subjectType: string) {
  const workflows = await db
    .repo(ApprovalWorkflows)
    .filter((row) => row.subject_type === subjectType && row.is_active);
  const workflow = workflows.find((row) => row.is_default) ?? workflows[0];
  if (!workflow) {
    throw validation(
      'ยังไม่ได้ตั้งค่าขั้นตอนการอนุมัติสำหรับเอกสารประเภทนี้ กรุณาติดต่อเจ้าหน้าที่สำนักงานวิชาการ',
    );
  }
  const steps = (
    await db.repo(ApprovalSteps).filter((row) => row.workflow_id === workflow.id && row.is_active)
  ).sort((a, b) => a.step_order - b.step_order);
  return { workflow, steps };
}

export interface SubmitResult {
  requestId: string;
  status: DocumentStatus;
  /** ชื่อขั้นแรกที่รอพิจารณา (null เมื่อไม่มีขั้นใดต้องพิจารณา) */
  waitingAt: string | null;
}

/**
 * ส่งเอกสารเข้าสู่การพิจารณา — เพิ่มคำสั่งเข้า UnitOfWork ของผู้เรียก (ผู้เรียกเป็นผู้ commit)
 * ถ้าขั้นใดไม่มีผู้พิจารณา: ข้าม (on_missing = skip) พร้อมบันทึกเหตุผล หรือปฏิเสธการส่ง (block)
 */
export async function submitForApproval(
  db: Db,
  uow: UnitOfWork,
  adapter: SubjectAdapter,
  subject: ApprovalSubject,
): Promise<SubmitResult> {
  const { workflow, steps } = await findWorkflow(db, subject.type);
  const directory = await loadDirectory(db);
  const requests = db.repo(ApprovalRequests);
  const actions = db.repo(ApprovalActions);

  const active = await requests.find(
    (row) => row.subject_type === subject.type && row.subject_id === subject.id && row.status === 'pending',
  );
  if (active) throw conflict('เอกสารนี้อยู่ระหว่างการพิจารณาอยู่แล้ว');

  const snapshot: ApprovalStepSnapshot[] = steps.map((step) => {
    const base: ApprovalStepSnapshot = {
      order: step.step_order,
      name: step.name,
      kind: step.step_kind,
      approverType: step.approver_type,
      approverRef: step.approver_ref,
      approverIds: [],
      state: 'waiting',
    };
    const approvers = resolveApprovers(directory, base, subject).filter(
      (id) => step.allow_self || id !== subject.requesterId,
    );
    if (approvers.length > 0) return { ...base, approverIds: approvers };
    if (step.on_missing === 'block') {
      throw validation(
        `ขั้นตอน “${step.name}” ยังไม่มีผู้พิจารณา จึงส่งเอกสารไม่ได้ กรุณาติดต่อเจ้าหน้าที่สำนักงานวิชาการ`,
      );
    }
    const selfOnly = resolveApprovers(directory, base, subject).includes(subject.requesterId);
    return {
      ...base,
      state: 'skipped',
      skippedReason: selfOnly ? 'ผู้เสนอเป็นผู้พิจารณาในขั้นตอนนี้' : 'ไม่มีผู้พิจารณาในขั้นตอนนี้',
    };
  });

  const first = snapshot.find((step) => step.state === 'waiting');
  if (first) first.state = 'current';
  const finished = !first;
  const status: DocumentStatus = finished ? 'approved' : pendingStatusFor(first);

  const request = requests.insert({
    workflow_id: workflow.id,
    workflow_version: workflow.workflow_version,
    subject_type: subject.type,
    subject_id: subject.id,
    subject_version: subject.version,
    subject_ref_no: subject.refNo,
    subject_title: subject.title,
    requester_id: subject.requesterId,
    department_id: subject.departmentId,
    unit_id: subject.unitId,
    status: finished ? 'approved' : 'pending',
    current_step: first?.order ?? 0,
    total_steps: snapshot.length,
    steps: snapshot,
    submitted_at: uow.now,
    completed_at: finished ? uow.now : null,
  });
  uow.add(request);
  uow.add(
    actions.insert({
      request_id: request.id,
      subject_type: subject.type,
      subject_id: subject.id,
      subject_version: subject.version,
      step_order: 0,
      step_name: 'ส่งเอกสาร',
      action: 'submit',
      actor_id: subject.requesterId,
    }),
  );
  for (const step of snapshot.filter((s) => s.state === 'skipped')) {
    uow.add(
      actions.insert({
        request_id: request.id,
        subject_type: subject.type,
        subject_id: subject.id,
        subject_version: subject.version,
        step_order: step.order,
        step_name: step.name,
        action: 'skip',
        actor_id: null,
        comment: step.skippedReason ?? null,
      }),
    );
  }

  await adapter.applyStatus(db, uow, subject, status, {
    event: finished ? 'approved' : 'submitted',
    requestId: request.id,
    actorId: subject.requesterId,
  });

  if (first) {
    await addNotifications(
      db,
      uow,
      first.approverIds.map((userId) => ({
        userId,
        type: 'approval_pending',
        title: `${adapter.label}รอพิจารณา: ${subject.title}`,
        body: `${subject.refNo} · ขั้นตอน ${first.name}`,
        linkPath: adapter.linkPath(request.id),
        entityType: 'approval_request',
        entityId: request.id,
        dedupeKey: `approval:${request.id}:step:${first.order}`,
      })),
    );
  }
  uow.audit({
    action: 'approvals.submit',
    category: 'submit',
    resource: adapter.resource,
    entityType: subject.type,
    entityId: subject.id,
    summary: `ส่ง${adapter.label} ${subject.refNo} เข้าสู่การพิจารณา (เวอร์ชัน ${subject.version})`,
    metadata: { requestId: request.id, workflow: workflow.code, steps: snapshot.length },
  });
  return { requestId: request.id, status, waitingAt: first?.name ?? null };
}

function subjectOf(request: ApprovalRequestRow): ApprovalSubject {
  return {
    type: request.subject_type,
    id: request.subject_id,
    version: request.subject_version,
    refNo: request.subject_ref_no ?? '',
    title: request.subject_title,
    requesterId: request.requester_id,
    departmentId: request.department_id,
    unitId: request.unit_id,
  };
}

function recordContextOf(request: ApprovalRequestRow) {
  const current = request.steps.find((step) => step.order === request.current_step);
  return {
    ownerIds: [request.requester_id],
    participantIds: request.steps.flatMap((step) => step.approverIds).concat(current?.approverIds ?? []),
    departmentId: request.department_id,
    unitId: request.unit_id,
  };
}

export interface DecisionInput {
  requestId: string;
  decision: ApprovalDecision;
  comment?: string | null;
  /** เวอร์ชันของคำขอที่ผู้ใช้เห็นขณะตัดสินใจ */
  expectedVersion: number;
  idempotencyKey?: string;
}

export interface DecisionResult {
  requestStatus: ApprovalRequestRow['status'];
  subjectStatus: DocumentStatus;
  /** true เมื่ออนุมัติครบทุกขั้นในครั้งนี้ */
  finalApproval: boolean;
  subject: ApprovalSubject;
}

const DECISION_LABEL: Record<ApprovalDecision, string> = {
  approve: 'อนุมัติ',
  reject: 'ไม่อนุมัติ',
  return: 'ส่งกลับแก้ไข',
};

/**
 * พิจารณาเอกสารในขั้นปัจจุบัน
 * ผู้ดำเนินการต้อง (1) มีสิทธิ์ตาม Permission Matrix ต่อเอกสารนี้ และ (2) เป็นผู้พิจารณาของขั้นปัจจุบัน
 * `extend` ให้ Module เจ้าของเอกสารเพิ่มคำสั่งของตนเองในคำสั่งเขียนเดียวกัน (เช่น แจ้งครูผู้สอนเมื่ออนุมัติครบ)
 */
export async function decide(
  db: Db,
  user: CurrentUser,
  adapter: SubjectAdapter,
  input: DecisionInput,
  extend?: (uow: UnitOfWork, result: DecisionResult) => Promise<void>,
): Promise<DecisionResult> {
  const requests = db.repo(ApprovalRequests);
  const request = await requests.byId(input.requestId);
  if (!request || request.subject_type !== adapter.type) throw notFound('ไม่พบคำขออนุมัติ');
  if (!user.permissions.canOnRecord(adapter.resource, input.decision, recordContextOf(request))) {
    throw forbidden('คุณไม่มีสิทธิ์พิจารณาเอกสารนี้');
  }
  if (request.status !== 'pending') {
    throw conflict('เอกสารนี้ได้รับการพิจารณาไปแล้ว กรุณาโหลดหน้านี้ใหม่');
  }
  const comment = input.comment?.trim() ?? '';
  if (input.decision !== 'approve' && comment.length < 3) {
    throw validation('กรุณาระบุเหตุผลหรือข้อเสนอแนะ', { comment: 'กรุณาระบุเหตุผลหรือข้อเสนอแนะ' });
  }
  if (comment.length > 2000) throw validation('ความเห็นยาวเกินไป (ไม่เกิน 2,000 ตัวอักษร)');

  const step = request.steps.find((s) => s.order === request.current_step);
  if (!step) throw conflict();
  const uow = db.unitOfWork({
    action: `approvals.${input.decision}`,
    actorId: user.id,
    idempotencyKey: input.idempotencyKey,
  });
  const directory = await loadDirectory(db);
  const eligibility = eligibilityFor(directory, request, step, user.id, uow.now, false);
  if (!eligibility.eligible) throw forbidden('คุณไม่ใช่ผู้พิจารณาของขั้นตอนนี้');

  const subject = subjectOf(request);
  const steps = request.steps.map((s) => ({ ...s }));
  const current = steps.find((s) => s.order === step.order) as ApprovalStepSnapshot;
  let requestStatus: ApprovalRequestRow['status'] = 'pending';
  let subjectStatus: DocumentStatus;
  let event: ApprovalEvent;
  let next: ApprovalStepSnapshot | undefined;
  const notifications: NotificationInput[] = [];
  const link = adapter.linkPath(request.id);

  if (input.decision === 'approve') {
    current.state = 'approved';
    next = steps.find((s) => s.state === 'waiting' && s.order > current.order);
    if (next) {
      // ผู้พิจารณาของขั้นถัดไปอาจเปลี่ยนไปหลังส่ง — ใช้รายชื่อ ณ ตอนนี้
      const approvers = resolveApprovers(directory, next, subject).filter(
        (id) => id !== subject.requesterId,
      );
      if (approvers.length > 0) next.approverIds = approvers;
      next.state = 'current';
      subjectStatus = pendingStatusFor(next);
      event = 'advanced';
      for (const userId of next.approverIds) {
        notifications.push({
          userId,
          type: 'approval_pending',
          title: `${adapter.label}รอพิจารณา: ${subject.title}`,
          body: `${subject.refNo} · ขั้นตอน ${next.name}`,
          linkPath: link,
          entityType: 'approval_request',
          entityId: request.id,
          dedupeKey: `approval:${request.id}:step:${next.order}`,
        });
      }
    } else {
      requestStatus = 'approved';
      subjectStatus = 'approved';
      event = 'approved';
      notifications.push({
        userId: subject.requesterId,
        type: 'approval_approved',
        title: `${adapter.label}ได้รับอนุมัติ: ${subject.title}`,
        body: subject.refNo,
        linkPath: link,
        entityType: 'approval_request',
        entityId: request.id,
        dedupeKey: `approval:${request.id}:approved`,
      });
    }
  } else if (input.decision === 'reject') {
    current.state = 'rejected';
    requestStatus = 'rejected';
    subjectStatus = 'rejected';
    event = 'rejected';
    notifications.push({
      userId: subject.requesterId,
      type: 'approval_rejected',
      title: `${adapter.label}ไม่ได้รับอนุมัติ: ${subject.title}`,
      body: `${subject.refNo} · ${step.name}`,
      linkPath: link,
      entityType: 'approval_request',
      entityId: request.id,
      dedupeKey: `approval:${request.id}:rejected`,
    });
  } else {
    current.state = 'returned';
    requestStatus = 'returned';
    subjectStatus = 'returned';
    event = 'returned';
    notifications.push({
      userId: subject.requesterId,
      type: 'approval_returned',
      title: `${adapter.label}ถูกส่งกลับแก้ไข: ${subject.title}`,
      body: `${subject.refNo} · ${step.name}`,
      linkPath: link,
      entityType: 'approval_request',
      entityId: request.id,
      dedupeKey: `approval:${request.id}:returned`,
    });
  }

  const finished = requestStatus !== 'pending';
  uow.add(
    requests.update(
      request.id,
      {
        status: requestStatus,
        current_step: finished ? 0 : (next?.order ?? request.current_step),
        steps,
        completed_at: finished ? uow.now : null,
      },
      input.expectedVersion,
    ),
  );
  uow.add(
    db.repo(ApprovalActions).insert({
      request_id: request.id,
      subject_type: request.subject_type,
      subject_id: request.subject_id,
      subject_version: request.subject_version,
      step_order: step.order,
      step_name: step.name,
      action: input.decision,
      actor_id: user.id,
      on_behalf_of: eligibility.onBehalfOf,
      comment: comment || null,
    }),
  );
  await adapter.applyStatus(db, uow, subject, subjectStatus, {
    event,
    requestId: request.id,
    actorId: user.id,
  });
  await addNotifications(db, uow, notifications);
  uow.audit({
    action: `approvals.${input.decision}`,
    category: input.decision,
    resource: adapter.resource,
    entityType: request.subject_type,
    entityId: request.subject_id,
    summary: `${DECISION_LABEL[input.decision]}${adapter.label} ${subject.refNo} ในขั้นตอน “${step.name}” (เวอร์ชัน ${request.subject_version})`,
    metadata: {
      requestId: request.id,
      step: step.order,
      onBehalfOf: eligibility.onBehalfOf,
      subjectVersion: request.subject_version,
    },
  });

  const result: DecisionResult = {
    requestStatus,
    subjectStatus,
    finalApproval: event === 'approved',
    subject,
  };
  if (extend) await extend(uow, result);
  await uow.commit();
  return result;
}

/** ยกเลิกคำขอที่ยังพิจารณาไม่เสร็จ — ผู้เสนอ หรือผู้มีสิทธิ์ cancel ตาม Permission Matrix */
export async function cancelApproval(
  db: Db,
  user: CurrentUser,
  adapter: SubjectAdapter,
  cancelResource: ResourceKey,
  input: { requestId: string; reason: string; expectedVersion: number },
): Promise<void> {
  const requests = db.repo(ApprovalRequests);
  const request = await requests.byId(input.requestId);
  if (!request || request.subject_type !== adapter.type) throw notFound('ไม่พบคำขออนุมัติ');
  if (!user.permissions.canOnRecord(cancelResource, 'cancel', recordContextOf(request))) {
    throw forbidden('คุณไม่มีสิทธิ์ยกเลิกเอกสารนี้');
  }
  if (request.status !== 'pending') throw conflict('เอกสารนี้ไม่อยู่ระหว่างการพิจารณาแล้ว');
  const reason = input.reason.trim();
  if (reason.length < 3) throw validation('กรุณาระบุเหตุผลที่ยกเลิก', { reason: 'กรุณาระบุเหตุผล' });

  const subject = subjectOf(request);
  const uow = db.unitOfWork({ action: 'approvals.cancel', actorId: user.id });
  uow.add(
    requests.update(
      request.id,
      { status: 'cancelled', current_step: 0, completed_at: uow.now },
      input.expectedVersion,
    ),
  );
  uow.add(
    db.repo(ApprovalActions).insert({
      request_id: request.id,
      subject_type: request.subject_type,
      subject_id: request.subject_id,
      subject_version: request.subject_version,
      step_order: request.current_step,
      step_name: 'ยกเลิก',
      action: 'cancel',
      actor_id: user.id,
      comment: reason,
    }),
  );
  await adapter.applyStatus(db, uow, subject, 'cancelled', {
    event: 'cancelled',
    requestId: request.id,
    actorId: user.id,
  });
  const current = request.steps.find((step) => step.order === request.current_step);
  await addNotifications(
    db,
    uow,
    [subject.requesterId, ...(current?.approverIds ?? [])]
      .filter((userId) => userId !== user.id)
      .map((userId) => ({
        userId,
        type: 'approval_returned' as const,
        title: `${adapter.label}ถูกยกเลิก: ${subject.title}`,
        body: subject.refNo,
        linkPath: adapter.linkPath(request.id),
        entityType: 'approval_request',
        entityId: request.id,
        dedupeKey: `approval:${request.id}:cancelled`,
      })),
  );
  uow.audit({
    action: 'approvals.cancel',
    category: 'cancel',
    resource: adapter.resource,
    entityType: request.subject_type,
    entityId: request.subject_id,
    summary: `ยกเลิก${adapter.label} ${subject.refNo}`,
    metadata: { requestId: request.id },
  });
  await uow.commit();
}

// ── Queries ────────────────────────────────────────────────────────────────────

export interface ApprovalListItem {
  id: string;
  version: number;
  subjectType: string;
  subjectId: string;
  refNo: string;
  title: string;
  requesterId: string;
  requesterName: string;
  status: ApprovalRequestRow['status'];
  currentStepName: string | null;
  currentStepKind: 'review' | 'approve' | null;
  currentStep: number;
  totalSteps: number;
  submittedAt: string;
  completedAt: string | null;
  /** ผู้ใช้ปัจจุบันเป็นผู้พิจารณาของขั้นปัจจุบันหรือไม่ */
  awaitingMe: boolean;
}

export type ApprovalScope = 'awaiting_me' | 'mine' | 'all';

/** รายการคำขออนุมัติที่ผู้ใช้มีสิทธิ์เห็น (กรองสิทธิ์ที่ Server ก่อนส่งออกเสมอ) */
export async function listApprovals(
  db: Db,
  user: CurrentUser,
  adapters: readonly SubjectAdapter[],
  scope: ApprovalScope,
): Promise<ApprovalListItem[]> {
  const [requests, users, directory] = await Promise.all([
    db.repo(ApprovalRequests).all(),
    db.repo(Users).all(),
    loadDirectory(db),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  const adapterByType = new Map(adapters.map((adapter) => [adapter.type, adapter]));
  const now = new Date().toISOString();
  const items: ApprovalListItem[] = [];

  for (const request of requests) {
    const adapter = adapterByType.get(request.subject_type);
    if (!adapter) continue;
    const step = request.steps.find((s) => s.order === request.current_step) ?? null;
    const awaitingMe =
      request.status === 'pending' &&
      step !== null &&
      user.permissions.canOnRecord(adapter.resource, 'approve', recordContextOf(request)) &&
      eligibilityFor(directory, request, step, user.id, now, false).eligible;
    const isMine = request.requester_id === user.id;
    const canView =
      awaitingMe || isMine || user.permissions.canOnRecord(adapter.resource, 'view', recordContextOf(request));
    if (!canView) continue;
    if (scope === 'awaiting_me' && !awaitingMe) continue;
    if (scope === 'mine' && !isMine) continue;
    items.push({
      id: request.id,
      version: request.version,
      subjectType: request.subject_type,
      subjectId: request.subject_id,
      refNo: request.subject_ref_no ?? '',
      title: request.subject_title,
      requesterId: request.requester_id,
      requesterName: nameById.get(request.requester_id) ?? 'ไม่ทราบชื่อ',
      status: request.status,
      currentStepName: step?.name ?? null,
      currentStepKind: step?.kind ?? null,
      currentStep: request.current_step,
      totalSteps: request.total_steps,
      submittedAt: request.submitted_at,
      completedAt: request.completed_at,
      awaitingMe,
    });
  }
  return items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export interface TimelineEntry {
  id: string;
  action: ApprovalActionRow['action'];
  stepOrder: number;
  stepName: string | null;
  actorName: string | null;
  onBehalfOfName: string | null;
  comment: string | null;
  subjectVersion: number;
  at: string;
}

export interface ApprovalDetail {
  item: ApprovalListItem;
  steps: (ApprovalStepSnapshot & { approverNames: string[] })[];
  timeline: TimelineEntry[];
  canDecide: boolean;
  canCancel: boolean;
}

export async function getApprovalDetail(
  db: Db,
  user: CurrentUser,
  adapters: readonly SubjectAdapter[],
  requestId: string,
  cancelResource?: ResourceKey,
): Promise<ApprovalDetail> {
  const request = await db.repo(ApprovalRequests).byId(requestId);
  const item = (await listApprovals(db, user, adapters, 'all')).find((entry) => entry.id === requestId);
  // ไม่แยกแยะ "ไม่มี" กับ "ไม่มีสิทธิ์" เพื่อไม่ให้เดารหัสคำขอได้
  if (!request || !item) throw notFound('ไม่พบคำขออนุมัติ');
  const [actions, users] = await Promise.all([
    db.repo(ApprovalActions).filter((row) => row.request_id === requestId),
    db.repo(Users).all(),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.display_name]));
  const adapter = adapters.find((a) => a.type === request.subject_type) as SubjectAdapter;
  return {
    item,
    steps: request.steps.map((step) => ({
      ...step,
      approverNames: step.approverIds.map((id) => nameById.get(id) ?? 'ไม่ทราบชื่อ'),
    })),
    timeline: actions
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((action) => ({
        id: action.id,
        action: action.action,
        stepOrder: action.step_order,
        stepName: action.step_name,
        actorName: action.actor_id ? (nameById.get(action.actor_id) ?? 'ไม่ทราบชื่อ') : null,
        onBehalfOfName: action.on_behalf_of ? (nameById.get(action.on_behalf_of) ?? null) : null,
        comment: action.comment,
        subjectVersion: action.subject_version,
        at: action.created_at,
      })),
    canDecide: item.awaitingMe,
    canCancel:
      request.status === 'pending' &&
      user.permissions.canOnRecord(cancelResource ?? adapter.resource, 'cancel', recordContextOf(request)),
  };
}
