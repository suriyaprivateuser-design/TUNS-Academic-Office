/**
 * ข่าวสารประชาสัมพันธ์และแบบสำรวจออนไลน์ของ TUNS_KNOWLEDGE_DATABASE (Module 07.2, 07.3)
 *
 * ไฟล์นี้ export เฉพาะนิยามตาราง เพื่อนำไปรวมใน DatabaseDef ของฐานข้อมูล knowledge
 *
 * แบบสำรวจไม่ระบุตัวตน: SurveyResponses และ SurveyAnswers ใช้ logBase (ไม่มี created_by / updated_by)
 * เพื่อไม่ให้ตัวตนของผู้ตอบถูกบันทึกโดยอัตโนมัติ
 */
import { archivable, base, logBase, term } from './common';
import { col, defineTable, req } from './types';

/** กลุ่มเป้าหมายหนึ่งรายการของแบบสำรวจ (Surveys.audience_targets) */
export interface SurveyAudienceTarget {
  target_type: 'role' | 'department' | 'unit' | 'user';
  /** รหัสตาม target_type: master.Roles / master.Departments / master.AcademicUnits / master.Users */
  target_ref: string;
}

/** การตั้งค่าเฉพาะชนิดคำถาม (SurveyQuestions.settings) — ใช้เฉพาะคีย์ที่ตรงกับ question_type */
export interface SurveyQuestionSettings {
  /** rating: คะแนนต่ำสุด */
  min?: number;
  /** rating: คะแนนสูงสุด */
  max?: number;
  /** rating / likert: ป้ายกำกับปลายมาตรด้านต่ำสุด */
  min_label?: string;
  /** rating / likert: ป้ายกำกับปลายมาตรด้านสูงสุด */
  max_label?: string;
  /** short_answer / long_answer: จำนวนอักขระสูงสุด */
  max_length?: number;
  /** checkbox: จำนวนตัวเลือกขั้นต่ำที่ต้องเลือก */
  min_selections?: number;
  /** checkbox: จำนวนตัวเลือกสูงสุดที่เลือกได้ */
  max_selections?: number;
  /** file_upload: นามสกุลไฟล์ที่อนุญาต (ตัวพิมพ์เล็ก ไม่มีจุด) */
  allowed_extensions?: string[];
  /** file_upload: ขนาดไฟล์สูงสุด (MB) */
  max_file_size_mb?: number;
}

// ── ข่าวสารและประชาสัมพันธ์ (07.2) ─────────────────────────────────────────────

export const Announcements = defineTable(
  'knowledge',
  'Announcements',
  'ข่าวสารและประกาศประชาสัมพันธ์ถึงบุคลากรภายในระบบ — ประกาศทางการที่ลงทะเบียนไว้ใช้เอกสารต้นฉบับเดียวกับ document.AnnouncementsRegister ผ่าน document_id',
  {
    ...base,
    title: req.string('หัวข้อข่าวหรือประกาศ'),
    body: col.string(
      'เนื้อหาแบบ rich text เก็บเป็น HTML ที่ผ่านการ sanitize ฝั่ง Server ก่อนบันทึกทุกครั้ง ไม่เกิน 50,000 อักขระ (อาจระบุชื่อบุคคลหรือนักเรียน)',
      { pii: 'personal' },
    ),
    cover_image_file_id: col.string('ภาพปกของข่าว', { ref: 'system.FileRegistry' }),
    attachment_file_ids: col.json<string[]>(
      'ไฟล์แนบของข่าว เป็นรายการรหัสไฟล์ใน system.FileRegistry',
    ),
    audience: req.enum(
      ['all', 'restricted'],
      'all = บุคลากรทุกคน, restricted = เฉพาะกลุ่มเป้าหมายใน AnnouncementRecipients',
    ),
    publish_at: col.datetime('วันเวลาเผยแพร่ (ตั้งล่วงหน้าได้เมื่อ status = scheduled)'),
    expires_at: col.datetime('วันเวลาสิ้นสุดการแสดงผล (ว่าง = ไม่หมดอายุ)'),
    is_pinned: req.boolean('true = ปักหมุดไว้ด้านบนของรายการข่าว'),
    requires_acknowledgement: req.boolean(
      'true = ผู้รับต้องกดรับทราบ (บันทึกใน AnnouncementAcknowledgements)',
    ),
    status: req.enum(
      ['draft', 'scheduled', 'published', 'expired', 'archived'],
      'สถานะ: ฉบับร่าง / ตั้งเวลาเผยแพร่ / เผยแพร่แล้ว / หมดอายุ / จัดเก็บแล้ว',
    ),
    author_id: req.string('ผู้เขียนข่าว', { ref: 'master.Users' }),
    document_id: col.string(
      'เอกสารต้นฉบับใน Documents ที่ใช้ร่วมกับทะเบียนประกาศ (document.AnnouncementsRegister.document_id) — อ้างอิงไฟล์เดียวกัน ไม่คัดลอก',
      { ref: 'document.Documents' },
    ),
    department_id: col.string(
      'กลุ่มสาระเจ้าของข่าว ใช้กำหนดขอบเขตสิทธิ์ (ว่าง = ระดับกลุ่มบริหารวิชาการ)',
      { ref: 'master.Departments' },
    ),
    unit_id: col.string('กลุ่มงานเจ้าของข่าว ใช้กำหนดขอบเขตสิทธิ์', {
      ref: 'master.AcademicUnits',
    }),
    ...term,
    ...archivable,
  },
  { phase: 6 },
);

