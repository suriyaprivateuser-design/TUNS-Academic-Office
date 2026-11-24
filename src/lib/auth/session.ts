/**
 * Session helpers — ทางเดียวที่โค้ดส่วนอื่นใช้ถามว่า "ผู้ใช้ปัจจุบันคือใคร และทำอะไรได้"
 *
 * ทุก Server Component, Server Action และ Route Handler ที่แตะข้อมูลต้องเรียก
 * `requireUser()` หรือ `requireUserOrThrow()` ก่อนเสมอ (Proxy เป็นเพียงการตรวจเบื้องต้น ไม่ใช่ขอบเขตความปลอดภัย)
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { ResourceKey } from '@/config/modules';
import type { Action } from '@/config/permissions';
import { forbidden, unauthenticated } from '@/lib/errors';
import { getDb } from '@/repositories/db';
import { ensureReady } from '@/services/bootstrap';
import { loadCurrentUser, type CurrentUser } from '@/services/identity';
import { auth } from './index';

export type SessionUser = CurrentUser & { avatarUrl: string | null };

/** ข้อมูลผู้ใช้ที่ส่งให้ Client Component ได้ (ไม่มี PermissionSet และไม่มีข้อมูลเกินจำเป็น) */
export interface ClientUser {
  id: string;
  displayName: string;
  email: string;
  position: string | null;
  departmentName: string | null;
  roleNames: string[];
  avatarUrl: string | null;
  initials: string;
  isDemo: boolean;
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  await ensureReady();
  const user = await loadCurrentUser(getDb(), userId);
  if (!user) return null;
  return { ...user, avatarUrl: session.user?.image ?? null };
});

/** สำหรับหน้า (Server Component): ไม่มี session ที่ใช้ได้ → ไปหน้า Login */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** สำหรับ Server Action / Route Handler: โยน AppError แทนการ redirect */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

export async function requirePermission(
  resource: ResourceKey,
  action: Action,
): Promise<SessionUser> {
  const user = await requireUserOrThrow();
  if (!user.permissions.can(resource, action)) throw forbidden();
  return user;
}

export function initialsOf(name: string): string {
  const cleaned = name.replace(/^(นาย|นางสาว|นาง|ครู|ดร\.|ผอ\.|รองฯ)\s*/u, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? '')[0] ?? '';
  const second = parts.length > 1 ? (Array.from(parts[parts.length - 1] ?? '')[0] ?? '') : '';
  return (first + second).toUpperCase() || '?';
}

export function toClientUser(user: SessionUser): ClientUser {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    position: user.position,
    departmentName: user.departmentName,
    roleNames: user.roleNames,
    avatarUrl: user.avatarUrl,
    initials: initialsOf(user.displayName),
    isDemo: user.isDemo,
  };
}
