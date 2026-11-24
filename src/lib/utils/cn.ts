import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** รวม class ของ Tailwind โดยให้ class ที่มาทีหลังชนะเมื่อขัดกัน */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
