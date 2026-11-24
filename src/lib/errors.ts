/**
 * ข้อผิดพลาดมาตรฐานของระบบ
 *
 * `message` ของ AppError เป็นข้อความภาษาไทยที่แสดงต่อผู้ใช้ได้อย่างปลอดภัย
 * รายละเอียดเชิงเทคนิค (เช่น ข้อความจาก Google API) เก็บใน `cause` และบันทึกฝั่ง Server เท่านั้น
 */
export const APP_ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SETUP_REQUIRED: 503,
  INTEGRATION: 502,
  UNSUPPORTED: 400,
  INTERNAL: 500,
} as const;

export type AppErrorCode = keyof typeof APP_ERROR_STATUS;

const DEFAULT_MESSAGE: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
  FORBIDDEN: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
  VALIDATION: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  CONFLICT: 'ข้อมูลถูกเปลี่ยนแปลงโดยผู้อื่นแล้ว กรุณาโหลดหน้านี้ใหม่แล้วลองอีกครั้ง',
  RATE_LIMITED: 'มีการใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
  SETUP_REQUIRED: 'ระบบยังตั้งค่าไม่เสร็จ กรุณาติดต่อผู้ดูแลระบบ',
  INTEGRATION: 'เชื่อมต่อบริการภายนอกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  UNSUPPORTED: 'ไม่รองรับการดำเนินการนี้',
  INTERNAL: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
};

export interface AppErrorOptions {
  cause?: unknown;
  /** ข้อผิดพลาดรายช่อง (field → ข้อความ) สำหรับแสดงในฟอร์ม */
  fieldErrors?: Record<string, string>;
  /** ข้อมูลประกอบที่ไม่เป็นความลับ */
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message?: string, options: AppErrorOptions = {}) {
    super(message ?? DEFAULT_MESSAGE[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = APP_ERROR_STATUS[code];
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export const unauthenticated = (message?: string) => new AppError('UNAUTHENTICATED', message);
export const forbidden = (message?: string) => new AppError('FORBIDDEN', message);
export const notFound = (message?: string) => new AppError('NOT_FOUND', message);
export const validation = (message?: string, fieldErrors?: Record<string, string>) =>
  new AppError('VALIDATION', message, { fieldErrors });
export const conflict = (message?: string, details?: Record<string, unknown>) =>
  new AppError('CONFLICT', message, { details });
export const integration = (message?: string, cause?: unknown) =>
  new AppError('INTEGRATION', message, { cause });
export const setupRequired = (message?: string) => new AppError('SETUP_REQUIRED', message);

/** แปลงข้อผิดพลาดใด ๆ เป็นรูปที่ส่งกลับ client ได้โดยไม่รั่วรายละเอียดภายใน */
export function toPublicError(error: unknown): {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
} {
  if (isAppError(error)) {
    return { code: error.code, message: error.message, fieldErrors: error.fieldErrors };
  }
  return { code: 'INTERNAL', message: DEFAULT_MESSAGE.INTERNAL };
}
