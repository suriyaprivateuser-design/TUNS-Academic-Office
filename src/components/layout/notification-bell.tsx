'use client';

import { CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AppIcon } from '@/components/shared/app-icon';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { notificationTypeLabel } from '@/config/reference';
import { fetchNotificationsAction, markNotificationsReadAction } from '@/features/shell/actions';
import { cn } from '@/lib/utils/cn';
import { formatThaiDateTime } from '@/lib/utils/thai-date';
import type { NotificationView } from '@/services/notifications';

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [synced, setSynced] = useState(initialUnread);
  const [pending, startTransition] = useTransition();

  // จำนวนที่ยังไม่อ่านจาก Server เปลี่ยนเมื่อมีการนำทางหรือ refresh
  if (synced !== initialUnread) {
    setSynced(initialUnread);
    setUnread(initialUnread);
  }

  const load = () =>
    startTransition(async () => {
      const result = await fetchNotificationsAction();
      if (result.ok) {
        setItems(result.data.items);
        setUnread(result.data.unread);
      } else {
        setItems([]);
      }
    });

  const markAll = () =>
    startTransition(async () => {
      const result = await markNotificationsReadAction('all');
      if (result.ok) {
        setUnread(0);
        setItems((current) => current?.map((item) => ({ ...item, isRead: true })) ?? null);
        router.refresh();
      }
    });

  const openItem = (item: NotificationView) => {
    setOpen(false);
    if (!item.isRead) {
      setUnread((count) => Math.max(0, count - 1));
      void markNotificationsReadAction({ ids: [item.id] }).then(() => router.refresh());
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <Tooltip label="การแจ้งเตือน" side="bottom">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={unread > 0 ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : 'การแจ้งเตือน'}
            className="relative"
          >
            <AppIcon name="notification" size={20} />
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-accent px-1 text-[0.6875rem] leading-none font-semibold text-white tabular-nums ring-2 ring-background">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[23rem] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <p className="text-label font-semibold">การแจ้งเตือน</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={unread === 0 || pending}>
            <CheckCheck className="size-4" strokeWidth={1.75} aria-hidden />
            อ่านแล้วทั้งหมด
          </Button>
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {items === null ? (
            <div className="flex flex-col gap-3 p-4" aria-label="กำลังโหลดการแจ้งเตือน" role="status">
              {[0, 1, 2].map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              compact
              illustration="empty-notifications"
              title="ยังไม่มีการแจ้งเตือน"
              description="เมื่อมีเอกสารรอพิจารณาหรือผลการอนุมัติ จะแจ้งให้ทราบที่นี่"
            />
          ) : (
            <ul>
              {items.map((item) => {
                const body = (
                  <>
                    <span
                      aria-hidden
                      className={cn('mt-2 size-2 shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-accent')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-label', item.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
                        {item.title}
                      </span>
                      {item.body ? <span className="block truncate text-caption text-muted-foreground">{item.body}</span> : null}
                      <span className="block text-caption text-muted-foreground">
                        {notificationTypeLabel(item.type)} · {formatThaiDateTime(item.createdAt)}
                        {item.isRead ? '' : ' · ยังไม่อ่าน'}
                      </span>
                    </span>
                  </>
                );
                const className = 'flex w-full gap-2.5 px-4 py-3 text-left transition-colors duration-100 hover:bg-surface-subtle';
                return (
                  <li key={item.id} className="border-b border-border/60 last:border-b-0">
                    {item.linkPath ? (
                      <Link href={item.linkPath} onClick={() => openItem(item)} className={className}>
                        {body}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => openItem(item)} className={className}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border/70 p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              ดูการแจ้งเตือนทั้งหมด
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
