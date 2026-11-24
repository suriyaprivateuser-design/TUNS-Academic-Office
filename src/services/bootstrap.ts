/**
 * Bootstrap — เตรียมที่เก็บข้อมูลให้พร้อมก่อนใช้งานครั้งแรกของ process
 *
 *   - โหมด Google: ไม่ทำอะไรโดยอัตโนมัติ การสร้างโครงสร้างและข้อมูลตั้งต้นทำผ่าน Setup Wizard
 *     โดยผู้ดูแลระบบเท่านั้น (ไม่มีการสร้างหรือแก้ไขข้อมูลจริงของโรงเรียนโดยไม่ได้รับอนุญาต)
 *   - โหมด local (Development/ทดสอบ): เติมข้อมูลสาธิตเมื่อฐานข้อมูลยังว่าง
 */
import 'server-only';
import { getDataDriver } from '@/lib/env';

interface BootstrapGlobals {
  __tunsReady?: Promise<void>;
}

const globals = globalThis as typeof globalThis & BootstrapGlobals;

async function prepare(): Promise<void> {
  if (getDataDriver() !== 'local') return;
  const { seedDemoDataIfEmpty } = await import('./demo-seed');
  await seedDemoDataIfEmpty();
}

/** เรียกได้ทุกคำขอ ทำงานจริงครั้งเดียวต่อ process (ถ้าล้มเหลวจะลองใหม่ในคำขอถัดไป) */
export function ensureReady(): Promise<void> {
  globals.__tunsReady ??= prepare().catch((error: unknown) => {
    globals.__tunsReady = undefined;
    throw error;
  });
  return globals.__tunsReady;
}

export function resetBootstrapForTests(): void {
  globals.__tunsReady = undefined;
}
