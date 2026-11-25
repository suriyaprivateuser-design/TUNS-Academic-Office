import { cn } from '@/lib/utils/cn';

/** เลขอ้างอิงภายในระบบ แสดงแบบตราทะเบียน (ตัวเลขความกว้างคงที่ เพื่ออ่านเทียบในตารางได้ง่าย) */
export function ReferenceChip({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-chip border border-dashed border-rose bg-accent-soft/50 px-2 text-caption font-semibold tracking-wide whitespace-nowrap text-accent tabular-nums',
        className,
      )}
    >
      {value}
    </span>
  );
}
