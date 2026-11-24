import { describe, expect, it } from 'vitest';
import {
  addDays,
  eachDate,
  formatThaiDate,
  formatThaiDateFull,
  formatThaiDateRange,
  formatThaiDateShort,
  formatThaiDateTime,
  formatThaiTime,
  greetingFor,
  schoolHour,
  schoolWeekday,
  toSchoolDate,
} from '@/lib/utils/thai-date';

describe('thai-date', () => {
  it('shows the Buddhist year and Thai month names', () => {
    expect(formatThaiDate('2026-11-24')).toBe('24 พฤศจิกายน 2569');
    expect(formatThaiDateShort('2026-11-24')).toBe('24 พ.ย. 2569');
    expect(formatThaiDateFull('2026-11-24')).toBe('วันอังคารที่ 24 พฤศจิกายน 2569');
  });

  it('uses Bangkok time regardless of the server timezone', () => {
    // 18:30 UTC ของวันที่ 31 ธ.ค. คือ 01:30 ของวันที่ 1 ม.ค. ที่กรุงเทพฯ
    const instant = '2026-12-31T18:30:00.000Z';
    expect(toSchoolDate(instant)).toBe('2027-01-01');
    expect(formatThaiDate(instant)).toBe('1 มกราคม 2570');
    expect(formatThaiTime(instant)).toBe('01:30 น.');
    expect(formatThaiDateTime(instant)).toBe('1 ม.ค. 2570 01:30 น.');
    expect(schoolHour(instant)).toBe(1);
  });

  it('never shifts a calendar date', () => {
    expect(toSchoolDate('2026-11-24')).toBe('2026-11-24');
    expect(schoolWeekday('2026-11-24')).toBe(2);
    expect(schoolWeekday('2026-11-29')).toBe(7);
  });

  it('greets by time of day in Bangkok', () => {
    expect(greetingFor('2026-11-24T01:00:00.000Z')).toBe('สวัสดีตอนเช้า');
    expect(greetingFor('2026-11-24T07:00:00.000Z')).toBe('สวัสดีตอนบ่าย');
    expect(greetingFor('2026-11-24T11:00:00.000Z')).toBe('สวัสดีตอนเย็น');
  });

  it('does calendar arithmetic across months and years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(eachDate('2026-11-29', '2026-12-02')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
  });

  it('formats compact ranges', () => {
    expect(formatThaiDateRange('2026-11-24')).toBe('24 พ.ย. 2569');
    expect(formatThaiDateRange('2026-11-24', '2026-11-26')).toBe('24–26 พ.ย. 2569');
    expect(formatThaiDateRange('2026-11-30', '2026-12-02')).toBe('30 พ.ย. – 2 ธ.ค. 2569');
    expect(formatThaiDateRange('2026-12-30', '2027-01-02')).toBe('30 ธ.ค. 2569 – 2 ม.ค. 2570');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatThaiDate('not-a-date')).toBe('');
    expect(formatThaiDateTime('')).toBe('');
  });
});
