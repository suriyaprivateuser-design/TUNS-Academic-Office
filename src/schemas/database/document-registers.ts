/**
 * ทะเบียนงานสารบรรณของ TUNS_DOCUMENT_DATABASE (Module 02.1, 02.2, 02.5, 02.6, 02.7)
 *
 * ไฟล์นี้ export เฉพาะนิยามตาราง เพื่อนำไปรวมใน DatabaseDef ของฐานข้อมูล document
 *
 * หลักการออกเลข: เลขที่ระบบออกเป็นเลขภายในของกลุ่มบริหารวิชาการเท่านั้น
 * หากงานสารบรรณกลางของโรงเรียนออกเลขทางการไว้แล้ว ให้บันทึกการอ้างอิงใน central_register_ref
 * และระบบต้องไม่ออกเลขทางการซ้ำ
 */
import { archivable, base, term } from './common';
import { col, defineTable, req } from './types';

/** บุคลากรที่ได้รับมอบหมายตามคำสั่ง (OfficialOrders.assignees) */
export interface OrderAssignee {
  /** บุคลากร (master.Teachers.id) */
  teacher_id: string;
  /** หน้าที่ตามที่ระบุในคำสั่ง */
  duty: string;
}

/** กลุ่มเป้าหมายของประกาศทางการ (AnnouncementsRegister.target_audience) */
export type AnnouncementAudience = 'personnel' | 'students' | 'parents' | 'public';

