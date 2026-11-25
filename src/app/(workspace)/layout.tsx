import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell, SIDEBAR_COOKIE } from '@/components/layout/app-shell';
import type { LauncherService } from '@/components/layout/app-launcher';
import type { ServiceTileColor } from '@/components/shared/service-tile';
import { signOutAction } from '@/features/shell/actions';
import { requireUser, toClientUser } from '@/lib/auth/session';
import { buildNavigation } from '@/lib/navigation';
import { getDb } from '@/repositories/db';
import { countUnread } from '@/services/notifications';
import { getQuickServices } from '@/services/service-hub';
import { getSchoolIdentity } from '@/services/settings';

/**
 * โครงของทุกหน้าหลังเข้าสู่ระบบ
 * `requireUser()` ตรวจ session + สถานะบัญชี + บทบาทจากฐานข้อมูลทุกคำขอ (ไม่ใช่เพียงมี cookie)
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const db = getDb();
  const [school, unread, quick, cookieStore] = await Promise.all([
    getSchoolIdentity(db),
    countUnread(db, user.id),
    getQuickServices(db, user, 9),
    cookies(),
  ]);
  const launcher: LauncherService[] = quick.flatMap((service) =>
    service.href
      ? [
          {
            id: service.id,
            name: service.nameTh,
            icon: service.icon,
            color: service.color as ServiceTileColor,
            href: service.href,
            external: service.linkType === 'external',
          },
        ]
      : [],
  );

  return (
    <AppShell
      groups={buildNavigation(user.permissions)}
      user={toClientUser(user)}
      schoolName={school.schoolName}
      crestUrl={school.crestFileId ? '/api/public/school-crest' : null}
      launcher={launcher}
      unreadNotifications={unread}
      defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === 'collapsed'}
      signOutAction={signOutAction}
    >
      {children}
    </AppShell>
  );
}
