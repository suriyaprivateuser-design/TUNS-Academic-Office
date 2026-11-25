import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

/** ตารางข้อมูล: เลื่อนแนวนอนได้เฉพาะตัวตาราง ไม่ทำให้ทั้งหน้าล้น (ข้อ 08.4) */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-label', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-surface-subtle', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b border-border/70 transition-colors duration-100 last:border-b-0 [tbody>&]:hover:bg-surface-subtle/70',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'h-11 px-4 text-caption font-semibold whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle first:pl-5 last:pr-5', className)} {...props} />;
}
