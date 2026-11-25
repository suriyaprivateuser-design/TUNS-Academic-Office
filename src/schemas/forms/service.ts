/**
 * Schema ของฟอร์มจัดการลิงก์บริการ (ข้อ 19 / 09.2) — ใช้ร่วมกันทั้งฝั่ง Client และ Server
 */
import { z } from 'zod';
import { ICON_KEYS } from '@/config/icons';
import { ROLE_IDS } from '@/config/roles';

export const SERVICE_COLORS = ['terracotta', 'rose', 'burgundy', 'brown', 'sand'] as const;

export const serviceInputSchema = z.object({
  categoryId: z.string().min(1, 'กรุณาเลือกหมวดหมู่').max(64),
  nameTh: z.string().trim().min(2, 'กรุณาระบุชื่อระบบ').max(120, 'ยาวเกิน 120 ตัวอักษร'),
  nameEn: z.string().trim().max(120, 'ยาวเกิน 120 ตัวอักษร'),
  description: z.string().trim().max(300, 'ยาวเกิน 300 ตัวอักษร'),
  ownerUnit: z.string().trim().max(120, 'ยาวเกิน 120 ตัวอักษร'),
  linkType: z.enum(['external', 'internal']),
  url: z.string().trim().max(2000, 'URL ยาวเกินไป'),
  internalPath: z.string().trim().max(200),
  icon: z.string().refine((value) => (ICON_KEYS as string[]).includes(value), 'ไอคอนไม่ถูกต้อง'),
  color: z.enum(SERVICE_COLORS),
  status: z.enum(['active', 'maintenance', 'offline']),
  isVisible: z.boolean(),
  isPinned: z.boolean(),
  audience: z.enum(['all', 'restricted']),
  roleIds: z.array(z.enum(ROLE_IDS)).max(ROLE_IDS.length),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;

export const EMPTY_SERVICE_INPUT: ServiceInput = {
  categoryId: '',
  nameTh: '',
  nameEn: '',
  description: '',
  ownerUnit: '',
  linkType: 'external',
  url: '',
  internalPath: '',
  icon: 'academic',
  color: 'terracotta',
  status: 'active',
  isVisible: true,
  isPinned: false,
  audience: 'all',
  roleIds: [],
};
