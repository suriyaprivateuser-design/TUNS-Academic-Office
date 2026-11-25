import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/layout/brand';
import { Notice } from '@/components/shared/notice';
import { Button } from '@/components/ui/button';
import { safeInternalPath } from '@/config/routes';
import { SYSTEM } from '@/config/school';
import { signInDemoAction, signInWithGoogleAction } from '@/features/auth/actions';
import { getCurrentUser } from '@/lib/auth/session';
import { getDataDriver, getGoogleOAuthConfig, getGoogleWorkspaceStatus, isDemoLoginEnabled } from '@/lib/env';
import { getDb } from '@/repositories/db';
import { ensureReady } from '@/services/bootstrap';
import { listDemoPersonas } from '@/services/identity';
import { getSchoolIdentity } from '@/services/settings';

export const metadata: Metadata = { title: 'เข้าสู่ระบบ' };

const ERROR_MESSAGE: Record<string, string> = {
  not_allowed:
    'บัญชี Google นี้ยังไม่ได้รับอนุญาตให้ใช้ระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อขอเพิ่มบัญชี',
  suspended: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
  account_mismatch:
    'อีเมลนี้ผูกกับบัญชี Google อื่นอยู่แล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบ',
  email_not_verified: 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล จึงเข้าสู่ระบบไม่ได้',
  setup_required: 'ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google กรุณาติดต่อผู้ดูแลระบบ',
  AccessDenied: 'บัญชีนี้ไม่ได้รับอนุญาตให้ใช้ระบบ กรุณาติดต่อผู้ดูแลระบบ',
  Configuration: 'การตั้งค่าการเข้าสู่ระบบยังไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ',
};

function GoogleLogo() {
  // เครื่องหมาย Google ตามแนวทางการใช้ปุ่ม Sign in with Google (ห้ามเปลี่ยนสี)
  return (
    <svg viewBox="0 0 18 18" className="size-[1.125rem]" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next);
  const existing = await getCurrentUser();
  if (existing) redirect(next);

  const driver = getDataDriver();
  const googleSignIn = getGoogleOAuthConfig() !== null;
  const demoLogin = isDemoLoginEnabled();
  const storageReady = driver === 'local' || getGoogleWorkspaceStatus().configured;

  let personas: Awaited<ReturnType<typeof listDemoPersonas>> = [];
  let schoolName: string = SYSTEM.schoolNameTh;
  let adminContact: string | null = null;
  let crest = false;
  if (storageReady) {
    try {
      await ensureReady();
      const db = getDb();
      const school = await getSchoolIdentity(db);
      schoolName = school.schoolName;
      adminContact = school.adminContact;
      crest = school.crestFileId !== null;
      if (demoLogin) personas = await listDemoPersonas(db);
    } catch {
      // หน้า Login ต้องแสดงได้เสมอ แม้ที่เก็บข้อมูลยังไม่พร้อม
    }
  }
  const error = params.error ? (ERROR_MESSAGE[params.error] ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง') : null;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col bg-surface px-6 py-8 sm:px-10 lg:px-16">
        <div className="flex items-center gap-3">
          <BrandMark crestUrl={crest ? '/api/public/school-crest' : null} className="size-11" />
          <div className="leading-tight">
            <p className="text-label font-bold text-foreground">{SYSTEM.nameEn}</p>
            <p className="text-caption text-muted-foreground">{SYSTEM.unitNameTh}</p>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-display font-bold text-foreground">{SYSTEM.nameTh}</h1>
          <p className="mt-2 text-subheading text-muted-foreground">{schoolName}</p>
          <p className="mt-6 max-w-[42ch] text-body text-muted-foreground">
            ยินดีต้อนรับสู่สำนักงานวิชาการดิจิทัล เข้าสู่ระบบด้วยบัญชี Google ที่โรงเรียนอนุญาตเพื่อเริ่มใช้งาน
          </p>

          {error ? (
            <Notice tone="danger" title="เข้าสู่ระบบไม่สำเร็จ" className="mt-6">
              {error}
            </Notice>
          ) : null}

          <div className="mt-8 flex flex-col gap-3">
            {googleSignIn ? (
              <form action={signInWithGoogleAction}>
                <input type="hidden" name="next" value={next} />
                <Button type="submit" variant="secondary" size="lg" className="h-12 w-full gap-3 text-body font-semibold">
                  <GoogleLogo />
                  เข้าสู่ระบบด้วย Google
                </Button>
              </form>
            ) : (
              <Notice tone={demoLogin ? 'info' : 'warning'} title="ยังไม่ได้ตั้งค่า Google Sign-in">
                {demoLogin
                  ? 'สภาพแวดล้อมนี้ยังไม่ได้เชื่อมต่อ Google Workspace จึงใช้ได้เฉพาะบัญชีสาธิตด้านล่าง'
                  : 'ผู้ดูแลระบบต้องตั้งค่า GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ก่อนจึงจะเข้าสู่ระบบได้'}
              </Notice>
            )}
          </div>

          {demoLogin && personas.length > 0 ? (
            <section aria-labelledby="demo-heading" className="mt-8">
              <div className="flex items-center gap-3">
                <span className="thread-x flex-1" aria-hidden />
                <h2 id="demo-heading" className="text-label font-semibold text-foreground">
                  บัญชีสาธิต (Demo Data)
                </h2>
                <span className="thread-x flex-1" aria-hidden />
              </div>
              <p className="mt-2 text-caption text-muted-foreground">
                ใช้ได้เฉพาะในสภาพแวดล้อมพัฒนา/ทดสอบที่เก็บข้อมูลสาธิต ไม่ใช่บัญชีและข้อมูลจริงของโรงเรียน
              </p>
              <ul className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {personas.map((persona) => (
                  <li key={persona.id}>
                    <form action={signInDemoAction}>
                      <input type="hidden" name="userId" value={persona.id} />
                      <input type="hidden" name="next" value={next} />
                      <button
                        type="submit"
                        className="w-full rounded-control border border-border px-3 py-2 text-left transition-colors duration-150 hover:border-accent hover:bg-accent-soft/50"
                      >
                        <span className="block truncate text-label font-semibold text-foreground">{persona.displayName}</span>
                        <span className="block truncate text-caption text-muted-foreground">
                          {persona.roleNames.join(' · ')}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-caption text-muted-foreground">
          <Link href="/privacy" className="underline hover:text-foreground">
            นโยบายความเป็นส่วนตัว
          </Link>
          <p>
            {adminContact
              ? `ติดต่อผู้ดูแลระบบ: ${adminContact}`
              : 'พบปัญหาการเข้าสู่ระบบ ติดต่อผู้ดูแลระบบของกลุ่มบริหารวิชาการ'}
          </p>
        </footer>
      </section>

      <section className="relative hidden flex-col justify-between overflow-hidden bg-accent-soft px-12 py-10 lg:flex">
        <p className="flex items-center gap-2 self-end text-label text-accent">
          <ShieldCheck className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
          เฉพาะบุคลากรที่ได้รับอนุญาต
        </p>
        <Image
          src="/illustrations/login-academic-office.svg"
          alt=""
          width={640}
          height={560}
          priority
          unoptimized
          className="mx-auto h-auto w-full max-w-[34rem]"
        />
        <div className="max-w-[30rem]">
          <p className="text-title font-bold text-foreground">{SYSTEM.taglineTh}</p>
          <p className="mt-1 text-body text-muted-foreground">{SYSTEM.taglineEn}</p>
        </div>
      </section>
    </main>
  );
}
