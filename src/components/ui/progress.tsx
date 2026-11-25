import { cn } from '@/lib/utils/cn';

export function Progress({
  value,
  label,
  className,
}: {
  /** 0–100 */
  value: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-muted/70', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
