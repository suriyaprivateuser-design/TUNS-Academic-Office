/**
 * Folder Path Resolver — แปลง "ไฟล์นี้เป็นของ Module/record ใด" เป็นเส้นทางโฟลเดอร์ใน Google Drive (ข้อ 21.2)
 *
 * เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ Drive จึงทดสอบได้ครบทุกกรณี
 * แต่ละระดับมี `key` ที่คงที่ (ไม่ขึ้นกับชื่อที่แสดง) ใช้ประกอบเป็น folder_key ใน Folder Registry
 * ครูไม่ต้องสร้างโฟลเดอร์หรือตั้งชื่อไฟล์เอง
 */
import type { ModuleCode } from '@/config/reference';
import { validation } from '@/lib/errors';

export type FolderType =
  | 'root'
  | 'system'
  | 'academic_year'
  | 'semester'
  | 'module'
  | 'category'
  | 'department'
  | 'record'
  | 'sub';

export type FolderAccessScope = 'staff' | 'module' | 'record' | 'system';

export interface FolderSegment {
  /** ส่วนของคีย์ที่คงที่ เช่น `ay:2569` */
  key: string;
  /** ชื่อโฟลเดอร์ที่แสดงใน Google Drive */
  name: string;
  type: FolderType;
  accessScope: FolderAccessScope;
}

export interface FileRoute {
  moduleCode: ModuleCode;
  /** ประเภทเอกสารภายใน Module เช่น attachment, letter, approved, library */
  documentType: string;
  /** ปีการศึกษา พ.ศ. เช่น 2569 (จำเป็นสำหรับ Module ที่จัดเก็บตามปีการศึกษา) */
  academicYear?: string | null;
  /** ภาคเรียน เช่น 1 หรือ 2 */
  semester?: string | null;
  /** เลขอ้างอิงของ record เช่น CL-2569-0001 */
  recordRef?: string | null;
  /** ชื่อหมวดหมู่/รายการ เช่น ชื่อโฟลเดอร์ของหมวดในคลังเอกสาร หรือรหัสรายการรับงาน */
  category?: { key: string; name: string } | null;
  department?: { id: string; name: string } | null;
  /** รหัสบุคลากร (ใช้กับงานรับส่งงานรายบุคคล) */
  personCode?: string | null;
}

export const ROOT_KEY = 'root';

const SYSTEM_FOLDERS = {
  database: { key: 'sys:database', name: '00_ฐานข้อมูลระบบ' },
  years: { key: 'years', name: '01_ปีการศึกษา' },
  templates: { key: 'templates', name: '02_แม่แบบเอกสาร' },
  library: { key: 'library', name: '03_คลังเอกสารกลาง' },
  assets: { key: 'assets', name: '04_Assets' },
  serviceHub: { key: 'service-hub', name: '05_ศูนย์รวมระบบวิชาการ' },
  backups: { key: 'sys:backups', name: '90_สำรองข้อมูล' },
  logs: { key: 'sys:logs', name: '95_System Logs' },
  archive: { key: 'sys:archive', name: '99_เอกสารเก็บถาวร' },
} as const;

/** โฟลเดอร์ระดับบนสุดทั้งหมดของ Root Folder (Setup Wizard สร้างตามรายการนี้) */
export const TOP_LEVEL_FOLDERS: readonly FolderSegment[] = [
  { ...SYSTEM_FOLDERS.database, type: 'system', accessScope: 'system' },
  { ...SYSTEM_FOLDERS.years, type: 'system', accessScope: 'module' },
  { ...SYSTEM_FOLDERS.templates, type: 'system', accessScope: 'module' },
  { ...SYSTEM_FOLDERS.library, type: 'system', accessScope: 'staff' },
  { ...SYSTEM_FOLDERS.assets, type: 'system', accessScope: 'system' },
  { ...SYSTEM_FOLDERS.serviceHub, type: 'system', accessScope: 'system' },
  { ...SYSTEM_FOLDERS.backups, type: 'system', accessScope: 'system' },
  { ...SYSTEM_FOLDERS.logs, type: 'system', accessScope: 'system' },
  { ...SYSTEM_FOLDERS.archive, type: 'system', accessScope: 'system' },
];

/** โฟลเดอร์ระดับ Module ภายในภาคเรียน */
const TERM_MODULE_FOLDERS = {
  documents: { key: 'mod:documents', name: '01_งานสารบรรณ' },
  classLeave: { key: 'mod:class-leave', name: '02_หนังสือขอเวลาเรียน' },
  submissions: { key: 'mod:submissions', name: '03_งานมอบหมายและรับส่งงาน' },
  meetings: { key: 'mod:meetings', name: '04_งานประชุม' },
  personnel: { key: 'mod:personnel', name: '05_งานบุคลากร' },
  communications: { key: 'mod:communications', name: '06_ประชาสัมพันธ์และแบบสำรวจ' },
  reports: { key: 'mod:reports', name: '07_รายงานและสถิติ' },
} as const;

