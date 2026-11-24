/**
 * อัตลักษณ์ของระบบและสถานศึกษา (Project Identity)
 *
 * ค่าในไฟล์นี้เป็นค่าตั้งต้นที่ใช้เมื่อยังไม่ได้ตั้งค่าผ่าน Setup Wizard
 * ชื่อสถานศึกษาต้องสะกดตามนี้ในทุกหน้า เอกสาร PDF รายงาน หน้าล็อกอิน และ Footer
 */
export const SYSTEM = {
  nameEn: 'TUNS Academic Office',
  nameTh: 'ระบบสำนักงานวิชาการดิจิทัล',
  shortName: 'TUNS',
  schoolNameTh: 'โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า สมุทรปราการ',
  unitNameTh: 'กลุ่มบริหารวิชาการ',
  taglineTh: 'ทุกงานวิชาการ เชื่อมถึงกันในที่เดียว',
  taglineEn: 'One Workspace. Connected Academic Operations.',
  descriptionTh:
    'ศูนย์กลางการทำงานของกลุ่มบริหารวิชาการ สำหรับครู เจ้าหน้าที่ หัวหน้ากลุ่มสาระ หัวหน้างาน และผู้บริหาร',
  locale: 'th-TH',
  timezone: 'Asia/Bangkok',
  version: '1.0.0-alpha.1',
  /** ชื่อ Root Folder ใน Google Drive (ข้อ 21.1) */
  driveRootFolderName: 'TUNS Academic Office - โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า สมุทรปราการ',
} as const;

/** กลุ่มสาระการเรียนรู้ 8 กลุ่มตามหลักสูตรแกนกลางฯ (ข้อ 16 / 06.3) — เป็นข้อมูลอ้างอิงมาตรฐาน ไม่ใช่ข้อมูลสมมติ */
export const LEARNING_AREAS = [
  { code: 'THA', nameTh: 'ภาษาไทย', order: 1 },
  { code: 'MAT', nameTh: 'คณิตศาสตร์', order: 2 },
  { code: 'SCI', nameTh: 'วิทยาศาสตร์และเทคโนโลยี', order: 3 },
  { code: 'SOC', nameTh: 'สังคมศึกษา ศาสนา และวัฒนธรรม', order: 4 },
  { code: 'HPE', nameTh: 'สุขศึกษาและพลศึกษา', order: 5 },
  { code: 'ART', nameTh: 'ศิลปะ', order: 6 },
  { code: 'OCC', nameTh: 'การงานอาชีพ', order: 7 },
  { code: 'FOR', nameTh: 'ภาษาต่างประเทศ', order: 8 },
] as const;

export type LearningAreaCode = (typeof LEARNING_AREAS)[number]['code'];
