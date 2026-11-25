'use client';

import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AppIcon } from '@/components/shared/app-icon';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { HOME_PATH } from '@/config/routes';
import type { ClientUser } from '@/lib/auth/session';
import type { NavGroup, NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { BrandLockup } from './brand';

/** รายการเมนูที่ตรงกับเส้นทางปัจจุบันมากที่สุด (เส้นทางที่ยาวที่สุดที่เป็นคำนำหน้า) */
export function activeItemKey(groups: readonly NavGroup[], pathname: string): string | null {
  let best: NavItem | null = null;
  for (const item of groups.flatMap((group) => group.items)) {
    const matches = pathname === item.path || pathname.startsWith(`${item.path}/`);
    if (matches && (!best || item.path.length > best.path.length)) best = item;
  }
  return best?.key ?? null;
}

const itemClass = (active: boolean) =>
  cn(
    'flex min-h-10 items-center gap-3 rounded-control px-3 text-label transition-colors duration-150',
    active
      ? 'bg-accent-soft font-semibold text-accent'
      : 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground',
  );

export function Sidebar({
  groups,
  user,
  crestUrl,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  signOutAction,
}: {
  groups: readonly NavGroup[];
  user: ClientUser;
  crestUrl: string | null;
  collapsed: boolean;
  /** ไม่ส่ง = ไม่แสดงปุ่มยุบ (เมนูบนมือถือ) */
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const activeKey = useMemo(() => activeItemKey(groups, pathname), [groups, pathname]);
  const activeGroupId = groups.find((group) => group.items.some((item) => item.key === activeKey))?.id;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => openGroups[id] ?? (id === activeGroupId || id === groups[0]?.id);

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-[var(--topbar-height)] shrink-0 items-center', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Link href={HOME_PATH} onClick={onNavigate} className="min-w-0 rounded-control" aria-label="ไปหน้าแรก">
          <BrandLockup crestUrl={crestUrl} compact={collapsed} />
        </Link>
      </div>

      <nav aria-label="เมนูหลัก" className={cn('min-h-0 flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
        <ul className="flex flex-col gap-1">
          {groups.map((group) => {
            const groupActive = group.id === activeGroupId;
            const single = group.items.length === 1 ? group.items[0] : null;

            if (collapsed) {
              return (
                <li key={group.id}>
                  {single ? (
                    <Tooltip label={single.label} side="right">
                      <Link
                        href={single.path}
                        aria-label={single.label}
                        aria-current={single.key === activeKey ? 'page' : undefined}
                        className={cn(itemClass(groupActive), 'justify-center px-0')}
                      >
                        <AppIcon name={group.icon} />
                      </Link>
                    </Tooltip>
                  ) : (
                    <DropdownMenu>
                      <Tooltip label={group.label} side="right">
                        <DropdownMenuTrigger
                          aria-label={group.label}
                          className={cn(itemClass(groupActive), 'w-full justify-center px-0')}
                        >
                          <AppIcon name={group.icon} />
                        </DropdownMenuTrigger>
                      </Tooltip>
                      <DropdownMenuContent side="right" align="start" sideOffset={12}>
                        <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                        {group.items.map((item) => (
                          <DropdownMenuItem key={item.key} asChild>
                            <Link href={item.path} aria-current={item.key === activeKey ? 'page' : undefined}>
                              <AppIcon name={item.icon} />
                              {item.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            }

            if (single) {
              return (
                <li key={group.id}>
                  <Link
                    href={single.path}
                    onClick={onNavigate}
                    aria-current={single.key === activeKey ? 'page' : undefined}
                    className={itemClass(single.key === activeKey)}
                  >
                    <AppIcon name={group.icon} className="shrink-0" />
                    <span className="truncate">{single.label}</span>
                  </Link>
                </li>
              );
            }

            const open = isOpen(group.id);
            return (
              <li key={group.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`nav-group-${group.id}`}
                  onClick={() => setOpenGroups((state) => ({ ...state, [group.id]: !open }))}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-left text-label transition-colors duration-150',
                    groupActive ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground',
                  )}
                >
                  <AppIcon name={group.icon} className={cn('shrink-0', groupActive && 'text-accent')} />
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <ChevronDown
                    aria-hidden
                    className={cn('size-4 shrink-0 transition-transform duration-200 ease-out', open ? 'rotate-0' : '-rotate-90')}
                  />
                </button>
                <div
                  id={`nav-group-${group.id}`}
                  className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  )}
                >
                  {/* เส้นประเชื่อมโยงของเมนูย่อย */}
                  <ul className={cn('ml-[1.3125rem] min-h-0 overflow-hidden', open && 'thread-y w-auto pl-3')} inert={!open}>
                    {group.items.map((item) => {
                      const active = item.key === activeKey;
                      return (
                        <li key={item.key} className="py-0.5">
                          <Link
                            href={item.path}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            className={cn(itemClass(active), 'min-h-9 px-2.5')}
                          >
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn('shrink-0 border-t border-border/70 py-3', collapsed ? 'px-2' : 'px-3')}>
        {onToggleCollapsed ? (
          <Tooltip label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'} side="right">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              aria-pressed={collapsed}
              className={cn(itemClass(false), 'mb-2 w-full', collapsed && 'justify-center px-0')}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
              ) : (
                <PanelLeftClose className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
              )}
              {collapsed ? null : <span>ย่อเมนู</span>}
            </button>
          </Tooltip>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`บัญชีของ ${user.displayName}`}
            className={cn(
              'flex w-full items-center gap-3 rounded-[0.75rem] text-left transition-colors duration-150 hover:bg-surface-subtle',
              collapsed ? 'justify-center p-1' : 'p-2',
            )}
          >
            <Avatar src={user.avatarUrl} initials={user.initials} name={user.displayName} className="size-9" />
            {collapsed ? null : (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-label font-semibold text-foreground">{user.displayName}</span>
                <span className="block truncate text-caption text-muted-foreground">
                  {user.position ?? user.roleNames[0] ?? ''}
                </span>
                {user.departmentName ? (
                  <span className="block truncate text-caption text-muted-foreground">{user.departmentName}</span>
                ) : null}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <div className="px-2.5 py-2">
              <p className="truncate text-label font-semibold text-foreground">{user.displayName}</p>
              <p className="truncate text-caption text-muted-foreground">{user.email}</p>
              <p className="mt-1.5 text-caption text-muted-foreground">บทบาท: {user.roleNames.join(' · ')}</p>
            </div>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem asChild tone="danger">
                <button type="submit" className="w-full">
                  <LogOut strokeWidth={1.75} aria-hidden />
                  ออกจากระบบ
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
