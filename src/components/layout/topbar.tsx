'use client';

import { ChevronRight, FlaskConical, Menu, Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { breadcrumbFor } from '@/config/routes';
import { SYSTEM } from '@/config/school';
import { AppLauncher, type LauncherService } from './app-launcher';
import type { ClientUser } from '@/lib/auth/session';
import { NotificationBell } from './notification-bell';
import { UserMenu } from './user-menu';

export function Topbar({
  onOpenMenu,
  onOpenSearch,
  launcher,
  unreadNotifications,
  user,
  signOutAction,
}: {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  launcher: readonly LauncherService[];
  unreadNotifications: number;
  user: ClientUser;
  signOutAction: () => Promise<void>;
}) {
  const isDemo = user.isDemo;
  const pathname = usePathname();
  const crumbs = breadcrumbFor(pathname);
  const current = crumbs[crumbs.length - 1];

  return (
    <header className="no-print sticky top-0 z-20 border-b border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur-sm">
      <div className="container-page flex h-[var(--topbar-height)] items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="เปิดเมนู" onClick={onOpenMenu}>
          <Menu className="size-5" strokeWidth={1.75} aria-hidden />
        </Button>

        <nav aria-label="ตำแหน่งของหน้านี้" className="min-w-0 flex-1">
          {crumbs.length > 0 ? (
            <ol className="flex min-w-0 items-center gap-1.5 text-label">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`} className={last ? 'flex min-w-0 items-center gap-1.5' : 'hidden shrink-0 items-center gap-1.5 sm:flex'}>
                    {index > 0 ? (
                      <ChevronRight className="hidden size-4 shrink-0 text-rose sm:block" strokeWidth={1.75} aria-hidden />
                    ) : null}
                    {crumb.href && !last ? (
                      <a href={crumb.href} className="rounded-md text-muted-foreground transition-colors hover:text-foreground">
                        {crumb.label}
                      </a>
                    ) : (
                      <span
                        aria-current={last ? 'page' : undefined}
                        className={last ? 'truncate font-semibold text-foreground' : 'text-muted-foreground'}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="truncate text-label font-semibold text-foreground">{current?.label ?? SYSTEM.nameEn}</p>
          )}
        </nav>

        {isDemo ? (
          <Tooltip
            side="bottom"
            label="ระบบกำลังใช้ที่เก็บข้อมูลสำหรับ Development ข้อมูลทั้งหมดเป็นข้อมูลสาธิต ไม่ใช่ข้อมูลจริงของโรงเรียน"
          >
            <span
              tabIndex={0}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-caption font-semibold text-warning"
            >
              <FlaskConical className="size-3.5" strokeWidth={2} aria-hidden />
              <span className="sr-only sm:not-sr-only">ข้อมูลสาธิต</span>
            </span>
          </Tooltip>
        ) : null}

        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden h-10 w-56 items-center gap-2.5 rounded-control border border-border-strong bg-surface px-3 text-label text-muted-foreground transition-colors duration-150 hover:border-primary md:flex xl:w-72"
        >
          <Search className="size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1 truncate text-left">ค้นหาในระบบ</span>
          <kbd className="rounded-md border border-border px-1.5 text-caption">Ctrl K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="ค้นหาในระบบ" onClick={onOpenSearch}>
          <Search className="size-5" strokeWidth={1.75} aria-hidden />
        </Button>

        <AppLauncher services={launcher} />
        <NotificationBell initialUnread={unreadNotifications} />
        <span className="ml-1">
          <UserMenu user={user} signOutAction={signOutAction} />
        </span>
      </div>
    </header>
  );
}
