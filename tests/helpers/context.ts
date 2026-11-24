import { LocalDriveAdapter } from '@/lib/drive/local-drive';
import { LocalStorageAdapter } from '@/lib/storage/local-adapter';
import { Db } from '@/repositories/db';

/** ฐานข้อมูลและพื้นที่ไฟล์ในหน่วยความจำ ใหม่ทุกครั้งที่เรียก */
export function createTestContext() {
  const storage = new LocalStorageAdapter(null);
  const drive = new LocalDriveAdapter(null);
  const db = new Db(storage);
  return { storage, drive, db };
}

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
export const HTML_BYTES = new TextEncoder().encode('<!DOCTYPE html><html><script>alert(1)</script></html>');
