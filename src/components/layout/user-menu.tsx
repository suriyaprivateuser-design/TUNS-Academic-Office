'use client';

import { LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClientUser } from '@/lib/auth/session';

/** เมนูบัญชีผู้ใช้ที่ Topbar (ข้อ 08.3) */
export function UserMenu({ user, signOutAction }: { user: ClientUser; signOutAction: () => Promise<void> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`บัญชีของ ${user.displayName}`}
        className="rounded-full transition-shadow duration-150 hover:ring-4 hover:ring-accent-soft"
      >
        <Avatar src={user.avatarUrl} initials={user.initials} name={user.displayName} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate text-label font-semibold text-foreground">{user.displayName}</p>
          <p className="truncate text-caption text-muted-foreground">{user.email}</p>
          <p className="mt-1.5 text-caption text-muted-foreground">
            {[user.position, user.departmentName].filter(Boolean).join(' · ') || user.roleNames[0]}
          </p>
          <p className="text-caption text-muted-foreground">บทบาท: {user.roleNames.join(' · ')}</p>
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
  );
}
