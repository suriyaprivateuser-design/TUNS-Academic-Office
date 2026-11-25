/**
 * File Access Control — ตัดสินว่าผู้ใช้เปิดไฟล์ได้หรือไม่ (ข้อ 30)
 *
 * เรียกก่อน Preview / Download / Export ทุกครั้ง ผู้ใช้เข้าถึงไฟล์ผ่าน backend นี้เท่านั้น
 * ไฟล์ใน Google Drive ไม่ถูกเปิดเป็นสาธารณะ และรหัสไฟล์ที่เดาได้ไม่ช่วยให้เข้าถึงได้
 */
import 'server-only';
import { isModuleCode } from '@/config/reference';
import type { Db } from '@/repositories/db';
import { canViewRequest } from '../class-leave';
import type { CurrentUser } from '../identity';
import { MODULE_RESOURCE, type FileRow } from './routing';

export async function canReadFile(db: Db, user: CurrentUser, file: FileRow): Promise<boolean> {
  // ไฟล์ที่ยังอัปโหลดไม่เสร็จหรือถูกยกเลิก ไม่เปิดให้ใครดาวน์โหลด
  if (file.upload_status !== 'verified' || file.status === 'void') return false;
  if (!isModuleCode(file.module_code)) return false;
  const resource = MODULE_RESOURCE[file.module_code];
  const permissions = user.permissions;

  if (file.uploaded_by === user.id) return true;
  if (permissions.canAll(resource, 'view')) return true;

  switch (file.access_level) {
    case 'staff':
      return permissions.can(resource, 'view');
    case 'department':
      return permissions.canOnRecord(resource, 'view', {
        ownerIds: [file.uploaded_by],
        departmentId: file.department_id,
        unitId: file.unit_id,
      });
    case 'record':
      // สิทธิ์ตาม record ต้นทาง: ผู้ที่เห็น record ได้จึงเห็นไฟล์แนบของ record นั้น
      if (file.module_code === 'CL' && file.record_id) {
        return canViewRequest(db, user, file.record_id);
      }
      return false;
    case 'restricted':
      return permissions.can(resource, 'manage');
  }
}

/** ชนิดไฟล์ที่แสดงในเบราว์เซอร์ได้โดยไม่เสี่ยงต่อการรันสคริปต์ */
export function isInlinePreviewable(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType === 'image/png' || mimeType === 'image/jpeg';
}
