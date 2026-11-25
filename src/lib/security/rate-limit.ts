/**
 * Rate limiting แบบ fixed window ในหน่วยความจำ
 *
 * ข้อจำกัดที่ต้องรู้: บน serverless แต่ละ instance นับแยกกัน จึงเป็นการป้องกันขั้นต้น (best effort)
 * สำหรับ Production ให้ตั้ง rate limit ที่ชั้น platform (Vercel Firewall) ควบคู่ — ดู docs/SECURITY.md
 */
export interface RateLimitRule {
  /** จำนวนครั้งสูงสุดต่อช่วงเวลา */
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export const RATE_LIMITS = {
  /** การเขียนทั่วไป (บันทึกร่าง ส่ง อนุมัติ) */
  write: { limit: 60, windowMs: 60_000 },
  upload: { limit: 40, windowMs: 60_000 },
  search: { limit: 120, windowMs: 60_000 },
  /** งานที่เรียกบริการภายนอก เช่น ตรวจลิงก์ */
  external: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/** คืน true เมื่อยังอยู่ในโควตา (และนับครั้งนี้แล้ว) */
export function checkRateLimit(key: string, rule: RateLimitRule, now: number = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [existingKey, existing] of buckets) {
        if (existing.resetAt <= now) buckets.delete(existingKey);
      }
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  if (bucket.count >= rule.limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}
