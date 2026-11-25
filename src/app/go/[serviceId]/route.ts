import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAppError } from '@/lib/errors';
import { getDb } from '@/repositories/db';
import { openService, type ServiceSource } from '@/services/service-hub';

export const dynamic = 'force-dynamic';

const SOURCES: readonly ServiceSource[] = ['hub', 'workspace', 'launcher', 'search'];

/**
 * เปิดลิงก์บริการวิชาการ: ตรวจ session และสิทธิ์ → บันทึกสถิติ → ส่งต่อไปยังปลายทาง
 * ปลายทางอ่านจากฐานข้อมูลตามรหัสบริการเท่านั้น ไม่รับ URL จากคำขอ (ไม่เป็น open redirect)
 */
export async function GET(request: NextRequest, context: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await context.params;
  const user = await getCurrentUser();
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `/go/${serviceId}`);
    return NextResponse.redirect(login);
  }
  const from = request.nextUrl.searchParams.get('from');
  const source = SOURCES.find((value) => value === from) ?? 'hub';
  try {
    const target = await openService(getDb(), user, serviceId, source);
    const destination = target.type === 'internal' ? new URL(target.path, request.url) : target.url;
    return NextResponse.redirect(destination, {
      status: 303,
      headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' },
    });
  } catch (error) {
    const reason = isAppError(error) && error.code === 'VALIDATION' ? 'not-configured' : 'not-found';
    return NextResponse.redirect(new URL(`/services?notice=${reason}`, request.url), { status: 303 });
  }
}
