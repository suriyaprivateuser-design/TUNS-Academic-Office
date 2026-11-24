/**
 * Notification Service — ระบบแจ้งเตือนกลาง (ข้อ 11 / 01.3)
 *
 * - การสร้างแจ้งเตือนเป็นส่วนหนึ่งของคำสั่งเขียนเดียวกับเหตุการณ์ที่ทำให้เกิด (UnitOfWork เดียวกัน)
 * - กันการแจ้งเตือนซ้ำด้วย dedupe key ต่อผู้รับ
 * - เนื้อหาแจ้งเตือนไม่มีรายชื่อนักเรียน ผู้รับเปิดดูรายละเอียดในระบบซึ่งตรวจสิทธิ์อีกครั้ง
 */
import 'server-only';
import type { NotificationType } from '@/config/reference';
import { notFound } from '@/lib/errors';
import type { Db, UnitOfWork } from '@/repositories/db';
import { Notifications } from '@/schemas/database/system';
import type { RowOf } from '@/schemas/database/types';

export type NotificationRow = RowOf<typeof Notifications>;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** เส้นทางภายในระบบสำหรับ Deep Link — ต้องขึ้นต้นด้วย `/` เท่านั้น */
  linkPath?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** เหตุการณ์เดียวกันสำหรับผู้รับคนเดียวกันจะไม่ถูกสร้างซ้ำ */
  dedupeKey?: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  isRead: boolean;
  createdAt: string;
}

function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkPath: row.link_path,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

/** เพิ่มคำสั่งสร้างแจ้งเตือนเข้า UnitOfWork โดยข้ามรายการที่ซ้ำ */
export async function addNotifications(
  db: Db,
  uow: UnitOfWork,
  inputs: readonly NotificationInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const repo = db.repo(Notifications);
  const existing = new Set(
    (await repo.all())
      .filter((row) => row.dedupe_key)
      .map((row) => `${row.user_id}\u001f${row.dedupe_key}`),
  );
  let added = 0;
  for (const input of inputs) {
    if (!input.userId) continue;
    const key = input.dedupeKey ? `${input.userId}\u001f${input.dedupeKey}` : null;
    if (key) {
      if (existing.has(key)) continue;
      existing.add(key);
    }
    const linkPath = input.linkPath?.startsWith('/') ? input.linkPath : null;
    const { mutation } = repo.insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link_path: linkPath,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      dedupe_key: input.dedupeKey ?? null,
      is_read: false,
    });
    // ความซ้ำถูกกรองด้านบนแล้ว ไม่ให้การแจ้งเตือนซ้ำ (ซึ่งไม่เสียหาย) ทำให้คำสั่งหลักล้มเหลว
    delete mutation.uniqueBy;
    uow.add(mutation);
    added += 1;
  }
  return added;
}

export interface NotificationQuery {
  unreadOnly?: boolean;
  type?: string | null;
  limit?: number;
  offset?: number;
}

export async function listNotifications(
  db: Db,
  userId: string,
  query: NotificationQuery = {},
): Promise<{ items: NotificationView[]; total: number; unread: number }> {
  const mine = (await db.repo(Notifications).filter((row) => row.user_id === userId)).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const filtered = mine.filter(
    (row) => (!query.unreadOnly || !row.is_read) && (!query.type || row.type === query.type),
  );
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
  return {
    items: filtered.slice(offset, offset + limit).map(toView),
    total: filtered.length,
    unread: mine.filter((row) => !row.is_read).length,
  };
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  return db.repo(Notifications).count((row) => row.user_id === userId && !row.is_read);
}

/** ทำเครื่องหมายอ่านแล้ว — เฉพาะการแจ้งเตือนของผู้ใช้เองเท่านั้น */
export async function markNotificationsRead(
  db: Db,
  userId: string,
  target: { ids: readonly string[] } | 'all',
): Promise<number> {
  const repo = db.repo(Notifications);
  const mine = await repo.filter((row) => row.user_id === userId && !row.is_read);
  const rows = target === 'all' ? mine : mine.filter((row) => target.ids.includes(row.id));
  if (target !== 'all' && rows.length === 0 && target.ids.length > 0) {
    // ไม่บอกว่ารายการมีอยู่หรือไม่ ถ้าไม่ใช่ของผู้ใช้
    const owned = await repo.filter((row) => row.user_id === userId && target.ids.includes(row.id));
    if (owned.length === 0) throw notFound();
    return 0;
  }
  if (rows.length === 0) return 0;
  const uow = db.unitOfWork({ action: 'notifications.markRead', actorId: userId });
  for (const row of rows) uow.add(repo.update(row.id, { is_read: true, read_at: uow.now }));
  await uow.commit();
  return rows.length;
}