/** ช่องข้อมูลหนึ่งช่องที่วางลงบนแม่แบบเกียรติบัตร */
export interface CertificateLayoutField {
  /** ข้อมูลที่นำมาวาง: คอลัมน์ของ Certificates หรือ QR สำหรับตรวจสอบ */
  source:
    | 'recipient_name'
    | 'award_title'
    | 'activity_title'
    | 'issue_date'
    | 'certificate_no'
    | 'verification_qr';
  /** ระยะจากขอบซ้ายของหน้าถึงขอบซ้ายของกรอบ (pt) */
  x: number;
  /** ระยะจากขอบบนของหน้าถึงขอบบนของกรอบ (pt) */
  y: number;
  /** ความกว้างของกรอบข้อความ หรือความยาวด้านของ QR (pt) */
  width: number;
  /** ชื่อฟอนต์ที่ฝังในระบบ (ไม่ใช้กับ QR) */
  font_family?: string;
  /** ขนาดตัวอักษร (pt) */
  font_size?: number;
  font_weight?: 'regular' | 'bold';
  /** สีตัวอักษรแบบ hex เช่น #642517 */
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** การจัดวางข้อมูลบนแม่แบบเกียรติบัตร (CertificateTemplates.layout) */
export interface CertificateLayout {
  /** ความกว้างของหน้า (pt) */
  page_width: number;
  /** ความสูงของหน้า (pt) */
  page_height: number;
  fields: CertificateLayoutField[];
}

export const IncomingDocuments = defineTable(
  'document',
  'IncomingDocuments',
  'ทะเบียนหนังสือรับของกลุ่มบริหารวิชาการ — เลขทะเบียนรับเป็นเลขภายใน หากหนังสือมีเลขรับของงานสารบรรณกลางแล้วให้อ้างอิงใน central_register_ref ระบบไม่ออกเลขทางการซ้ำ',
  {
    ...base,
    receive_no: req.string(
      'เลขทะเบียนรับภายในของกลุ่มบริหารวิชาการ ออกโดยระบบเรียงตามลำดับ (ไม่ใช่เลขทะเบียนรับทางการของโรงเรียน) เก็บเป็นข้อความเพื่อรักษาศูนย์นำหน้า',
    ),
    central_register_ref: col.string(
      'เลขทะเบียนรับที่งานสารบรรณกลางของโรงเรียนออกไว้แล้ว (ถ้ามี) — ระบบอ้างอิงเลขนี้เท่านั้น ไม่ออกเลขทางการซ้ำ',
    ),
    document_no: col.string('เลขที่หนังสือตามที่ปรากฏบนหนังสือต้นทาง (ที่)'),
    document_date: col.date('วันที่ของหนังสือ (ลงวันที่)'),
    received_date: req.date('วันที่รับหนังสือ'),
    subject: req.string('เรื่อง'),
    from_organization: req.string(
      'หน่วยงานผู้ส่งหนังสือ (จาก) — กรณีผู้ส่งเป็นบุคคลให้ระบุชื่อบุคคล',
      { pii: 'personal' },
    ),
    urgency: req.enum(
      ['normal', 'urgent', 'very_urgent', 'most_urgent'],
      'ชั้นความเร็ว: ปกติ / ด่วน / ด่วนมาก / ด่วนที่สุด',
    ),
    secrecy: req.enum(
      ['normal', 'confidential', 'secret', 'top_secret'],
      'ชั้นความลับ: ปกติ (ไม่มีชั้นความลับ) / ลับ / ลับมาก / ลับที่สุด — หนังสือที่มีชั้นความลับต้องจำกัดสิทธิ์เข้าถึงไฟล์เฉพาะผู้เกี่ยวข้อง',
    ),
    responsible_user_id: col.string('ผู้รับผิดชอบดำเนินการตามหนังสือ', { ref: 'master.Users' }),
    unit_id: col.string('กลุ่มงานที่เกี่ยวข้องกับหนังสือ', { ref: 'master.AcademicUnits' }),
    department_id: col.string('กลุ่มสาระที่เกี่ยวข้องกับหนังสือ', { ref: 'master.Departments' }),
    status: req.enum(
      ['registered', 'forwarded', 'acknowledged', 'in_progress', 'completed', 'archived'],
      'สถานะ: ลงทะเบียนรับแล้ว / ส่งต่อผู้รับผิดชอบแล้ว / รับทราบแล้ว / กำลังดำเนินการ / ดำเนินการเสร็จ / จัดเก็บแล้ว',
    ),
    main_file_id: col.string('ไฟล์หนังสือฉบับหลัก (ไฟล์สแกนหรือไฟล์ต้นฉบับ)', {
      ref: 'system.FileRegistry',
    }),
    note: col.string('หมายเหตุหรือการปฏิบัติ (อาจระบุชื่อบุคคล)', { pii: 'personal' }),
    ...term,
    ...archivable,
  },
  { phase: 2 },
);

export const OutgoingDocuments = defineTable(
  'document',
  'OutgoingDocuments',
  'ทะเบียนหนังสือส่งของกลุ่มบริหารวิชาการ — ประวัติการแก้ไขและการเปลี่ยนสถานะเก็บใน Audit Log ไม่เก็บซ้ำในตารางนี้',
  {
    ...base,
    document_no: col.string(
      'เลขที่หนังสือส่ง (ว่างได้ขณะ status = draft) — หากงานสารบรรณกลางของโรงเรียนออกเลขไว้แล้วให้บันทึกเลขนั้น ระบบไม่ออกเลขทางการซ้ำ',
    ),
    central_register_ref: col.string(
      'การอ้างอิงทะเบียนหนังสือส่งของงานสารบรรณกลาง เมื่อเลขที่หนังสือออกโดยทะเบียนกลาง (มีค่า = ระบบต้องไม่ออกเลขให้)',
    ),
    subject: req.string('เรื่อง'),
    to_organization: req.string(
      'หน่วยงานผู้รับหนังสือ (ถึง) — กรณีผู้รับเป็นบุคคลให้ระบุชื่อบุคคล',
      { pii: 'personal' },
    ),
    sent_date: col.date('วันที่ส่งหนังสือ (ว่าง = ยังไม่ส่ง)'),
    delivery_channel: col.enum(
      ['paper', 'email', 'e_office', 'post', 'other'],
      'ช่องทางการส่ง: เอกสารกระดาษ / อีเมล / ระบบ e-Office / ไปรษณีย์ / อื่น ๆ',
    ),
    responsible_user_id: req.string('ผู้รับผิดชอบ (เจ้าของเรื่อง)', { ref: 'master.Users' }),
    incoming_document_id: col.string(
      'หนังสือรับที่หนังสือฉบับนี้ตอบหรืออ้างถึง เมื่ออยู่ในทะเบียนหนังสือรับของระบบ',
      { ref: 'document.IncomingDocuments' },
    ),
    reference_text: col.string(
      'อ้างถึง (ข้อความ) ใช้เมื่อหนังสือที่อ้างถึงไม่อยู่ในทะเบียนของระบบ',
    ),
    original_file_id: col.string('ไฟล์ต้นฉบับของหนังสือส่ง', { ref: 'system.FileRegistry' }),
    status: req.enum(
      ['draft', 'registered', 'sent', 'archived'],
      'สถานะ: ฉบับร่าง / ลงทะเบียนส่งแล้ว (มีเลขที่หนังสือ) / ส่งแล้ว / จัดเก็บแล้ว',
    ),
    note: col.string('หมายเหตุ (อาจระบุชื่อบุคคล)', { pii: 'personal' }),
    ...term,
    ...archivable,
  },
  { phase: 2 },
);

export const OfficialOrders = defineTable(
  'document',
  'OfficialOrders',
  'ทะเบียนคำสั่ง — เมื่อออกคำสั่งแล้ว (issued) เนื้อหาและรายชื่อผู้ได้รับมอบหมายต้องไม่เปลี่ยน การแก้ไขให้ออกคำสั่งฉบับใหม่ ไฟล์ฉบับลงนามคือหลักฐานทางการ',
  {
    ...base,
    order_no: col.string(
      'เลขที่คำสั่ง (ว่างได้ก่อนออกคำสั่ง) — หากงานสารบรรณกลางของโรงเรียนออกเลขไว้แล้วให้บันทึกเลขนั้น ระบบไม่ออกเลขทางการซ้ำ',
    ),
    central_register_ref: col.string(
      'การอ้างอิงทะเบียนคำสั่งของงานสารบรรณกลาง เมื่อเลขที่คำสั่งออกโดยทะเบียนกลาง (มีค่า = ระบบต้องไม่ออกเลขให้)',
    ),
    title: req.string('เรื่องของคำสั่ง'),
    order_date: col.date('วันที่ลงนามในคำสั่ง (สั่ง ณ วันที่)'),
    effective_from: col.date('วันที่คำสั่งเริ่มมีผล'),
    effective_to: col.date('วันที่คำสั่งสิ้นผล (ว่าง = ไม่กำหนดวันสิ้นสุด)'),
    assignees: col.json<OrderAssignee[]>(
      'บุคลากรที่ได้รับมอบหมายตามคำสั่ง [{ teacher_id, duty }] — teacher_id อ้างอิง master.Teachers ส่วน duty คือหน้าที่ตามที่ระบุในคำสั่ง (snapshot ไม่เปลี่ยนหลังออกคำสั่ง) ชื่อและตำแหน่ง ณ วันออกคำสั่งให้ยึดไฟล์ฉบับลงนาม รวมไม่เกิน 50,000 อักขระต่อ cell',
    ),
    draft_document_id: col.string(
      'เอกสารร่างคำสั่งใน Documents (แหล่งเดียวของไฟล์ร่างและเวอร์ชัน)',
      { ref: 'document.Documents' },
    ),
    signed_file_id: col.string('ไฟล์คำสั่งฉบับลงนาม', { ref: 'system.FileRegistry' }),
    status: req.enum(
      ['draft', 'pending_approval', 'issued', 'cancelled'],
      'สถานะ: ฉบับร่าง / รออนุมัติ / ออกคำสั่งแล้ว / ยกเลิก',
    ),
    approval_request_id: col.string('คำขออนุมัติของคำสั่งนี้ใน Approval Engine', {
      ref: 'document.ApprovalRequests',
    }),
    ...term,
    ...archivable,
  },
  { phase: 2 },
);

export const AnnouncementsRegister = defineTable(
  'document',
  'AnnouncementsRegister',
  'ทะเบียนประกาศ (ประกาศทางการของโรงเรียนที่กลุ่มบริหารวิชาการจัดทำ) — ไฟล์ต้นฉบับใช้ร่วมกับข่าวประชาสัมพันธ์ผ่าน document_id เดียวกัน ไม่เก็บไฟล์ซ้ำ',
  {
    ...base,
    announcement_no: col.string(
      'เลขที่ประกาศ (ว่างได้ก่อนเผยแพร่) — หากงานสารบรรณกลางของโรงเรียนออกเลขไว้แล้วให้บันทึกเลขนั้น ระบบไม่ออกเลขทางการซ้ำ',
    ),
    central_register_ref: col.string(
      'การอ้างอิงทะเบียนประกาศของงานสารบรรณกลาง เมื่อเลขที่ประกาศออกโดยทะเบียนกลาง (มีค่า = ระบบต้องไม่ออกเลขให้)',
    ),
    title: req.string('เรื่องของประกาศ'),
    announcement_type: req.enum(
      ['general', 'academic', 'exam', 'admission', 'other'],
      'ประเภทประกาศ: ทั่วไป / วิชาการ / การสอบ / การรับนักเรียน / อื่น ๆ',
    ),
    target_audience: col.json<AnnouncementAudience[]>(
      'กลุ่มเป้าหมายของประกาศ เป็นรายการของค่า personnel (บุคลากร) / students (นักเรียน) / parents (ผู้ปกครอง) / public (บุคคลทั่วไป)',
      { example: '["students","parents"]' },
    ),
    publish_date: col.date('วันที่ประกาศ (ประกาศ ณ วันที่)'),
    expiry_date: col.date(
      'วันที่ประกาศสิ้นผล ใช้เปลี่ยนสถานะเป็น expired (ว่าง = ไม่กำหนดวันสิ้นผล)',
    ),
    status: req.enum(
      ['draft', 'pending_approval', 'published', 'expired', 'cancelled'],
      'สถานะ: ฉบับร่าง / รออนุมัติ / ประกาศแล้ว / สิ้นผลแล้ว / ยกเลิก',
    ),
    document_id: col.string(
      'เอกสารต้นฉบับของประกาศใน Documents — ใช้ document_id เดียวกับ knowledge.Announcements เพื่อให้ไฟล์ต้นฉบับมีที่เดียว',
      { ref: 'document.Documents' },
    ),
    approval_request_id: col.string('คำขออนุมัติของประกาศนี้ใน Approval Engine', {
      ref: 'document.ApprovalRequests',
    }),
    ...term,
    ...archivable,
  },
  { phase: 2 },
);

export const CertificateTemplates = defineTable(
  'document',
  'CertificateTemplates',
  'แม่แบบเกียรติบัตร — การแก้ไขไฟล์หรือการจัดวางต้องเพิ่ม template_version เกียรติบัตรที่ออกไปแล้วไม่ถูกสร้างใหม่ตามแม่แบบที่เปลี่ยน',
  {
    ...base,
    name: req.string('ชื่อแม่แบบ'),
    template_file_id: req.string('ไฟล์พื้นหลังของแม่แบบ (ภาพหรือ PDF)', {
      ref: 'system.FileRegistry',
    }),
    layout: req.json<CertificateLayout>(
      'ตำแหน่งและรูปแบบตัวอักษรของข้อมูลแต่ละช่องบนแม่แบบ { page_width, page_height, fields: [{ source, x, y, width, font_family, font_size, font_weight, color, align }] } หน่วย pt นับจากมุมซ้ายบนของหน้า',
    ),
    template_version: req.int(
      'เลขเวอร์ชันของแม่แบบ เริ่มที่ 1 และเพิ่มเมื่อแก้ไขไฟล์หรือ layout (คนละความหมายกับ version ที่ใช้ตรวจการแก้ไขชนกัน)',
    ),
    is_active: req.boolean('true = เลือกใช้ออกเกียรติบัตรใหม่ได้, false = เลิกใช้ (ยังเก็บไว้อ้างอิง)'),
  },
  { phase: 2 },
);

export const Certificates = defineTable(
  'document',
  'Certificates',
  'เกียรติบัตรที่ออกโดยระบบ ตรวจสอบได้ด้วย QR — หน้าตรวจสอบสาธารณะแสดงเฉพาะข้อมูลเท่าที่จำเป็น (เลขที่เกียรติบัตร ชื่อผู้รับ รายการ วันที่ออก และสถานะ) ไม่แสดงรหัสนักเรียนหรือข้อมูลส่วนบุคคลอื่น',
  {
    ...base,
    certificate_no: req.string(
      'เลขที่เกียรติบัตร ออกโดยระบบและไม่ซ้ำ เก็บเป็นข้อความเพื่อรักษาศูนย์นำหน้า',
    ),
    verification_code: req.string(
      'รหัสตรวจสอบแบบสุ่มที่คาดเดาไม่ได้และไม่ซ้ำ ฝังใน QR ของเกียรติบัตร ใช้เปิดหน้าตรวจสอบสาธารณะ (ไม่ใช้เลขเรียงลำดับ เพื่อกันการไล่เดาเกียรติบัตรของผู้อื่น)',
    ),
    template_id: req.string('แม่แบบที่ใช้ออกเกียรติบัตร', {
      ref: 'document.CertificateTemplates',
    }),
    template_version: req.int(
      'เวอร์ชันของแม่แบบ ณ วันที่ออก (snapshot ของ CertificateTemplates.template_version)',
    ),
    recipient_type: req.enum(
      ['student', 'teacher', 'external'],
      'ประเภทผู้รับ: นักเรียน / บุคลากร / บุคคลภายนอก',
    ),
    recipient_ref: col.string(
      'รหัสผู้รับตาม recipient_type: master.Students / master.Teachers (ว่างเมื่อเป็นบุคคลภายนอก)',
    ),
    recipient_name: req.string(
      'ชื่อผู้รับตามที่พิมพ์บนเกียรติบัตร — snapshot ณ วันที่ออก ไม่เปลี่ยนตามข้อมูลหลักภายหลัง',
      { pii: 'personal' },
    ),
    activity_title: req.string('ชื่อกิจกรรมหรือรายการตามที่พิมพ์บนเกียรติบัตร (snapshot)'),
    award_title: col.string(
      'ชื่อรางวัลหรือระดับผลงานตามที่พิมพ์บนเกียรติบัตร (snapshot) ว่าง = เกียรติบัตรเข้าร่วมกิจกรรม',
    ),
    issue_date: req.date('วันที่ออกเกียรติบัตร (ให้ไว้ ณ วันที่)'),
    issued_by: req.string('ผู้ออกเกียรติบัตรในระบบ', { ref: 'master.Users' }),
    file_id: col.string('ไฟล์เกียรติบัตรที่สร้างแล้ว (ว่าง = ยังสร้างไฟล์ไม่เสร็จ)', {
      ref: 'system.FileRegistry',
    }),
    batch_id: col.string(
      'รหัสชุดการออกเกียรติบัตร ใช้จัดกลุ่มรายการที่ออกพร้อมกัน (ว่าง = ออกรายใบ)',
    ),
    status: req.enum(
      ['issued', 'revoked'],
      'issued = มีผลใช้ได้, revoked = เพิกถอนแล้ว (หน้าตรวจสอบสาธารณะแสดงว่าถูกเพิกถอน)',
    ),
    revoked_at: col.datetime('วันเวลาที่เพิกถอน'),
    revoked_by: col.string('ผู้เพิกถอน', { ref: 'master.Users' }),
    revoked_reason: col.string('เหตุผลการเพิกถอน (ไม่แสดงในหน้าตรวจสอบสาธารณะ)', {
      pii: 'personal',
    }),
    achievements_ref: col.string(
      'รหัสอ้างอิงรายการผลงานในระบบ TUNS-Achievements — บันทึกเฉพาะเมื่อมีช่องทางเชื่อมต่อที่ได้รับอนุญาต (ว่าง = ไม่เชื่อมโยง)',
    ),
    ...term,
    ...archivable,
  },
  { uniqueKeys: [['certificate_no'], ['verification_code']], phase: 2 },
);
