import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

/** พื้นผิวหลักของเนื้อหา: ขาว มุมโค้ง เงานุ่ม เส้นขอบบางมาก (ห้ามซ้อน Card ใน Card) */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-card bg-surface shadow-card ring-1 ring-border/60', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-subheading font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-label text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-5 sm:p-6', className)} {...props} />;
}
