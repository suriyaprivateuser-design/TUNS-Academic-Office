import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { getDrive } from '@/lib/drive';
import { toPublicError } from '@/lib/errors';
import { RATE_LIMITS, checkRateLimit } from '@/lib/security/rate-limit';
import { getDb } from '@/repositories/db';
import { globalSearch } from '@/services/search';

export const dynamic = 'force-dynamic';

/** Global Search — ผลลัพธ์ถูกกรองตามสิทธิ์ของผู้ใช้ที่ฝั่ง Server ก่อนส่งกลับ */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (!checkRateLimit(`${user.id}:search`, RATE_LIMITS.search)) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }
  try {
    const query = request.nextUrl.searchParams.get('q') ?? '';
    const groups = await globalSearch(getDb(), getDrive(), user, query);
    return NextResponse.json({ groups }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json({ error: publicError.code, message: publicError.message }, { status: 500 });
  }
}
