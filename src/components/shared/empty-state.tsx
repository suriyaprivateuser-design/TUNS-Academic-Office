import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export type IllustrationName =
  | 'empty-documents'
  | 'empty-search'
  | 'empty-approvals'
  | 'empty-calendar'
  | 'empty-notifications'
  | 'upload-files'
  | 'setup-required'
  | 'access-denied';

/**
 * Empty State: บอกว่าทำไมว่าง และทำอะไรต่อได้ (ไม่ใช่แค่ “ไม่มีข้อมูล”)
 * Production ที่ยังไม่มีข้อมูลจริงแสดงสถานะนี้ ไม่ใส่ข้อมูลสมมติ (ข้อ 40)
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  illustration?: IllustrationName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center animate-in fade-in-0 duration-200',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {illustration ? (
        <Image
          src={`/illustrations/${illustration}.svg`}
          alt=""
          width={compact ? 132 : 200}
          height={compact ? 99 : 150}
          unoptimized
        />
      ) : null}
      <p className={cn('font-semibold text-foreground', compact ? 'text-label' : 'text-subheading')}>
        {title}
      </p>
      {description ? (
        <p className="max-w-md text-label text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
