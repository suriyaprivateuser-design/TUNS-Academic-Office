/**
 * มาตรฐานของ Server Action ทั้งระบบ
 *
 * ทุก action คืน `ActionResult` (ไม่โยน exception ไปถึง browser) และข้อความผิดพลาดที่ส่งออก
 * เป็นข้อความสำหรับผู้ใช้เท่านั้น รายละเอียดภายในบันทึกที่ฝั่ง Server
 * การตรวจ session / สิทธิ์ / ข้อมูลนำเข้า ทำใน action และ service เสมอ ไม่พึ่งการซ่อนปุ่มในหน้าจอ
 */
import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { AppError, isAppError, toPublicError, type AppErrorCode } from '@/lib/errors';
import { checkRateLimit, type RateLimitRule } from '@/lib/security/rate-limit';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: AppErrorCode; message: string; fieldErrors?: Record<string, string> };
    };

export interface ActionOptions {
  /** จำกัดความถี่ต่อผู้ใช้ (คีย์ = รหัสผู้ใช้ + ชื่อ action) */
  rateLimit?: { key: string; rule: RateLimitRule };
}

export async function runAction<T>(
  task: () => Promise<T>,
  options: ActionOptions = {},
): Promise<ActionResult<T>> {
  try {
    if (options.rateLimit && !checkRateLimit(options.rateLimit.key, options.rateLimit.rule)) {
      throw new AppError('RATE_LIMITED');
    }
    return { ok: true, data: await task() };
  } catch (error) {
    // redirect() / notFound() ของ Next.js ทำงานด้วยการโยน error พิเศษ ต้องส่งต่อ
    unstable_rethrow(error);
    if (!isAppError(error) || error.code === 'INTERNAL' || error.code === 'INTEGRATION') {
      console.error('[action]', error);
    }
    return { ok: false, error: toPublicError(error) };
  }
}
