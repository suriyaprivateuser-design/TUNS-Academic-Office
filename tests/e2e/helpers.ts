import { expect, type Page } from '@playwright/test';

export type Persona =
  | 'admin'
  | 'director'
  | 'deputy'
  | 'academic-head'
  | 'staff'
  | 'head-sci'
  | 'unit-head'
  | 'teacher-sci'
  | 'teacher-mat'
  | 'teacher-tha'
  | 'teacher-soc'
  | 'teacher-occ'
  | 'auditor';

/** เข้าสู่ระบบด้วยบัญชีสาธิต (มีเฉพาะเมื่อใช้ที่เก็บข้อมูล local) */
export async function loginAs(page: Page, persona: Persona): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.locator(`form:has(input[name="userId"][value="demo-user-${persona}"]) button`).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).first()).toBeVisible();
}

/** ชื่อไม่ซ้ำสำหรับข้อมูลที่การทดสอบสร้างขึ้น — ฐานข้อมูลใช้ร่วมกันทั้งชุดทดสอบ */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** หน้าต้องไม่มีแถบเลื่อนแนวนอน (ข้อ 31 Responsive) */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}
