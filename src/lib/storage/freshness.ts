/**
 * Read-your-writes ข้าม serverless instance
 *
 * cache ของแต่ละ instance อาจเก่ากว่าการเขียนที่เพิ่งเกิดบน instance อื่น
 * หลังผู้ใช้เขียนข้อมูลสำเร็จ ระบบตั้ง cookie อายุสั้นเก็บ "เวลาที่เขียนล่าสุด"
 * คำขอถัดไปของผู้ใช้คนเดิมจะบังคับให้อ่านข้อมูลที่ใหม่กว่าเวลานั้นเสมอ
 * (cookie นี้ไม่มีข้อมูลใดนอกจากเวลา และไม่มีผลต่อสิทธิ์การเข้าถึง)
 */
import 'server-only';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'tuns_fresh';
const MAX_AGE_SECONDS = 90;

export async function getMinFreshAt(): Promise<number | undefined> {
  try {
    const store = await cookies();
    const value = Number(store.get(COOKIE_NAME)?.value);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    // อยู่นอก request scope (สคริปต์/การทดสอบ)
    return undefined;
  }
}

export async function markWrite(at: number = Date.now()): Promise<void> {
  try {
    const store = await cookies();
    store.set(COOKIE_NAME, String(at), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    });
  } catch {
    // ตั้ง cookie ไม่ได้ระหว่าง render ของ Server Component หรือนอก request — ข้ามได้อย่างปลอดภัย
  }
}
