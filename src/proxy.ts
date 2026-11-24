/**
 * Proxy (ชื่อใหม่ของ Middleware ใน Next.js 16)
 *
 *   1. ตั้ง Content-Security-Policy แบบ nonce ต่อคำขอ
 *   2. ตรวจเบื้องต้นว่ามี session cookie หรือไม่ เพื่อพาผู้ที่ยังไม่เข้าสู่ระบบไปหน้า Login
 *
 * ข้อ 2 เป็นเพียงการอำนวยความสะดวก ไม่ใช่การควบคุมสิทธิ์ — การตรวจ session, สถานะบัญชี และสิทธิ์จริง
 * ทำที่ Server Component / Server Action / Route Handler ทุกครั้ง (src/lib/auth/session.ts)
 */
import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

/** เส้นทางที่เปิดได้โดยไม่ต้องเข้าสู่ระบบ */
const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/privacy(\/|$)/, /^\/verify(\/|$)/];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const directives = [
    "default-src 'self'",
    // สคริปต์: อนุญาตเฉพาะที่มี nonce ของคำขอนี้ (และที่สคริปต์เหล่านั้นโหลดต่อ)
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // style attribute ที่ React/Radix/Motion render ฝั่ง server ใช้ nonce ไม่ได้ จึงต้องอนุญาต inline style
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    // browser ส่งไฟล์ขนาดใหญ่ตรงไปยัง upload session ของ Google Drive
    "connect-src 'self' https://www.googleapis.com",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (!isPublic && !hasSession) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // ทุกหน้า ยกเว้น API (ตรวจสิทธิ์ในตัว handler เอง), ไฟล์ static ของ Next และไฟล์ใน public
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|illustrations|fonts|.*\\.(?:svg|png|jpg|ico|webmanifest)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
