/**
 * สร้างเมนูของผู้ใช้จาก Registry ของระบบย่อย + สิทธิ์ของผู้ใช้
 *
 * แสดงเฉพาะระบบที่เปิดใช้แล้ว (`released`) และผู้ใช้มีสิทธิ์ดู
 * การกรองเมนูเป็นเรื่องความสะดวกเท่านั้น สิทธิ์จริงตรวจที่ Server ทุกหน้าและทุก action
 */
import 'server-only';
import type { IconKey } from '@/config/icons';
import { modulesInNavOrder, subsystemsOf, type ResourceKey } from '@/config/modules';
import type { PermissionSet } from '@/lib/security/authorization';

export interface NavItem {
  key: string;
  label: string;
  path: string;
  icon: IconKey;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: IconKey;
  items: NavItem[];
}

export function buildNavigation(permissions: PermissionSet): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const moduleDef of modulesInNavOrder()) {
    const items = subsystemsOf(moduleDef.id)
      .filter((item) => item.released && permissions.can(item.key as ResourceKey, 'view'))
      .map((item) => ({ key: item.key, label: item.navLabel, path: item.path, icon: item.icon }));
    if (items.length > 0) {
      groups.push({ id: moduleDef.id, label: moduleDef.navLabel, icon: moduleDef.icon, items });
    }
  }
  return groups;
}
