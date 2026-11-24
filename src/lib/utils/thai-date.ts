/**
 * วันที่และเวลาแบบไทย
 *
 * - เขตเวลาของโรงเรียนคือ Asia/Bangkok เสมอ ไม่ขึ้นกับเขตเวลาของ server (Vercel ใช้ UTC)
 * - จัดเก็บ: วันเวลาเป็น ISO 8601 (UTC), วันที่ตามปฏิทินเป็น YYYY-MM-DD (ค.ศ.)
 * - แสดงผล: ปี พ.ศ. ในทุกหน้าจอและเอกสารภาษาไทย
 * ไฟล์นี้ใช้ได้ทั้งฝั่ง Server และ Client
 */
export const SCHOOL_TIMEZONE = 'Asia/Bangkok';
const LOCALE = 'th-TH-u-ca-buddhist-nu-latn';

type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  // วันที่ล้วน (YYYY-MM-DD) หมายถึงวันตามปฏิทินโรงเรียน → ตรึงที่เที่ยงวันเวลาไทยเพื่อไม่ให้เลื่อนวัน
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T12:00:00+07:00`);
  }
  return new Date(input);
}

function format(input: DateInput, options: Intl.DateTimeFormatOptions): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: SCHOOL_TIMEZONE, ...options }).format(date);
}

/** 24 พฤศจิกายน 2569 */
export function formatThaiDate(input: DateInput): string {
  return format(input, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 24 พ.ย. 2569 */
export function formatThaiDateShort(input: DateInput): string {
  return format(input, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 24 พ.ย. */
export function formatThaiDayMonth(input: DateInput): string {
  return format(input, { day: 'numeric', month: 'short' });
}

/** วันอังคารที่ 24 พฤศจิกายน 2569 */
export function formatThaiDateFull(input: DateInput): string {
  const weekday = format(input, { weekday: 'long' });
  return weekday ? `${weekday}ที่ ${formatThaiDate(input)}` : '';
}

/** 10:15 น. */
export function formatThaiTime(input: DateInput): string {
  const time = format(input, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return time ? `${time} น.` : '';
}

/** 24 พ.ย. 2569 10:15 น. */
export function formatThaiDateTime(input: DateInput): string {
  const date = formatThaiDateShort(input);
  return date ? `${date} ${formatThaiTime(input)}` : '';
}

/** ชื่อวันแบบย่อ: จ. อ. พ. … */
export function formatThaiWeekdayShort(input: DateInput): string {
  return format(input, { weekday: 'short' });
}

/** วันที่ตามปฏิทินโรงเรียนของเวลาที่กำหนด ในรูป YYYY-MM-DD */
export function toSchoolDate(input: DateInput = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(toDate(input));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** ชั่วโมง (0–23) ตามเวลาโรงเรียน */
export function schoolHour(input: DateInput = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(toDate(input));
  return Number(hour);
}

/** วันในสัปดาห์แบบ ISO ตามปฏิทินโรงเรียน: 1 = จันทร์ … 7 = อาทิตย์ */
export function schoolWeekday(input: DateInput): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TIMEZONE,
    weekday: 'short',
  }).format(toDate(input));
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

export function greetingFor(input: DateInput = new Date()): string {
  const hour = schoolHour(input);
  if (hour < 12) return 'สวัสดีตอนเช้า';
  if (hour < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}

/** ค.ศ. → พ.ศ. */
export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}

/** วันถัดไป/ก่อนหน้าในรูป YYYY-MM-DD (คำนวณแบบปฏิทิน ไม่ขึ้นกับเขตเวลา) */
export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

/** รายการวันที่ตั้งแต่ start ถึง end (รวมปลายทั้งสอง) จำกัดจำนวนเพื่อกันข้อมูลผิดพลาด */
export function eachDate(start: string, end: string, limit = 62): string[] {
  const dates: string[] = [];
  for (let current = start; current <= end && dates.length < limit; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

/** ช่วงวันที่แบบกระชับ: "24 พ.ย. 2569" หรือ "24–26 พ.ย. 2569" หรือ "30 พ.ย. – 2 ธ.ค. 2569" */
export function formatThaiDateRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatThaiDateShort(start);
  const [startYear, startMonth] = start.split('-');
  const [endYear, endMonth, endDay] = end.split('-');
  if (startYear === endYear && startMonth === endMonth) {
    return `${Number(start.split('-')[2])}–${Number(endDay)} ${format(end, { month: 'short', year: 'numeric' })}`;
  }
  if (startYear === endYear) return `${formatThaiDayMonth(start)} – ${formatThaiDateShort(end)}`;
  return `${formatThaiDateShort(start)} – ${formatThaiDateShort(end)}`;
}
