import {
  Archive,
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Hourglass,
  PencilLine,
  Send,
  TriangleAlert,
  Undo2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  DOCUMENT_STATUS_META,
  SERVICE_STATUSES,
  type DocumentStatus,
  type ServiceStatus,
  type StatusTone,
} from '@/config/reference';

const DOCUMENT_ICON: Record<DocumentStatus, LucideIcon> = {
  draft: PencilLine,
  submitted: Send,
  pending_review: Clock,
  in_consideration: Hourglass,
  returned: Undo2,
  approved: CircleCheck,
  rejected: CircleX,
  cancelled: Ban,
  archived: Archive,
};

/** สถานะสื่อด้วย “ไอคอน + ข้อความ + สี” เสมอ ไม่ใช้สีอย่างเดียว (ข้อ 06.4) */
export function StatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  const meta = DOCUMENT_STATUS_META[status];
  const Icon = DOCUMENT_ICON[status];
  return (
    <Badge tone={meta.tone satisfies StatusTone as BadgeTone} className={className}>
      <Icon strokeWidth={2} aria-hidden />
      {meta.label}
    </Badge>
  );
}

const APPROVAL_STATE: Record<string, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  pending: { label: 'รอพิจารณา', tone: 'warning', icon: Clock },
  returned: { label: 'ส่งกลับแก้ไข', tone: 'warning', icon: Undo2 },
  approved: { label: 'อนุมัติ', tone: 'success', icon: CircleCheck },
  rejected: { label: 'ไม่อนุมัติ', tone: 'danger', icon: CircleX },
  cancelled: { label: 'ยกเลิก', tone: 'neutral', icon: Ban },
};

export function ApprovalStateBadge({ status }: { status: string }) {
  const meta = APPROVAL_STATE[status] ?? { label: status, tone: 'neutral' as const, icon: CircleDashed };
  return (
    <Badge tone={meta.tone}>
      <meta.icon strokeWidth={2} aria-hidden />
      {meta.label}
    </Badge>
  );
}

const SERVICE_ICON: Record<ServiceStatus, LucideIcon> = {
  active: CircleCheck,
  maintenance: Wrench,
  offline: TriangleAlert,
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const meta = SERVICE_STATUSES.find((item) => item.id === status) ?? SERVICE_STATUSES[0];
  const Icon = SERVICE_ICON[status];
  return (
    <Badge tone={meta.tone as BadgeTone}>
      <Icon strokeWidth={2} aria-hidden />
      {meta.label}
    </Badge>
  );
}
