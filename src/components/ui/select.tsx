import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';
import { fieldClass } from './input';

/**
 * Select ใช้ <select> ของเบราว์เซอร์: ใช้งานด้วยคีย์บอร์ดและโปรแกรมอ่านหน้าจอได้ทันที
 * และบนมือถือได้ตัวเลือกแบบ native ที่กดง่าย
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select
        data-slot="select"
        className={cn(fieldClass, 'h-10 appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
