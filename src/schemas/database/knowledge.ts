/**
 * TUNS_KNOWLEDGE_DATABASE — คลังเอกสารกลาง ข่าวสาร และแบบสำรวจ (Module 07)
 *
 * ไฟล์จริงอยู่ใน Google Drive ตาราง LibraryFiles เก็บข้อมูลเชิงเนื้อหาของเอกสารในคลัง
 * ส่วน metadata ของไฟล์แต่ละเวอร์ชันอยู่ที่ system.FileRegistry (อ้างอิงด้วย document_id)
 */
import { archivable, base } from './common';
import {
  AnnouncementAcknowledgements,
  AnnouncementRecipients,
  Announcements,
  SurveyAnswers,
  SurveyQuestions,
  SurveyResponses,
  Surveys,
} from './knowledge-communications';
import { col, defineTable, req, type DatabaseDef } from './types';

export const DocumentCategories = defineTable(
  'knowledge',
  'DocumentCategories',
  'หมวดหมู่เอกสารของคลังเอกสารกลาง แต่ละหมวดผูกกับโฟลเดอร์ใน 03_คลังเอกสารกลาง',
  {
    ...base,
    code: req.string('รหัสหมวดหมู่', { example: 'forms' }),
    name_th: req.string('ชื่อหมวดหมู่', { example: 'แบบฟอร์ม' }),
    description: col.string('คำอธิบาย'),
    folder_name: req.string('ชื่อโฟลเดอร์ใน Google Drive', { example: 'แบบฟอร์ม' }),
    sort_order: req.int('ลำดับการแสดงผล'),
    is_active: req.boolean('เปิดใช้งาน'),
  },
  { uniqueKeys: [['code']], phase: 2 },
);

export const LibraryFiles = defineTable(
  'knowledge',
  'LibraryFiles',
  'เอกสารในคลังเอกสารกลาง หนึ่งแถวต่อหนึ่งเอกสาร (ทุกเวอร์ชันใช้ document_id เดียวกันใน File Registry)',
  {
    ...base,
    document_id: req.string('รหัสเอกสารเชิงตรรกะ ตรงกับ system.FileRegistry.document_id'),
    current_file_id: req.string('ไฟล์เวอร์ชันปัจจุบัน', { ref: 'system.FileRegistry' }),
    title: req.string('ชื่อเอกสาร'),
    description: col.string('คำอธิบาย'),
    category_id: req.string('หมวดหมู่', { ref: 'knowledge.DocumentCategories' }),
    academic_year: col.string('ปีการศึกษา พ.ศ. ที่เอกสารเกี่ยวข้อง (ว่าง = ใช้ได้ทุกปี)'),
    semester: col.string('ภาคเรียน'),
    department_id: col.string('กลุ่มสาระเจ้าของเอกสาร', { ref: 'master.Departments' }),
    unit_id: col.string('กลุ่มงานเจ้าของเอกสาร', { ref: 'master.AcademicUnits' }),
    tags: col.json<string[]>('คำค้นเพิ่มเติม'),
    access_level: req.enum(
      ['staff', 'department', 'restricted'],
      'ระดับการเข้าถึงเอกสาร',
    ),
    owner_id: req.string('ผู้นำเข้าเอกสาร', { ref: 'master.Users' }),
    is_pinned: req.boolean('ปักหมุดเป็นเอกสารสำคัญ'),
    current_version: req.int('เลขเวอร์ชันปัจจุบันของไฟล์'),
    status: req.enum(['active', 'archived'], 'สถานะในคลัง'),
    ...archivable,
  },
  { uniqueKeys: [['document_id']], phase: 2 },
);

export const LibraryFavorites = defineTable(
  'knowledge',
  'LibraryFavorites',
  'เอกสารที่ผู้ใช้ติดดาวเป็นรายการโปรด',
  {
    ...base,
    user_id: req.string('ผู้ใช้', { ref: 'master.Users' }),
    library_file_id: req.string('เอกสารในคลัง', { ref: 'knowledge.LibraryFiles' }),
    is_active: req.boolean('true = ยังเป็นรายการโปรด'),
  },
  { uniqueKeys: [['user_id', 'library_file_id']], phase: 2 },
);

export const knowledgeDatabase: DatabaseDef = {
  key: 'knowledge',
  title: 'TUNS_KNOWLEDGE_DATABASE',
  displayName: 'Knowledge Database',
  envVar: 'GOOGLE_KNOWLEDGE_SPREADSHEET_ID',
  description: 'คลังเอกสารกลาง ข่าวสารและประชาสัมพันธ์ และแบบสำรวจออนไลน์',
  directAccess: 'ผู้ดูแลระบบเท่านั้น',
  tables: [
    DocumentCategories,
    LibraryFiles,
    LibraryFavorites,
    Announcements,
    AnnouncementRecipients,
    AnnouncementAcknowledgements,
    Surveys,
    SurveyQuestions,
    SurveyResponses,
    SurveyAnswers,
  ],
};
