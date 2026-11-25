'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { safeInternalPath } from '@/config/routes';
import { DEMO_PROVIDER_ID, signIn } from '@/lib/auth';
import { getGoogleOAuthConfig, isDemoLoginEnabled } from '@/lib/env';

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = safeInternalPath(String(formData.get('next') ?? ''));
  if (!getGoogleOAuthConfig()) redirect('/login?error=setup_required');
  await signIn('google', { redirectTo: next });
}

/** เข้าสู่ระบบด้วยบัญชีสาธิต — ใช้ได้เฉพาะเมื่อระบบใช้ที่เก็บข้อมูลสาธิต (ตรวจซ้ำที่ provider) */
export async function signInDemoAction(formData: FormData): Promise<void> {
  const next = safeInternalPath(String(formData.get('next') ?? ''));
  if (!isDemoLoginEnabled()) redirect('/login?error=not_allowed');
  try {
    await signIn(DEMO_PROVIDER_ID, { userId: String(formData.get('userId') ?? ''), redirectTo: next });
  } catch (error) {
    if (error instanceof AuthError) redirect('/login?error=not_allowed');
    throw error;
  }
}
