'use client';

import { MotionConfig } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SYSTEM } from '@/config/school';
import type { ClientUser } from '@/lib/auth/session';
import type { NavGroup } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import type { LauncherService } from './app-launcher';
import { GlobalSearch } from './global-search';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export const SIDEBAR_COOKIE = 'tuns_sidebar';

export function AppShell({
  children,
  groups,
  user,
  schoolName,
  crestUrl,
  launcher,
  unreadNotifications,
  defaultCollapsed,
  signOutAction,
}: {
  children: ReactNode;
  groups: NavGroup[];
  user: ClientUser;
  schoolName: string;
  crestUrl: string | null;
  launcher: LauncherService[];
  unreadNotifications: number;
  defaultCollapsed: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      // จำสถานะเมนูไว้ใน cookie เพื่อให้ Server render ตรงกับที่ผู้ใช้ตั้งไว้ (ไม่มีข้อมูลส่วนบุคคล)
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={350} skipDelayDuration={150}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          ข้ามไปยังเนื้อหา
        </a>

        <aside
          className={cn(
            'no-print fixed inset-y-0 left-0 z-30 hidden border-r border-border/70 bg-surface transition-[width] duration-200 ease-out lg:block',
            collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
          )}
        >
          <Sidebar
            groups={groups}
            user={user}
            crestUrl={crestUrl}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            signOutAction={signOutAction}
          />
        </aside>

        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" title="เมนูหลัก" className="lg:hidden">
            <Sidebar
              groups={groups}
              user={user}
              crestUrl={crestUrl}
              collapsed={false}
              onNavigate={() => setMenuOpen(false)}
              signOutAction={signOutAction}
            />
          </SheetContent>
        </Dialog>

        <div
          className={cn(
            'flex min-h-dvh flex-col transition-[padding] duration-200 ease-out',
            collapsed ? 'lg:pl-[var(--sidebar-collapsed-width)]' : 'lg:pl-[var(--sidebar-width)]',
          )}
        >
          <Topbar
            onOpenMenu={() => setMenuOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            launcher={launcher}
            unreadNotifications={unreadNotifications}
            user={user}
            signOutAction={signOutAction}
          />
          <main id="main-content" tabIndex={-1} className="container-page flex-1 py-6 outline-none lg:py-8">
            {children}
          </main>
          <footer className="no-print container-page pb-6 text-caption text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border/60 pt-4">
              <p>
                {SYSTEM.nameEn} · {schoolName} · {SYSTEM.unitNameTh}
              </p>
              <p className="tabular-nums">รุ่น {SYSTEM.version}</p>
            </div>
          </footer>
        </div>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} groups={groups} />
      </TooltipProvider>
    </MotionConfig>
  );
}
