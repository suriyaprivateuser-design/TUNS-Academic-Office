'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/lib/actions';
import { requireUserOrThrow } from '@/lib/auth/session';
import { RATE_LIMITS } from '@/lib/security/rate-limit';
import { getDb } from '@/repositories/db';
import {
  checkServiceLink,
  patchService,
  reorderServices,
  saveService,
  setFavorite,
} from '@/services/service-hub';

function refresh() {
  revalidatePath('/services', 'layout');
  revalidatePath('/workspace');
}

export async function toggleFavoriteAction(serviceId: string, favorite: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserOrThrow();
    await setFavorite(getDb(), user, String(serviceId), Boolean(favorite));
    refresh();
  });
}

export async function saveServiceAction(
  input: unknown,
  target?: { id: string; expectedVersion: number },
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUserOrThrow().catch(() => null);
  return runAction(
    async () => {
      const current = user ?? (await requireUserOrThrow());
      const result = await saveService(getDb(), current, input, target);
      refresh();
      return result;
    },
    user ? { rateLimit: { key: `${user.id}:services.save`, rule: RATE_LIMITS.write } } : {},
  );
}

export async function patchServiceAction(
  id: string,
  patch: { isVisible?: boolean; isPinned?: boolean; archived?: boolean },
  expectedVersion: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserOrThrow();
    await patchService(
      getDb(),
      user,
      String(id),
      {
        isVisible: typeof patch.isVisible === 'boolean' ? patch.isVisible : undefined,
        isPinned: typeof patch.isPinned === 'boolean' ? patch.isPinned : undefined,
        archived: typeof patch.archived === 'boolean' ? patch.archived : undefined,
      },
      Number(expectedVersion),
    );
    refresh();
  });
}

export async function reorderServicesAction(categoryId: string, orderedIds: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserOrThrow();
    await reorderServices(getDb(), user, String(categoryId), orderedIds.map(String).slice(0, 500));
    refresh();
  });
}

export async function checkServiceLinkAction(
  id: string,
): Promise<ActionResult<{ result: string; message: string; httpStatus: number | null }>> {
  const user = await requireUserOrThrow().catch(() => null);
  return runAction(
    async () => {
      const current = user ?? (await requireUserOrThrow());
      const outcome = await checkServiceLink(getDb(), current, String(id));
      refresh();
      return outcome;
    },
    // การตรวจลิงก์ยิงคำขอออกภายนอก จึงจำกัดความถี่เข้มกว่าปกติ
    user ? { rateLimit: { key: `${user.id}:services.check`, rule: RATE_LIMITS.external } } : {},
  );
}
