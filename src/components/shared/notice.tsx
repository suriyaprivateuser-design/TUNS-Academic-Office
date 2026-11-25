import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'accent';

const STYLE: Record<NoticeTone, { box: string; icon: LucideIcon }> = {
  info: { box: 'bg-info-soft text-info', icon: Info },
  success: { box: 'bg-success-soft text-success', icon: CircleCheck },
  warning: { box: 'bg-warning-soft text-warning', icon: TriangleAlert },
  danger: { box: 'bg-danger-soft text-danger', icon: CircleAlert },
  accent: { box: 'bg-accent-soft text-accent', icon: Info },
};

/** ข้อความแจ้งในเนื้อหา (ไม่ใช่ toast): ข้อสังเกต คำเตือน และข้อผิดพลาดที่ต้องอยู่ให้อ่าน */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = STYLE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-[0.75rem] px-4 py-3', box, className)}
    >
      <Icon className="mt-0.5 size-[1.125rem] shrink-0" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1 text-label">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-foreground/85">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
