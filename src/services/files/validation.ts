/**
 * File Validation — ตรวจประเภท ขนาด และความปลอดภัยของไฟล์ (ข้อ 22 ขั้นที่ 3–4)
 *
 *   1) นามสกุลต้องอยู่ในรายการที่อนุญาต และชนิดไฟล์ที่ระบบบันทึกกำหนดจากนามสกุล ไม่เชื่อค่าที่ browser ส่งมา
 *   2) เนื้อไฟล์จริง (magic bytes) ต้องตรงกับนามสกุล — กันไฟล์ปลอมนามสกุล
 *   3) SVG ต้องไม่มีสคริปต์ ตัวจัดการเหตุการณ์ หรือการอ้างอิงภายนอก
 *
 * ข้อจำกัดที่ต้องรู้: ระบบไม่ได้สแกนไวรัส จึงลดความเสี่ยงด้วยการจำกัดประเภทไฟล์
 * และส่งไฟล์ให้ผู้ใช้ด้วย header ที่ปิดการตีความเนื้อหา (ดู src/app/api/files)
 */
import {
  ALLOWED_FILE_TYPES,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  type AllowedFileType,
} from '@/config/reference';
import { validation } from '@/lib/errors';
import { extensionOf } from './naming';

export type SniffedType =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'ooxml'
  | 'zip'
  | 'svg'
  | 'html'
  | 'empty'
  | 'unknown';

/** จำนวนไบต์ต้นไฟล์ที่ใช้ตรวจชนิด */
export const SNIFF_BYTES = 4096;
export const MAX_SVG_BYTES = 1024 * 1024;

function startsWith(data: Uint8Array, signature: number[]): boolean {
  if (data.length < signature.length) return false;
  return signature.every((byte, index) => data[index] === byte);
}

function latin1(data: Uint8Array): string {
  let text = '';
  for (const byte of data) text += String.fromCharCode(byte);
  return text;
}

/** ระบุชนิดไฟล์จากเนื้อไฟล์จริง */
export function sniffFileType(head: Uint8Array): SniffedType {
  if (head.length === 0) return 'empty';
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    const text = latin1(head);
    if (text.includes('word/')) return 'docx';
    if (text.includes('xl/')) return 'xlsx';
    if (text.includes('ppt/')) return 'pptx';
    if (text.includes('[Content_Types].xml')) return 'ooxml';
    return 'zip';
  }
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(head)
    .replace(/^﻿/, '')
    .trimStart()
    .toLowerCase();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/.test(text)) return 'svg';
  if (/^(<!doctype html|<html|<head|<body|<script)/.test(text)) return 'html';
  return 'unknown';
}

export interface DeclaredFile {
  filename: string;
  size: number;
}

export interface AcceptedFile {
  extension: string;
  /** ชนิดไฟล์ที่ระบบบันทึก — กำหนดจากนามสกุลที่อนุญาต ไม่ใช่ค่าที่ browser ส่งมา */
  mimeType: string;
  type: AllowedFileType;
}

export interface FilePolicy {
  /** นามสกุลที่อนุญาตสำหรับการอัปโหลดครั้งนี้ (ว่าง = ทุกประเภทที่ระบบอนุญาต) */
  allowedExtensions?: readonly string[];
  maxSizeBytes?: number;
}

export function findAllowedType(extension: string): AllowedFileType | null {
  return ALLOWED_FILE_TYPES.find((type) => type.extension === extension.toLowerCase()) ?? null;
}

/** ตรวจจากข้อมูลที่ประกาศมา (ก่อนรับเนื้อไฟล์) */
export function validateDeclaredFile(file: DeclaredFile, policy: FilePolicy = {}): AcceptedFile {
  const extension = extensionOf(file.filename);
  const type = extension ? findAllowedType(extension) : null;
  const allowed = policy.allowedExtensions?.map((value) => value.toLowerCase());
  if (!type || (allowed && allowed.length > 0 && !allowed.includes(extension))) {
    const list = (allowed?.length ? allowed : ALLOWED_FILE_TYPES.map((t) => t.extension))
      .filter((value, index, all) => all.indexOf(value) === index)
      .map((value) => `.${value}`)
      .join(' ');
    throw validation(`ไม่รองรับไฟล์ประเภทนี้ ประเภทที่อนุญาต: ${list}`);
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw validation('ไฟล์ว่างเปล่าหรือขนาดไฟล์ไม่ถูกต้อง');
  }
  const limit =
    extension === 'svg'
      ? Math.min(MAX_SVG_BYTES, policy.maxSizeBytes ?? MAX_SVG_BYTES)
      : (policy.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES);
  if (file.size > limit) {
    throw validation(`ไฟล์มีขนาดเกิน ${formatBytes(limit)} ที่อนุญาต`);
  }
  return { extension, mimeType: type.mimeTypes[0] as string, type };
}

