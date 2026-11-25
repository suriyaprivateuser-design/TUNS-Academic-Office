'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * แถบแท็บที่ตัวบ่งชี้เลื่อนตามแท็บที่เลือก (Tab Indicator — ข้อ 08.5)
 * เป็นปุ่มสลับมุมมองของหน้าเดียวกัน จึงใช้ role="tablist" และ aria-selected
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex max-w-full gap-1 overflow-x-auto border-b border-border/80', className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              const index = items.findIndex((entry) => entry.value === value);
              const next = items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
              if (next) onChange(next.value);
            }}
            className={cn(
              'relative flex h-11 shrink-0 items-center gap-2 px-3 text-label font-medium transition-colors duration-150',
              selected ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-caption tabular-nums',
                  selected ? 'bg-accent text-white' : 'bg-surface-muted/70 text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            ) : null}
            {selected ? (
              <motion.span
                layoutId={`${id}-indicator`}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
