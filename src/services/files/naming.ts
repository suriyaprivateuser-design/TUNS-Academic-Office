/**
 * มาตรฐานชื่อไฟล์ (ข้อ 23)
 *
 *   TUNS-{MODULE_CODE}-{ACADEMIC_YEAR}-{REFERENCE_ID}-v{VERSION}.{EXTENSION}
 *   เช่น TUNS-CL-2569-0001-v01.pdf
 *
 * REFERENCE_ID เป็นเลขอ้างอิงภายในระบบ ไม่ใช่เลขหนังสือราชการ
 * เอกสารประกอบของ record เดียวกันมีส่วนต่อท้ายเพื่อไม่ให้ชื่อชนกัน เช่น 0001-A02 (เอกสารประกอบลำดับที่ 2)
 */
import { isModuleCode, type ModuleCode } from '@/config/reference';
import { validation } from '@/lib/errors';

export interface StoredFilenameParts {
  moduleCode: ModuleCode;
  academicYear: string;
  /** เลขอ้างอิง เช่น 0001 หรือ 0001-A02 (ตัวอักษร ตัวเลข และขีดกลางเท่านั้น) */
  referenceId: string;
  version: number;
  extension: string;
}

const REFERENCE_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
// อนุญาต token ของ sequence (เช่น {{seq:att:2}}) ซึ่ง Write Gateway จะแทนค่าตอนเขียน
const REFERENCE_WITH_TOKEN = /^(?:[A-Za-z0-9]|-(?=[A-Za-z0-9{])|\{\{seq:[A-Za-z0-9_]+(?::\d{1,2})?\}\})+$/;

export function buildStoredFilename(parts: StoredFilenameParts): string {
  if (!/^\d{4}$/.test(parts.academicYear)) throw validation('ปีการศึกษาในชื่อไฟล์ไม่ถูกต้อง');
  if (!REFERENCE_WITH_TOKEN.test(parts.referenceId)) {
    throw validation('เลขอ้างอิงในชื่อไฟล์ไม่ถูกต้อง');
  }
  if (!Number.isInteger(parts.version) || parts.version < 1 || parts.version > 99) {
    throw validation('เวอร์ชันของไฟล์ต้องอยู่ระหว่าง 1–99');
  }
  const extension = parts.extension.toLowerCase().replace(/^\./, '');
  if (!/^[a-z0-9]{1,5}$/.test(extension)) throw validation('นามสกุลไฟล์ไม่ถูกต้อง');
  const version = String(parts.version).padStart(2, '0');
  return `TUNS-${parts.moduleCode}-${parts.academicYear}-${parts.referenceId}-v${version}.${extension}`;
}

export function parseStoredFilename(filename: string): StoredFilenameParts | null {
  const match = /^TUNS-([A-Z]+)-(\d{4})-(.+)-v(\d{2})\.([a-z0-9]{1,5})$/.exec(filename);
  if (!match) return null;
  const [, moduleCode = '', academicYear = '', referenceId = '', version = '', extension = ''] = match;
  if (!isModuleCode(moduleCode) || !REFERENCE_PATTERN.test(referenceId)) return null;
  return { moduleCode, academicYear, referenceId, version: Number(version), extension };
}

/** ส่วนท้ายของเลขอ้างอิงภายใน เช่น CL-2569-0001 → 0001 */
export function referenceTail(referenceNo: string): string {
  const parts = referenceNo.split('-');
  return parts[parts.length - 1] ?? referenceNo;
}

/** นามสกุลไฟล์ตัวพิมพ์เล็กจากชื่อไฟล์ ("" เมื่อไม่มี) */
export function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  if (index <= 0 || index === filename.length - 1) return '';
  return filename.slice(index + 1).toLowerCase();
}

/**
 * ทำความสะอาดชื่อไฟล์เดิมของผู้ใช้ก่อนเก็บเป็น metadata และก่อนใช้ใน Content-Disposition
 * (ตัดเส้นทาง อักขระควบคุม และจำกัดความยาว)
 */
export function sanitizeOriginalFilename(filename: string): string {
  const base = filename.normalize('NFC').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'file';
  if (cleaned.length <= 180) return cleaned;
  const extension = extensionOf(cleaned);
  const stem = extension ? cleaned.slice(0, -(extension.length + 1)) : cleaned;
  return extension ? `${stem.slice(0, 170)}.${extension}` : stem.slice(0, 180);
}
