import { GraduationCap } from 'lucide-react';
import { SYSTEM } from '@/config/school';
import { cn } from '@/lib/utils/cn';

/**
 * เครื่องหมายของระบบ
 * ถ้าโรงเรียนอัปโหลดตราโรงเรียนแล้ว (ผ่าน Setup Wizard) จะแสดงตราจริง
 * ถ้ายังไม่มี ใช้เครื่องหมายของระบบ (ไอคอน Lucide) — ไม่มีการวาดตราโรงเรียนขึ้นเอง
 */
export function BrandMark({ crestUrl, className }: { crestUrl?: string | null; className?: string }) {
  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ตราโรงเรียนส่งผ่าน endpoint ของระบบ ไม่ใช่ไฟล์ static
      <img src={crestUrl} alt="ตราโรงเรียน" className={cn('size-10 shrink-0 object-contain', className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-[0.75rem] bg-accent text-white shadow-control',
        className,
      )}
    >
      <GraduationCap className="size-[1.375rem]" strokeWidth={1.75} />
    </span>
  );
}

export function BrandLockup({
  crestUrl,
  compact = false,
}: {
  crestUrl?: string | null;
  compact?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <BrandMark crestUrl={crestUrl} />
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-label font-bold text-foreground">{SYSTEM.nameEn}</span>
          <span className="block truncate text-caption text-muted-foreground">{SYSTEM.unitNameTh}</span>
        </span>
      )}
    </span>
  );
}
