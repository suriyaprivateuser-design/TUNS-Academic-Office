/**
 * ป้ายชื่อของเส้นทาง สำหรับ Breadcrumb และชื่อหน้าใน Topbar (ใช้ได้ทั้ง Server และ Client)
 */
import { MODULES, SUBSYSTEMS } from './modules';

export const HOME_PATH = '/workspace';

export interface Crumb {
  label: string;
  href: string | null;
}

interface RouteLabel {
  pattern: RegExp;
  /** เส้นทางของระบบย่อยที่หน้านี้สังกัด */
  parent: string;
  label: string;
}

/** หน้าลูกของระบบย่อย (หน้าสร้าง/รายละเอียด/แก้ไข) */
const CHILD_ROUTES: RouteLabel[] = [
  { pattern: /^\/class-leave\/new$/, parent: '/class-leave', label: 'สร้างคำร้องใหม่' },
  { pattern: /^\/class-leave\/[^/]+\/edit$/, parent: '/class-leave', label: 'แก้ไขคำร้อง' },
  {
    pattern: /^\/class-leave\/(?!new$|approvals$|notices$|attendance$|analytics$)[^/]+$/,
    parent: '/class-leave',
    label: 'รายละเอียดคำร้อง',
  },
  { pattern: /^\/documents\/approvals\/[^/]+$/, parent: '/documents/approvals', label: 'รายละเอียดเอกสาร' },
  { pattern: /^\/settings\/setup$/, parent: '/settings', label: 'ตั้งค่าเริ่มต้น' },
  { pattern: /^\/settings\/system-health$/, parent: '/settings', label: 'สถานะระบบ' },
  { pattern: /^\/settings\/roadmap$/, parent: '/settings', label: 'สถานะการพัฒนาระบบ' },
  { pattern: /^\/settings\/users$/, parent: '/settings', label: 'ผู้ใช้และบทบาท' },
  { pattern: /^\/settings\/audit-log$/, parent: '/settings', label: 'Audit Log' },
];

function subsystemCrumbs(path: string): Crumb[] | null {
  const subsystem = SUBSYSTEMS.find((item) => item.path === path);
  if (!subsystem) return null;
  const moduleDef = MODULES.find((item) => item.id === subsystem.moduleId);
  return [
    { label: moduleDef?.navLabel ?? '', href: null },
    { label: subsystem.navLabel, href: subsystem.path },
  ];
}

export function breadcrumbFor(pathname: string): Crumb[] {
  const direct = subsystemCrumbs(pathname);
  if (direct) return direct.map((crumb, index) => (index === direct.length - 1 ? { ...crumb, href: null } : crumb));
  const child = CHILD_ROUTES.find((route) => route.pattern.test(pathname));
  if (child) {
    return [...(subsystemCrumbs(child.parent) ?? []), { label: child.label, href: null }];
  }
  return [];
}

/** เส้นทางที่ใช้ redirect หลังเข้าสู่ระบบได้: ต้องเป็นเส้นทางภายในเท่านั้น (กัน open redirect) */
export function safeInternalPath(value: string | null | undefined, fallback: string = HOME_PATH): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  try {
    const url = new URL(value, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
