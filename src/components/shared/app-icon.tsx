import type { LucideProps } from 'lucide-react';
import { ICONS, ICON_STROKE_WIDTH, isIconKey, type IconKey } from '@/config/icons';

/** ไอคอนตาม Icon Mapping กลาง — เส้น 1.75 ปลายมนตามมาตรฐานของระบบ */
export function AppIcon({
  name,
  size = 18,
  ...props
}: { name: IconKey | (string & {}); size?: number } & Omit<LucideProps, 'ref' | 'size'>) {
  const Icon = ICONS[isIconKey(name) ? name : 'external'];
  return <Icon size={size} strokeWidth={ICON_STROKE_WIDTH} aria-hidden {...props} />;
}