const EXPECTED_SNIFF: Record<string, readonly SniffedType[]> = {
  pdf: ['pdf'],
  png: ['png'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  docx: ['docx', 'ooxml'],
  xlsx: ['xlsx', 'ooxml'],
  pptx: ['pptx', 'ooxml'],
  svg: ['svg'],
};

/** ตรวจว่าเนื้อไฟล์จริงตรงกับนามสกุล — โยน AppError เมื่อไม่ตรง */
export function assertContentMatches(extension: string, head: Uint8Array): void {
  const expected = EXPECTED_SNIFF[extension.toLowerCase()];
  const actual = sniffFileType(head);
  if (!expected || !expected.includes(actual)) {
    throw validation(
      `เนื้อหาของไฟล์ไม่ตรงกับนามสกุล .${extension} ระบบจึงไม่รับไฟล์นี้ กรุณาตรวจสอบไฟล์ต้นฉบับ`,
    );
  }
}

const SVG_FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<!doctype|<!entity/i, reason: 'มี DOCTYPE/ENTITY' },
  {
    pattern:
      /<\s*(script|foreignobject|iframe|embed|object|audio|video|canvas|animate|animatetransform|animatemotion|set|handler|listener)\b/i,
    reason: 'มีแท็กที่ไม่อนุญาต',
  },
  { pattern: /\son[a-z]+\s*=/i, reason: 'มีตัวจัดการเหตุการณ์ (on…)' },
  { pattern: /(javascript|vbscript|livescript)\s*:/i, reason: 'มีลิงก์สคริปต์' },
  { pattern: /data\s*:\s*(text\/html|application\/|image\/svg)/i, reason: 'มี data URI ที่ไม่อนุญาต' },
  { pattern: /@import|expression\s*\(|-moz-binding|behavior\s*:/i, reason: 'มี CSS ที่ไม่อนุญาต' },
  { pattern: /url\(\s*['"]?\s*(?!#)/i, reason: 'มี url() ที่อ้างอิงภายนอก' },
  { pattern: /<\?(?!xml\s)/i, reason: 'มี processing instruction' },
];

/**
 * ตรวจ SVG แบบ "ปฏิเสธเมื่อสงสัย" — ไม่พยายามแก้ไขไฟล์ (การแก้ด้วย regex ไม่ปลอดภัยพอ)
 * ไฟล์ที่ผ่านยังถูกแสดงผ่าน <img> และส่งด้วย CSP sandbox อีกชั้นหนึ่ง
 */
export function assertSafeSvg(data: Uint8Array): void {
  if (data.byteLength > MAX_SVG_BYTES) throw validation('ไฟล์ SVG มีขนาดใหญ่เกินไป');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw validation('ไฟล์ SVG ต้องเข้ารหัสแบบ UTF-8');
  }
  // ถอดรหัส character reference ที่ใช้ซ่อนคำ เช่น &#106;avascript:
  const decoded = text
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16) || 32))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(Number(dec) || 32))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  for (const { pattern, reason } of SVG_FORBIDDEN) {
    if (pattern.test(decoded)) {
      throw validation(`ไฟล์ SVG นี้ไม่ปลอดภัย (${reason}) ระบบจึงไม่รับไฟล์`);
    }
  }
  // href / xlink:href ต้องอ้างอิงภายในไฟล์เท่านั้น
  const hrefs = decoded.matchAll(/(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi);
  for (const match of hrefs) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!value.startsWith('#')) {
      throw validation('ไฟล์ SVG นี้ไม่ปลอดภัย (มีการอ้างอิงภายนอก) ระบบจึงไม่รับไฟล์');
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
