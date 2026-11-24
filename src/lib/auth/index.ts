/**
 * Authentication — Auth.js (next-auth v5) + Google OpenID Connect
 *
 * ไฟล์นี้เป็นจุดเดียวที่ผูกกับ Auth.js ส่วนอื่นของระบบใช้ `getCurrentUser()` / `requireUser()`
 * จาก ./session เท่านั้น จึงเปลี่ยนไลบรารียืนยันตัวตนได้ในจุดเดียว
 *
 * กระบวนการ (ข้อ 09):
 *   1. ผู้ใช้เข้าสู่ระบบผ่าน Google OAuth (Auth.js ตรวจ state, PKCE และลายเซ็นของ ID Token)
 *   2. callback `signIn` ตรวจอีเมลที่ยืนยันแล้ว + allowlist + สถานะบัญชี (resolveGoogleSignIn)
 *   3. session เป็น JWT ที่เข้ารหัส เก็บเพียงรหัสผู้ใช้ภายใน บทบาทและสิทธิ์อ่านจากฐานข้อมูลทุกคำขอ
 */
import 'server-only';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { getGoogleOAuthConfig, isDemoLoginEnabled, isProduction } from '@/lib/env';
import { getDb } from '@/repositories/db';
import { Users } from '@/schemas/database/master';
import { ensureReady } from '@/services/bootstrap';
import { loadCurrentUser, resolveGoogleSignIn } from '@/services/identity';

export const DEMO_PROVIDER_ID = 'demo';

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** ใช้เฉพาะตอนพัฒนาบนเครื่องเมื่อยังไม่ได้ตั้ง AUTH_SECRET — Production ต้องตั้งค่าเองเสมอ */
const DEVELOPMENT_SECRET = 'tuns-academic-office-development-only-secret';

function buildConfig(): NextAuthConfig {
  const providers: NextAuthConfig['providers'] = [];
  const google = getGoogleOAuthConfig();

  if (google) {
    providers.push(
      Google({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        authorization: {
          params: {
            prompt: 'select_account',
            // `hd` เป็นเพียงคำแนะนำให้หน้าเลือกบัญชีของ Google การอนุญาตจริงตัดสินที่ callback signIn
            ...(google.workspaceDomain ? { hd: google.workspaceDomain } : {}),
          },
        },
      }),
    );
  }

  if (isDemoLoginEnabled()) {
    providers.push(
      Credentials({
        id: DEMO_PROVIDER_ID,
        name: 'Demo',
        credentials: { userId: {} },
        async authorize(credentials) {
          // ตรวจซ้ำทุกครั้ง: บัญชีสาธิตใช้ได้เฉพาะเมื่อระบบใช้ที่เก็บข้อมูลสาธิต
          if (!isDemoLoginEnabled()) return null;
          await ensureReady();
          const db = getDb();
          const user = await loadCurrentUser(db, String(credentials?.userId ?? ''));
          if (!user?.isDemo) return null;
          await db
            .unitOfWork({ action: 'auth.login', actorId: user.id })
            .audit({
              action: 'auth.login',
              category: 'auth',
              resource: 'system',
              entityType: 'user',
              entityId: user.id,
              summary: 'เข้าสู่ระบบด้วยบัญชีสาธิต',
            })
            .commit();
          return { id: user.id, name: user.displayName, email: user.email };
        },
      }),
    );
  }

  return {
    providers,
    secret: process.env.AUTH_SECRET || (isProduction() ? undefined : DEVELOPMENT_SECRET),
    session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: '/login', error: '/login' },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider === DEMO_PROVIDER_ID) return isDemoLoginEnabled();
        if (account?.provider !== 'google' || !profile?.sub || !profile.email) return false;
        await ensureReady();
        const result = await resolveGoogleSignIn(getDb(), {
          sub: profile.sub,
          email: profile.email,
          emailVerified: profile.email_verified === true,
          name: profile.name,
        });
        return result.ok ? true : `/login?error=${result.reason}`;
      },
      async jwt({ token, user, account, profile }) {
        if (account?.provider === DEMO_PROVIDER_ID && user?.id) {
          token.uid = user.id;
          token.provider = DEMO_PROVIDER_ID;
        } else if (account?.provider === 'google' && profile?.sub) {
          const sub = profile.sub;
          const row = await getDb()
            .repo(Users)
            .find((candidate) => candidate.google_sub === sub);
          token.uid = row?.id ?? null;
          token.provider = 'google';
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) session.user.id = typeof token.uid === 'string' ? token.uid : '';
        return session;
      },
    },
    events: {
      async signOut(message) {
        const uid = 'token' in message ? message.token?.uid : null;
        if (typeof uid !== 'string' || !uid) return;
        try {
          await getDb()
            .unitOfWork({ action: 'auth.logout', actorId: uid })
            .audit({
              action: 'auth.logout',
              category: 'auth',
              resource: 'system',
              entityType: 'user',
              entityId: uid,
              summary: 'ออกจากระบบ',
            })
            .commit();
        } catch {
          // การบันทึก log ล้มเหลวต้องไม่ขวางการออกจากระบบ
        }
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