const DOCUMENT_REGISTER_FOLDERS: Partial<Record<ModuleCode, string>> = {
  IN: 'หนังสือรับ',
  OUT: 'หนังสือส่ง',
  MEMO: 'บันทึกข้อความ',
  ORDER: 'คำสั่ง',
  ANN: 'ประกาศ',
  CERT: 'เกียรติบัตร',
};

const CLASS_LEAVE_SUBFOLDERS: Record<string, { key: string; name: string }> = {
  letter: { key: 'sub:draft', name: '01_ฉบับร่าง' },
  attachment: { key: 'sub:attachment', name: '02_เอกสารประกอบ' },
  roster: { key: 'sub:roster', name: '03_บัญชีรายชื่อ' },
  approved: { key: 'sub:approved', name: '04_ฉบับอนุมัติ' },
  evidence: { key: 'sub:evidence', name: '05_หลักฐานการเข้าร่วม' },
};

const MEETING_SUBFOLDERS: Record<string, { key: string; name: string }> = {
  agenda: { key: 'sub:agenda', name: 'ระเบียบวาระ' },
  attachment: { key: 'sub:attachment', name: 'เอกสารประกอบ' },
  minutes: { key: 'sub:minutes', name: 'รายงานการประชุม' },
  attendance: { key: 'sub:attendance', name: 'รายชื่อผู้เข้าประชุม' },
};

const SUBMISSION_CATEGORY_FOLDERS: Partial<Record<ModuleCode, { key: string; name: string }>> = {
  LP: { key: 'cat:lesson-plan', name: 'แผนการจัดการเรียนรู้' },
  RES: { key: 'cat:research', name: 'วิจัยในชั้นเรียน' },
  SUB: { key: 'cat:other', name: 'งานอื่น ๆ' },
};

const REPORT_FOLDERS: Record<string, { key: string; name: string }> = {
  monthly: { key: 'cat:monthly', name: 'รายงานรายเดือน' },
  semester: { key: 'cat:semester', name: 'รายงานรายภาคเรียน' },
  annual: { key: 'cat:annual', name: 'รายงานประจำปี' },
};

const ASSET_FOLDERS: Record<string, { key: string; name: string }> = {
  school_crest: { key: 'cat:school-crest', name: 'ตราโรงเรียน' },
  system_logo: { key: 'cat:system-logo', name: 'โลโก้ระบบ' },
  icon: { key: 'cat:icons', name: 'Icons' },
  illustration: { key: 'cat:illustrations', name: 'Illustrations' },
};

/** ชื่อโฟลเดอร์ต้องไม่มีอักขระที่ทำให้สับสนกับเส้นทาง */
export function safeFolderName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || 'ไม่ระบุชื่อ';
}

function termSegments(route: FileRoute): FolderSegment[] {
  if (!route.academicYear || !/^\d{4}$/.test(route.academicYear)) {
    throw validation('ไม่พบปีการศึกษาของเอกสาร จึงกำหนดโฟลเดอร์ปลายทางไม่ได้');
  }
  if (!route.semester || !/^[123]$/.test(route.semester)) {
    throw validation('ไม่พบภาคเรียนของเอกสาร จึงกำหนดโฟลเดอร์ปลายทางไม่ได้');
  }
  return [
    { ...SYSTEM_FOLDERS.years, type: 'system', accessScope: 'module' },
    {
      key: `ay:${route.academicYear}`,
      name: route.academicYear,
      type: 'academic_year',
      accessScope: 'module',
    },
    {
      key: `sem:${route.semester}`,
      name: `ภาคเรียนที่ ${route.semester}`,
      type: 'semester',
      accessScope: 'module',
    },
  ];
}

function requireRecordRef(route: FileRoute): string {
  if (!route.recordRef) throw validation('ไม่พบเลขอ้างอิงของรายการ จึงกำหนดโฟลเดอร์ปลายทางไม่ได้');
  return route.recordRef;
}

/**
 * คืนลำดับโฟลเดอร์จากใต้ Root Folder ลงไปถึงโฟลเดอร์ปลายทางของไฟล์
 * โยน AppError (VALIDATION) เมื่อข้อมูลไม่พอจะกำหนดปลายทาง — ไม่มีการเดาหรือวางไฟล์ผิดที่
 */
