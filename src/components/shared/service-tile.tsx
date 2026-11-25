import { AppIcon } from '@/components/shared/app-icon';
import { cn } from '@/lib/utils/cn';

export type ServiceTileColor = 'terracotta' | 'rose' | 'burgundy' | 'brown' | 'sand';

/** โทนสีของไอคอนบริการ — เลือกได้เฉพาะชุดที่มาจาก Design Token */
const TILE_CLASS: Record<ServiceTileColor, string> = {
  terracotta: 'bg-peach/60 text-terracotta',
  rose: 'bg-rose-soft/80 text-accent',
  burgundy: 'bg-accent text-white',
  brown: 'bg-surface-muted/70 text-primary',
  sand: 'bg-background text-muted-foreground ring-1 ring-border ring-inset',
};

export const SERVICE_TILE_COLORS: { id: ServiceTileColor; label: string }[] = [
  { id: 'terracotta', label: 'เทอร์ราคอตตา' },
  { id: 'rose', label: 'ชมพูกุหลาบ' },
  { id: 'burgundy', label: 'เบอร์กันดี' },
  { id: 'brown', label: 'น้ำตาล' },
  { id: 'sand', label: 'ครีมทราย' },
];

export function ServiceTile({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: string;
  color: ServiceTileColor;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center',
        size === 'md' ? 'size-12 rounded-[0.875rem]' : 'size-10 rounded-[0.75rem]',
        TILE_CLASS[color],
        className,
      )}
    >
      <AppIcon name={icon} size={size === 'md' ? 24 : 20} />
    </span>
  );
}
