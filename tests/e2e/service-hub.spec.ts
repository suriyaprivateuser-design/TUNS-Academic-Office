import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, loginAs, uniqueName } from './helpers';

// โดเมนสงวนสำหรับการทดสอบ (RFC 2606) — ไม่ใช่ URL ของโรงเรียน และไม่มีวัน resolve ได้จริง
const TEST_URL = 'https://service.example.test/app';

const card = (page: Page, name: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });

// จำกัดที่เนื้อหาหลัก — ข้อความแจ้ง (toast) ก็เป็น listitem และมีชื่อระบบอยู่ด้วย
const row = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name });

async function addService(page: Page, name: string, url = TEST_URL) {
  await page.goto('/services/manage');
  await page.getByRole('button', { name: 'เพิ่มระบบ' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/ชื่อระบบ \(ภาษาไทย\)/).fill(name);
  await dialog.getByLabel('URL', { exact: true }).fill(url);
  await dialog.getByRole('button', { name: 'เพิ่มระบบ' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, name)).toBeVisible();
}

test.describe('Academic Service Hub', () => {
  test('teacher browses, searches and keeps favourites; unconfigured services cannot be opened', async ({
    page,
  }) => {
    await loginAs(page, 'teacher-tha');
    await page.goto('/services');
    await expect(page.getByRole('heading', { level: 1, name: 'ศูนย์รวมระบบและบริการวิชาการ' })).toBeVisible();

    // ระบบของโรงเรียนที่ยังไม่มี URL จริง: แสดงสถานะ ไม่มีปุ่มเปิด
    const unconfigured = card(page, 'งานวัดและประเมินผล');
    await expect(unconfigured.getByText('ยังไม่ได้ตั้งค่าลิงก์')).toBeVisible();
    await expect(unconfigured.getByRole('link')).toHaveCount(0);

    // บริการที่เปิดได้ชี้ผ่านตัวบันทึกสถิติของระบบ ไม่ใช่ URL ตรง
    const drive = card(page, 'Google Drive');
    await expect(drive.getByRole('link', { name: /เข้าสู่ระบบ/ })).toHaveAttribute(
      'href',
      '/go/svc-google-drive?from=hub',
    );

    await page.getByRole('searchbox', { name: 'ค้นหาระบบและบริการ' }).fill('ทะเบียน');
    await expect(card(page, 'งานทะเบียนนักเรียน')).toBeVisible();
    await expect(card(page, 'Google Drive')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'ค้นหาระบบและบริการ' }).fill('ไม่มีระบบนี้แน่นอน');
    await expect(page.getByText('ไม่พบระบบที่ค้นหา')).toBeVisible();
    await page.getByRole('button', { name: 'แสดงทั้งหมด' }).click();

    // ติดดาวแล้วต้องอยู่หลังโหลดหน้าใหม่ และไปปรากฏในหน้ารายการโปรด
    await drive.getByRole('button', { name: /เพิ่มในรายการโปรด: Google Drive/ }).click();
    await expect(drive.getByRole('button', { name: /นำออกจากรายการโปรด: Google Drive/ })).toBeVisible();
    await page.reload();
    await expect(
      card(page, 'Google Drive').getByRole('button', { name: /นำออกจากรายการโปรด: Google Drive/ }),
    ).toBeVisible();

    await page.goto('/services/insights');
    const favorites = page.getByRole('list', { name: 'รายการโปรด' });
    await expect(favorites.getByText('Google Drive')).toBeVisible();
    // ครูไม่เห็นสถิติของทั้งหน่วยงาน
    await expect(page.getByRole('heading', { name: 'สถิติของทั้งหน่วยงาน' })).toHaveCount(0);

    await page.getByRole('button', { name: 'นำ Google Drive ออกจากรายการโปรด' }).click();
    await expect(page.getByText('ยังไม่มีรายการโปรด')).toBeVisible();
  });

  test('link management is hidden from and refused to people without the permission', async ({ page }) => {
    await loginAs(page, 'teacher-tha');
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'จัดการลิงก์' })).toHaveCount(0);
    await page.goto('/services/manage');
    await expect(page.getByText('คุณไม่มีสิทธิ์เข้าถึงหน้าจัดการลิงก์')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่มระบบ' })).toHaveCount(0);
  });

  test('staff adds a service: unsafe URLs are rejected, a valid one appears for everyone', async ({ page }) => {
    const name = uniqueName('ระบบทดสอบ');
    await loginAs(page, 'staff');
    await page.goto('/services/manage');
    await page.getByRole('button', { name: 'เพิ่มระบบ' }).click();
    const dialog = page.getByRole('dialog');

    // ชื่อว่าง → ข้อความกำกับที่ช่อง ไม่ส่งคำขอ
    await dialog.getByRole('button', { name: 'เพิ่มระบบ' }).click();
    await expect(dialog.getByText('กรุณาระบุชื่อระบบ')).toBeVisible();

    await dialog.getByLabel(/ชื่อระบบ \(ภาษาไทย\)/).fill(name);
    await dialog.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'เพิ่มระบบ' }).click();
    await expect(dialog.getByText(/อนุญาตเฉพาะลิงก์ที่ขึ้นต้นด้วย https/).first()).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('URL', { exact: true }).fill(TEST_URL);
    await dialog.getByRole('button', { name: 'เพิ่มระบบ' }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, name)).toContainText(TEST_URL);

    await loginAs(page, 'teacher-tha');
    await page.goto('/services');
    const link = card(page, name).getByRole('link', { name: /เข้าสู่ระบบ/ });
    await expect(link).toHaveAttribute('href', /^\/go\/[\w-]+\?from=hub$/);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    // การเปิดลิงก์: ระบบส่งต่อไปยังปลายทางที่บันทึกไว้เท่านั้น และนับเป็นการใช้งานล่าสุด
    const href = (await link.getAttribute('href')) ?? '';
    const response = await page.request.get(href, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe(TEST_URL);
    await page.goto('/services/insights');
    await expect(page.getByRole('list', { name: 'ใช้ล่าสุด' }).getByText(name)).toBeVisible();
  });

  test('staff hides, pins, reorders, archives and restores a service', async ({ page }) => {
    const name = uniqueName('ระบบจัดการ');
    await loginAs(page, 'staff');
    await addService(page, name);

    // ซ่อน → ผู้ใช้ทั่วไปไม่เห็น
    await page.getByRole('switch', { name: `แสดง ${name} ในศูนย์รวมระบบ` }).click();
    await expect(page.getByText('ซ่อนจากศูนย์รวมระบบแล้ว')).toBeVisible();
    await expect(row(page, name).getByText('ซ่อน', { exact: true })).toBeVisible();
    await page.goto('/services');
    await expect(card(page, name)).toHaveCount(0);

    await page.goto('/services/manage');
    await page.getByRole('switch', { name: `แสดง ${name} ในศูนย์รวมระบบ` }).click();
    await expect(page.getByText('แสดงในศูนย์รวมระบบแล้ว')).toBeVisible();

    // ปักหมุด
    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'ปักหมุดเป็นระบบสำคัญ' }).click();
    await expect(page.getByText('ปักหมุดเป็นระบบสำคัญแล้ว')).toBeVisible();

    // จัดลำดับด้วยคีย์บอร์ด: รายการใหม่อยู่ท้ายหมวด ย้ายขึ้น 1 ตำแหน่ง แล้วต้องคงอยู่หลังโหลดใหม่
    // ใช้ตัวเลือกแบบ CSS: ระหว่างที่เมนูกำลังปิด เนื้อหาด้านหลังยังถูกซ่อนจาก accessibility tree ชั่วครู่
    const items = page
      .locator('section', { has: page.locator('h2', { hasText: /^งานวิชาการ$/ }) })
      .locator('ul > li');
    const names = async () =>
      items.evaluateAll((nodes) => nodes.map((node) => node.querySelector('p span')?.textContent ?? ''));
    await expect(page.getByRole('menu')).toBeHidden();
    await expect.poll(async () => (await names()).at(-1)).toBe(name);
    const before = await names();
    const moved = [...before.slice(0, -2), name, before.at(-2)];
    const announcement = (text: string) => page.getByRole('status').filter({ hasText: text });
    await page.getByRole('button', { name: `จัดลำดับ ${name}` }).focus();
    await page.keyboard.press('Space');
    // รอคำประกาศสำหรับโปรแกรมอ่านหน้าจอก่อนกดปุ่มถัดไป (ตัวจัดลำดับเริ่มรับปุ่มลูกศรหลังหยิบเสร็จ)
    await expect(announcement(`กำลังย้าย ${name}: ลำดับ ${before.length} จาก ${before.length}`)).toHaveCount(1);
    await page.keyboard.press('ArrowUp');
    await expect(announcement(`กำลังย้าย ${name}: ลำดับ ${before.length - 1} จาก ${before.length}`)).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect(announcement(`วาง ${name} ที่ลำดับ ${before.length - 1} จาก ${before.length} แล้ว`)).toHaveCount(1);
    await expect.poll(names).toEqual(moved);
    await page.reload();
    await expect.poll(names).toEqual(moved);

    // ลากด้วยเมาส์กลับลงไปท้ายรายการ
    const handle = page.getByRole('button', { name: `จัดลำดับ ${name}` });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const target = await items.last().boundingBox();
    if (!from || !target) throw new Error('ไม่พบตำแหน่งของแถวที่จะลาก');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, target.y + target.height - 4, { steps: 12 });
    await page.mouse.up();
    await expect.poll(names).toEqual(before);
    await page.reload();
    await expect.poll(names).toEqual(before);

    // ทางเลือกที่ไม่ต้องลาก (เมนู): เลื่อนขึ้นแล้วเลื่อนลงกลับที่เดิม
    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'เลื่อนขึ้น' }).click();
    await expect.poll(names).toEqual(moved);

    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'เลื่อนลง' }).click();
    await expect.poll(names).toEqual(before);

    // จัดเก็บ → ต้องยืนยัน → หายจากทุกคน แต่กู้คืนได้
    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'จัดเก็บ' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText(name);
    await confirm.getByRole('button', { name: 'จัดเก็บ' }).click();
    await expect(confirm).toBeHidden();
    await expect(row(page, name)).toHaveCount(0);
    await page.goto('/services');
    await expect(card(page, name)).toHaveCount(0);

    await page.goto('/services/manage');
    await page.getByRole('button', { name: /จัดเก็บแล้ว/ }).click();
    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'กู้คืน' }).click();
    await expect(page.getByText(/กู้คืนแล้ว/)).toBeVisible();
    await page.getByRole('button', { name: /ซ่อนอยู่/ }).click();
    await expect(row(page, name)).toBeVisible();
  });

  test('staff edits a service and a stale edit from another tab is refused', async ({ page, context }) => {
    const name = uniqueName('ระบบแก้ไข');
    await loginAs(page, 'staff');
    await addService(page, name);

    // แท็บที่สองเปิดฟอร์มค้างไว้ก่อน
    const other = await context.newPage();
    await other.goto('/services/manage');
    await other.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await other.getByRole('menuitem', { name: 'แก้ไข' }).click();
    await expect(other.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'แก้ไข' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/ชื่อระบบ \(ภาษาไทย\)/)).toHaveValue(name);
    await dialog.getByLabel('คำอธิบายสั้น').fill('แก้ไขจากแท็บแรก');
    await dialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(dialog).toBeHidden();

    await other.getByRole('dialog').getByLabel('คำอธิบายสั้น').fill('แก้ไขทับจากแท็บที่สอง');
    await other.getByRole('dialog').getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(other.getByRole('dialog').getByRole('alert').first()).toBeVisible();
    await expect(other.getByRole('dialog')).toBeVisible();
    await other.close();

    await page.goto('/services');
    await expect(card(page, name)).toContainText('แก้ไขจากแท็บแรก');
  });

  test('link check reports the real outcome for an unreachable host', async ({ page }) => {
    const name = uniqueName('ระบบตรวจลิงก์');
    await loginAs(page, 'staff');
    await addService(page, name);
    await page.getByRole('button', { name: `ตัวเลือกของ ${name}` }).click();
    await page.getByRole('menuitem', { name: 'ตรวจลิงก์' }).click();
    // example.test ไม่มีอยู่จริง ผลที่ถูกต้องคือ “ติดต่อปลายทางไม่ได้” — ห้ามรายงานว่าใช้งานได้
    await expect(row(page, name).getByText('ติดต่อปลายทางไม่ได้')).toBeVisible({ timeout: 30_000 });
    await expect(row(page, name).getByText('ใช้งานได้')).toHaveCount(0);
    await page.getByRole('button', { name: /ลิงก์ควรตรวจสอบ/ }).click();
    await expect(row(page, name)).toBeVisible();
  });

  test('usage statistics show real counts with a chart and an equivalent table', async ({ page }) => {
    await loginAs(page, 'staff');
    await page.goto('/services/insights');
    await expect(page.getByRole('heading', { name: 'สถิติของทั้งหน่วยงาน' })).toBeVisible();
    await expect(page.getByText('ไม่ใช่จำนวนผู้ใช้ของเว็บไซต์ปลายทาง')).toBeVisible();

    const chart = page.getByRole('img', { name: /กราฟแท่งจำนวนครั้งที่เปิดลิงก์รายเดือน/ });
    await expect(chart).toBeVisible();
    const bars = chart.locator('.recharts-bar-rectangle');
    await expect(bars.first()).toBeVisible();
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThanOrEqual(2);

    // มุมมองตารางต้องมีจำนวนแถวเท่ากับจำนวนแท่ง และผลรวมตรงกับตัวเลขสรุป
    await page.getByRole('button', { name: 'ดูเป็นตาราง' }).click();
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(barCount + 1);
    const values = await page.getByRole('table').locator('tbody td').allTextContents();
    const sum = values.reduce((total, text) => total + Number(text.replace(/[^\d]/g, '')), 0);
    await expect(page.getByText(new RegExp(`รวม ${sum.toLocaleString('th-TH')} ครั้ง`))).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
});