export function resolveFolderPath(route: FileRoute): FolderSegment[] {
  const moduleFolder = (folder: { key: string; name: string }): FolderSegment => ({
    ...folder,
    type: 'module',
    accessScope: 'module',
  });

  switch (route.moduleCode) {
    case 'CL': {
      const ref = requireRecordRef(route);
      const sub = CLASS_LEAVE_SUBFOLDERS[route.documentType];
      if (!sub) throw validation(`ไม่รู้จักประเภทเอกสาร "${route.documentType}" ของหนังสือขอเวลาเรียน`);
      return [
        ...termSegments(route),
        moduleFolder(TERM_MODULE_FOLDERS.classLeave),
        { key: `ref:${ref}`, name: safeFolderName(ref), type: 'record', accessScope: 'record' },
        { ...sub, type: 'sub', accessScope: 'record' },
      ];
    }

    case 'IN':
    case 'OUT':
    case 'MEMO':
    case 'ORDER':
    case 'ANN':
    case 'CERT': {
      const name = DOCUMENT_REGISTER_FOLDERS[route.moduleCode] as string;
      return [
        ...termSegments(route),
        moduleFolder(TERM_MODULE_FOLDERS.documents),
        {
          key: `cat:${route.moduleCode.toLowerCase()}`,
          name,
          type: 'category',
          accessScope: 'module',
        },
      ];
    }

    case 'LP':
    case 'RES':
    case 'SUB': {
      const category = SUBMISSION_CATEGORY_FOLDERS[route.moduleCode] as { key: string; name: string };
      const ref = requireRecordRef(route);
      const segments: FolderSegment[] = [
        ...termSegments(route),
        moduleFolder(TERM_MODULE_FOLDERS.submissions),
        { ...category, type: 'category', accessScope: 'module' },
        { key: `ref:${ref}`, name: safeFolderName(ref), type: 'record', accessScope: 'module' },
      ];
      if (route.department) {
        segments.push({
          key: `dept:${route.department.id}`,
          name: safeFolderName(route.department.name),
          type: 'department',
          accessScope: 'module',
        });
      }
      if (route.personCode) {
        segments.push({
          key: `person:${route.personCode}`,
          name: safeFolderName(route.personCode),
          type: 'record',
          accessScope: 'record',
        });
      }
      return segments;
    }

    case 'MTG': {
      const ref = requireRecordRef(route);
      const sub = MEETING_SUBFOLDERS[route.documentType];
      if (!sub) throw validation(`ไม่รู้จักประเภทเอกสาร "${route.documentType}" ของงานประชุม`);
      return [
        ...termSegments(route),
        moduleFolder(TERM_MODULE_FOLDERS.meetings),
        { key: `ref:${ref}`, name: safeFolderName(ref), type: 'record', accessScope: 'record' },
        { ...sub, type: 'sub', accessScope: 'record' },
      ];
    }

    case 'RPT': {
      const folder = REPORT_FOLDERS[route.documentType];
      if (!folder) throw validation(`ไม่รู้จักประเภทรายงาน "${route.documentType}"`);
      return [
        ...termSegments(route),
        moduleFolder(TERM_MODULE_FOLDERS.reports),
        { ...folder, type: 'category', accessScope: 'module' },
      ];
    }

    case 'SVY':
      return [
        ...termSegments(route),
        moduleFolder(TERM_MODULE_FOLDERS.communications),
        { key: 'cat:survey', name: 'ผลแบบสำรวจ', type: 'category', accessScope: 'module' },
      ];

    case 'LIB': {
      if (!route.category) throw validation('กรุณาเลือกหมวดหมู่ของเอกสารในคลัง');
      return [
        { ...SYSTEM_FOLDERS.library, type: 'system', accessScope: 'staff' },
        {
          key: `cat:${route.category.key}`,
          name: safeFolderName(route.category.name),
          type: 'category',
          accessScope: 'staff',
        },
      ];
    }

    case 'TPL': {
      if (!route.category) throw validation('กรุณาระบุประเภทของแม่แบบเอกสาร');
      return [
        { ...SYSTEM_FOLDERS.templates, type: 'system', accessScope: 'module' },
        {
          key: `cat:${route.category.key}`,
          name: safeFolderName(route.category.name),
          type: 'category',
          accessScope: 'module',
        },
      ];
    }

    case 'AST': {
      const folder = ASSET_FOLDERS[route.documentType];
      if (!folder) throw validation(`ไม่รู้จักประเภท Asset "${route.documentType}"`);
      return [
        { ...SYSTEM_FOLDERS.assets, type: 'system', accessScope: 'system' },
        { ...folder, type: 'category', accessScope: 'system' },
      ];
    }

    case 'SVC':
      return [
        { ...SYSTEM_FOLDERS.serviceHub, type: 'system', accessScope: 'system' },
        { key: 'cat:service-logos', name: 'Service Logos', type: 'category', accessScope: 'system' },
      ];
  }
}

/** folder_key ของแต่ละระดับ = คีย์ของทุกระดับก่อนหน้าต่อกันด้วย `/` */
export function cumulativeKeys(segments: readonly FolderSegment[]): string[] {
  const keys: string[] = [];
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment.key}` : segment.key;
    keys.push(current);
  }
  return keys;
}