export const AnnouncementRecipients = defineTable(
  'knowledge',
  'AnnouncementRecipients',
  'กลุ่มเป้าหมายของข่าวที่กำหนด audience = restricted',
  {
    ...base,
    announcement_id: req.string('ข่าวหรือประกาศ', { ref: 'knowledge.Announcements' }),
    target_type: req.enum(
      ['role', 'department', 'unit', 'user'],
      'ประเภทกลุ่มเป้าหมาย: role = ทุกคนที่มีบทบาทนั้น, department = ทั้งกลุ่มสาระ, unit = ทั้งกลุ่มงาน, user = รายบุคคล',
    ),
    target_ref: req.string(
      'รหัสกลุ่มเป้าหมายตาม target_type: master.Roles / master.Departments / master.AcademicUnits / master.Users',
    ),
  },
  { uniqueKeys: [['announcement_id', 'target_type', 'target_ref']], phase: 6 },
);

export const AnnouncementAcknowledgements = defineTable(
  'knowledge',
  'AnnouncementAcknowledgements',
  'การรับทราบข่าวที่กำหนดให้ต้องรับทราบ — ผู้ใช้หนึ่งคนรับทราบข่าวหนึ่งรายการได้ครั้งเดียว บันทึกเพิ่มอย่างเดียว',
  {
    ...logBase,
    announcement_id: req.string('ข่าวหรือประกาศที่รับทราบ', { ref: 'knowledge.Announcements' }),
    user_id: req.string('ผู้รับทราบ', { ref: 'master.Users' }),
    acknowledged_at: req.datetime('วันเวลาที่กดรับทราบ'),
  },
  { uniqueKeys: [['announcement_id', 'user_id']], appendOnly: true, phase: 6 },
);

// ── แบบสำรวจออนไลน์ (07.3) ─────────────────────────────────────────────────────

export const Surveys = defineTable(
  'knowledge',
  'Surveys',
  'แบบสำรวจออนไลน์สำหรับบุคลากร รองรับแบบระบุตัวตนและไม่ระบุตัวตน',
  {
    ...base,
    title: req.string('ชื่อแบบสำรวจ'),
    description: col.string('คำชี้แจงของแบบสำรวจ'),
    audience: req.enum(
      ['all', 'restricted'],
      'all = บุคลากรทุกคน, restricted = เฉพาะกลุ่มเป้าหมายใน audience_targets',
    ),
    audience_targets: col.json<SurveyAudienceTarget[]>(
      'กลุ่มเป้าหมายเมื่อ audience = restricted [{ target_type, target_ref }] โดย target_type เป็น role / department / unit / user',
    ),
    opens_at: col.datetime('วันเวลาเปิดรับคำตอบ'),
    closes_at: col.datetime('วันเวลาปิดรับคำตอบ (ว่าง = ปิดด้วยตนเอง)'),
    is_anonymous: req.boolean(
      'true = แบบสำรวจไม่ระบุตัวตน: ไม่เก็บข้อมูลที่ระบุตัวผู้ตอบไว้ในคำตอบ (SurveyResponses.respondent_id และ department_id ว่างเสมอ) และรายงานต้องไม่เปิดช่องให้ระบุตัวผู้ตอบย้อนกลับได้ เช่น ไม่แยกผลของกลุ่มย่อยที่มีผู้ตอบน้อยราย — ห้ามเปลี่ยนค่านี้หลังเปิดรับคำตอบ',
    ),
    status: req.enum(
      ['draft', 'open', 'closed', 'archived'],
      'สถานะ: ฉบับร่าง / เปิดรับคำตอบ / ปิดรับคำตอบ / จัดเก็บแล้ว',
    ),
    owner_id: req.string('เจ้าของแบบสำรวจ', { ref: 'master.Users' }),
    ...term,
    ...archivable,
  },
  { phase: 6 },
);

