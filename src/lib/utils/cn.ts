import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge ต้องรู้จักชื่อ token ที่กำหนดเองใน globals.css
 * มิฉะนั้นจะเข้าใจว่า `text-body` (ขนาดอักษร) กับ `text-primary-foreground` (สี) เป็นกลุ่มเดียวกันแล้วตัดทิ้งหนึ่งตัว
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title', 'heading', 'subheading', 'body', 'label', 'caption'],
      radius: ['card', 'control', 'input', 'chip'],
      shadow: ['card', 'raised', 'control'],
      ease: ['out-expo'],
    },
  },
});

/** รวม class ของ Tailwind โดยให้ class ที่มาทีหลังชนะเมื่อขัดกัน */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
