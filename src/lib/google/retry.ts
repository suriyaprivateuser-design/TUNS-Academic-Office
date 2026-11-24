/**
 * Retry with Exponential Backoff + Jitter สำหรับ Google API (ข้อ 26 — API Rate Limit Handling)
 * ไม่ผูกกับ Google โดยตรง จึงใช้กับ Write Gateway และบริการภายนอกอื่นได้
 */

export interface RetryOptions {
  /** จำนวนครั้งสูงสุดรวมครั้งแรก */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** ตัดสินว่าข้อผิดพลาดนี้ควรลองใหม่หรือไม่ และ (ถ้ามี) ต้องรออย่างน้อยกี่ ms ตาม Retry-After */
  shouldRetry: (error: unknown, attempt: number) => boolean | { retryAfterMs: number };
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  // "equal jitter": รออย่างน้อยครึ่งหนึ่งเสมอ เพื่อไม่ให้คำขอจำนวนมากกลับมาชนกันพร้อมกัน
  return Math.round(exponential / 2 + (exponential / 2) * random());
}

export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await task(attempt);
    } catch (error) {
      const decision = attempt >= maxAttempts ? false : options.shouldRetry(error, attempt);
      if (!decision) throw error;
      let delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs, random);
      if (typeof decision === 'object') delayMs = Math.max(delayMs, decision.retryAfterMs);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
