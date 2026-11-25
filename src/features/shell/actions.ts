'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/lib/actions';
import { signOut } from '@/lib/auth';
import { requireUserOrThrow } from '@/lib/auth/session';
import { getDb } from '@/repositories/db';
import {
  listNotifications,
  markNotificationsRead,
  type NotificationView,
} from '@/services/notifications';

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}

export async function fetchNotificationsAction(): Promise<
  ActionResult<{ items: NotificationView[]; unread: number }>
> {
  return runAction(async () => {
    const user = await requireUserOrThrow();
    const { items, unread } = await listNotifications(getDb(), user.id, { limit: 6 });
    return { items, unread };
  });
}

export async function markNotificationsReadAction(
  target: { ids: string[] } | 'all',
): Promise<ActionResult<{ marked: number }>> {
  return runAction(async () => {
    const user = await requireUserOrThrow();
    user.permissions.assertCan('dashboard.notifications', 'edit');
    const ids = target === 'all' ? 'all' : { ids: target.ids.slice(0, 200).map(String) };
    const marked = await markNotificationsRead(getDb(), user.id, ids);
    revalidatePath('/', 'layout');
    return { marked };
  });
}
