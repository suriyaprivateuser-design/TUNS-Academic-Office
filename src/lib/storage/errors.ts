/**
 * แปลงผลลัพธ์ที่ล้มเหลวของ Write Gateway เป็น AppError ที่มีข้อความสำหรับผู้ใช้
 */
import { AppError } from '@/lib/errors';
import type { CommitFailure } from './gateway-core';

export function gatewayFailureToError(failure: CommitFailure['error']): AppError {
  const details = {
    gatewayCode: failure.code,
    table: failure.table,
    id: failure.id,
    columns: failure.columns,
  };
  switch (failure.code) {
    case 'VERSION_CONFLICT':
      return new AppError(
        'CONFLICT',
        'รายการนี้ถูกแก้ไขหรือดำเนินการโดยผู้อื่นไปแล้ว กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง',
        { details },
      );
    case 'UNIQUE_VIOLATION':
      return new AppError('CONFLICT', 'มีรายการที่ใช้ข้อมูลนี้อยู่แล้ว ไม่สามารถบันทึกซ้ำได้', {
        details,
      });
    case 'NOT_FOUND':
      return new AppError('NOT_FOUND', 'ไม่พบรายการที่ต้องการแก้ไข อาจถูกเปลี่ยนแปลงไปแล้ว', {
        details,
      });
    case 'UNKNOWN_TABLE':
    case 'UNKNOWN_COLUMN':
      return new AppError(
        'SETUP_REQUIRED',
        'โครงสร้างฐานข้อมูลยังไม่ครบ กรุณาให้ผู้ดูแลระบบเรียกใช้ “ตรวจและสร้างโครงสร้างฐานข้อมูล” ใน Setup Wizard',
        { details },
      );
    case 'INCOMPLETE_OPERATION':
      return new AppError(
        'CONFLICT',
        'รายการก่อนหน้าบันทึกไม่ครบถ้วน กรุณาแจ้งผู้ดูแลระบบเพื่อตรวจสอบ (Reconciliation) ก่อนทำรายการใหม่',
        { details },
      );
    case 'UNAUTHORIZED':
      return new AppError(
        'INTEGRATION',
        'Write Gateway ปฏิเสธคำขอ กรุณาให้ผู้ดูแลระบบตรวจสอบการตั้งค่า APPS_SCRIPT_GATEWAY_SECRET',
        { details },
      );
    case 'LOCK_TIMEOUT':
      return new AppError(
        'INTEGRATION',
        'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่อีกครั้งในอีกสักครู่',
        { details },
      );
    case 'STORE_ERROR':
      return new AppError('INTEGRATION', 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', {
        details,
        cause: failure.message,
      });
    case 'INVALID_OPERATION':
      return new AppError('INTERNAL', undefined, { details, cause: failure.message });
  }
}
