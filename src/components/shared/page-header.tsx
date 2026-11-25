import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** ข้อมูลประกอบใต้ชื่อหน้า เช่น ป้ายสถานะ เลขอ้างอิง */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0 flex-1 basis-80">
        <h1 className="text-title font-bold text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[68ch] text-body text-muted-foreground">{description}</p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-heading font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-label text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