export const SurveyQuestions = defineTable(
  'knowledge',
  'SurveyQuestions',
  'คำถามของแบบสำรวจ เรียงตาม sort_order',
  {
    ...base,
    survey_id: req.string('แบบสำรวจ', { ref: 'knowledge.Surveys' }),
    sort_order: req.int('ลำดับคำถาม (น้อยไปมาก)'),
    question_type: req.enum(
      [
        'short_answer',
        'long_answer',
        'multiple_choice',
        'checkbox',
        'dropdown',
        'rating',
        'likert',
        'date',
        'file_upload',
      ],
      'ชนิดคำถาม: ตอบสั้น / ตอบยาว / เลือกหนึ่งข้อ / เลือกได้หลายข้อ / รายการแบบเลื่อนลง / ให้คะแนน / มาตรประมาณค่า (Likert) / วันที่ / แนบไฟล์',
    ),
    text: req.string('ข้อความคำถาม'),
    options: col.json<string[]>(
      'ตัวเลือกของคำถามชนิด multiple_choice / checkbox / dropdown หรือป้ายระดับของ likert เรียงจากระดับต่ำสุดไปสูงสุด',
      { example: '["น้อย","ปานกลาง","มาก"]' },
    ),
    is_required: req.boolean('true = บังคับตอบ'),
    settings: col.json<SurveyQuestionSettings>(
      'การตั้งค่าเฉพาะชนิดคำถาม เช่น ช่วงคะแนนของ rating ความยาวสูงสุดของคำตอบ ประเภทและขนาดไฟล์ของ file_upload',
    ),
  },
  { phase: 6 },
);

export const SurveyResponses = defineTable(
  'knowledge',
  'SurveyResponses',
  'การตอบแบบสำรวจหนึ่งครั้งของผู้ตอบหนึ่งคน บันทึกเพิ่มอย่างเดียว — ตารางนี้ไม่มี created_by เพื่อไม่ให้ตัวตนของผู้ตอบแบบสำรวจไม่ระบุตัวตนถูกบันทึกโดยอัตโนมัติ',
  {
    ...logBase,
    survey_id: req.string('แบบสำรวจ', { ref: 'knowledge.Surveys' }),
    respondent_id: col.string(
      'ผู้ตอบ — ว่างเสมอเมื่อแบบสำรวจเป็นแบบไม่ระบุตัวตน (Surveys.is_anonymous = true)',
      { ref: 'master.Users' },
    ),
    respondent_token_hash: req.string(
      'ค่า hash แบบมีกุญแจ (HMAC) ของผู้ตอบคู่กับแบบสำรวจนี้ คำนวณฝั่ง Server ด้วยกุญแจลับ ใช้กันการตอบซ้ำโดยไม่ต้องเก็บตัวตน — จากข้อมูลในชีตอย่างเดียวย้อนกลับเป็นตัวบุคคลไม่ได้ และห้ามแสดงในรายงานหรือไฟล์ส่งออก',
      { pii: 'personal' },
    ),
    submitted_at: req.datetime('วันเวลาที่ส่งคำตอบ'),
    department_id: col.string(
      'กลุ่มสาระของผู้ตอบ ณ เวลาที่ตอบ (snapshot) — บันทึกเฉพาะแบบสำรวจที่ระบุตัวตน ว่างเสมอเมื่อ Surveys.is_anonymous = true',
      { ref: 'master.Departments' },
    ),
  },
  { uniqueKeys: [['survey_id', 'respondent_token_hash']], appendOnly: true, phase: 6 },
);

export const SurveyAnswers = defineTable(
  'knowledge',
  'SurveyAnswers',
  'คำตอบรายคำถามของการตอบแต่ละครั้ง บันทึกเพิ่มอย่างเดียว (ไม่มี created_by เช่นเดียวกับ SurveyResponses)',
  {
    ...logBase,
    response_id: req.string('การตอบแบบสำรวจ', { ref: 'knowledge.SurveyResponses' }),
    question_id: req.string('คำถาม', { ref: 'knowledge.SurveyQuestions' }),
    value: col.string(
      'คำตอบแบบข้อความ: ข้อความที่พิมพ์ (short_answer / long_answer), ตัวเลือกที่เลือก (multiple_choice / dropdown), ตัวเลขระดับ (rating / likert) หรือวันที่ YYYY-MM-DD (date)',
      { pii: 'personal' },
    ),
    value_json: col.json<string[]>(
      'ตัวเลือกทั้งหมดที่เลือก เมื่อ question_type = checkbox',
      { pii: 'personal' },
    ),
    file_id: col.string(
      'ไฟล์ที่แนบ เมื่อ question_type = file_upload — ไม่ใช้กับแบบสำรวจไม่ระบุตัวตน เพราะ File Registry บันทึกผู้อัปโหลด',
      { ref: 'system.FileRegistry' },
    ),
  },
  { uniqueKeys: [['response_id', 'question_id']], appendOnly: true, phase: 6 },
);
