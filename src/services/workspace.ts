/**
 * ข้อมูลของหน้า My Workspace (ข้อ 11 / 01.2)
 * ทุกส่วนมาจากบริการของ Module ที่กรองสิทธิ์แล้ว ไม่มีตัวเลขหรือรายการที่เขียนตายตัว
 */
import 'server-only';
import type { IconKey } from '@/config/icons';
import { formatThaiDateRange } from '@/lib/utils/thai-date';
import type { Db } from '@/repositories/db';
import { CalendarEvents } from '@/schemas/database/meeting';
import { listApprovals } from './approvals';
import {
  classLeaveAdapter,
  listNotices,
  listRequests,
  listTodayActivities,
  type ClassLeaveListItem,
  type TodayActivity,
} from './class-leave';
import type { CurrentUser } from './identity';
import { listNotifications, type NotificationView } from './notifications';
import { getQuickServices, type ServiceView } from './service-hub';
import { getCurrentTerm, type AcademicTerm } from './settings';

export interface TodoItem {
  id: string;
  kind: 'approval' | 'returned' | 'draft' | 'acknowledge';
  title: string;
  meta: string;
  href: string;
  icon: IconKey;
}

export interface AgendaItem {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  eventType: string;
  href: string | null;
}

export interface WorkspaceData {
  term: AcademicTerm | null;
  services: ServiceView[];
  todo: TodoItem[];
  documents: ClassLeaveListItem[];
  documentCounts: { pending: number; approved: number; returned: number; draft: number };
  agenda: AgendaItem[];
  today: TodayActivity[];
  notifications: NotificationView[];
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  meeting: 'การประชุม',
  deadline: 'กำหนดส่งงาน',
  exam: 'วันสอบ',
  academic_activity: 'กิจกรรมวิชาการ',
  competition: 'การแข่งขัน',
  important_day: 'วันสำคัญ',
  class_leave: 'หนังสือขอเวลาเรียน',
  supervision: 'การนิเทศการสอน',
};

async function upcomingEvents(db: Db, user: CurrentUser, limit: number): Promise<AgendaItem[]> {
  if (!user.permissions.can('calendar.academic', 'view')) return [];
  const now = new Date().toISOString();
  const events = await db
    .repo(CalendarEvents)
    .filter(
      (event) =>
        event.status === 'scheduled' &&
        !event.archived_at &&
        (event.end_at ?? event.start_at) >= now &&
        (event.visibility === 'all' ||
          (event.visibility === 'department' && event.department_id === user.departmentId) ||
          (event.visibility === 'private' && event.created_by === user.id)),
    );
  return events
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      title: event.title,
      startAt: event.start_at,
      endAt: event.end_at,
      allDay: event.all_day,
      location: event.location,
      eventType: event.event_type,
      // กิจกรรมที่มาจาก Module อื่นลิงก์กลับไปยังรายการต้นทาง
      href: event.source_type === 'class_leave' && event.source_id ? `/class-leave/${event.source_id}` : null,
    }));
}

export async function getWorkspaceData(db: Db, user: CurrentUser): Promise<WorkspaceData> {
  const can = user.permissions;
  const [term, services, requests, approvals, notices, today, notifications, agenda] = await Promise.all([
    getCurrentTerm(db),
    getQuickServices(db, user, 6),
    can.can('classLeave.requests', 'view') ? listRequests(db, user) : Promise.resolve([]),
    can.can('classLeave.approvals', 'approve')
      ? listApprovals(db, user, [classLeaveAdapter], 'awaiting_me')
      : Promise.resolve([]),
    can.can('classLeave.notices', 'view') ? listNotices(db, user) : Promise.resolve([]),
    listTodayActivities(db, user),
    listNotifications(db, user.id, { limit: 5 }),
    upcomingEvents(db, user, 5),
  ]);
  const mine = requests.filter((request) => request.isMine);

  const todo: TodoItem[] = [
    ...approvals.map<TodoItem>((item) => ({
      id: `approval-${item.id}`,
      kind: 'approval',
      title: `พิจารณา: ${item.title}`,
      meta: `${item.refNo} · เสนอโดย ${item.requesterName} · ${item.currentStepName ?? ''}`,
      href: `/documents/approvals/${item.id}`,
      icon: 'approval',
    })),
    ...mine
      .filter((request) => request.status === 'returned')
      .map<TodoItem>((request) => ({
        id: `returned-${request.id}`,
        kind: 'returned',
        title: `แก้ไขตามข้อเสนอแนะ: ${request.activityName}`,
        meta: `${request.referenceNo} · ถูกส่งกลับแก้ไข`,
        href: `/class-leave/${request.id}`,
        icon: 'classLeave',
      })),
    ...notices
      .filter((notice) => !notice.acknowledgedAt)
      .map<TodoItem>((notice) => ({
        id: `ack-${notice.requestId}`,
        kind: 'acknowledge',
        title: `รับทราบ: ${notice.activityName}`,
        meta: `${notice.referenceNo} · ${notice.startDate ? formatThaiDateRange(notice.startDate, notice.endDate) : ''}`,
        href: `/class-leave/${notice.requestId}`,
        icon: 'classLeaveNotice',
      })),
    ...mine
      .filter((request) => request.status === 'draft')
      .map<TodoItem>((request) => ({
        id: `draft-${request.id}`,
        kind: 'draft',
        title: `ทำต่อ: ${request.activityName}`,
        meta: `${request.referenceNo} · ฉบับร่าง`,
        href: `/class-leave/${request.id}/edit`,
        icon: 'memo',
      })),
  ];

  return {
    term,
    services,
    todo,
    documents: mine.slice(0, 5),
    documentCounts: {
      pending: mine.filter((r) => ['submitted', 'pending_review', 'in_consideration'].includes(r.status)).length,
      approved: mine.filter((r) => r.status === 'approved').length,
      returned: mine.filter((r) => r.status === 'returned').length,
      draft: mine.filter((r) => r.status === 'draft').length,
    },
    agenda,
    today,
    notifications: notifications.items,
  };
}
