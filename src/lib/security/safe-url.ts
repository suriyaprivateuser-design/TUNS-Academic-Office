/**
 * ตรวจ URL ของลิงก์บริการ (ข้อ 19 / 09.2) และป้องกัน SSRF ในการตรวจลิงก์จากฝั่ง Server (ข้อ 09.3)
 *
 * แยก 2 เรื่องออกจากกัน:
 *   1) "เก็บลิงก์ได้ไหม"  — ต้องเป็น http/https ที่รูปแบบถูกต้อง ไม่มี credentials ฝังใน URL
 *      (ลิงก์ไปยังระบบในเครือข่ายภายในโรงเรียนเก็บได้ เพราะผู้ใช้เปิดจากเครื่องของตนเอง)
 *   2) "Server ไปตรวจได้ไหม" — เฉพาะปลายทางสาธารณะเท่านั้น ที่อยู่ภายใน/loopback/metadata ถูกปฏิเสธเสมอ
 */

export type UrlCheck = { ok: true; url: string; isPrivateHost: boolean } | { ok: false; reason: string };

const MAX_URL_LENGTH = 2000;

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? numbers : null;
}

/** ที่อยู่ IPv4 ที่ไม่ใช่ปลายทางสาธารณะ */
export function isPrivateIpv4(address: string): boolean {
  const ip = parseIpv4(address);
  if (!ip) return false;
  const [a = 0, b = 0, c = 0] = ip;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local รวม cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast และ reserved
  );
}

export function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  if (!value.includes(':')) return false;
  if (value === '::' || value === '::1') return true;
  // IPv4-mapped (::ffff:a.b.c.d หรือ ::ffff:hhhh:hhhh)
  const mapped = /^::ffff:(.+)$/.exec(value)?.[1];
  if (mapped) {
    if (mapped.includes('.')) return isPrivateIpv4(mapped);
    const [high = '0', low = '0'] = mapped.split(':');
    const h = parseInt(high, 16);
    const l = parseInt(low, 16);
    return isPrivateIpv4(`${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`);
  }
  const first = parseInt(value.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    value.startsWith('64:ff9b:') || // NAT64
    value.startsWith('2001:db8:') // documentation
  );
}

export function isPrivateAddress(address: string): boolean {
  return isPrivateIpv4(address) || isPrivateIpv6(address);
}

const PRIVATE_SUFFIXES = ['.local', '.localhost', '.internal', '.intranet', '.lan', '.home', '.corp'];

/** ชื่อโฮสต์ที่ชี้ไปเครือข่ายภายในอย่างชัดเจน (ไม่ต้อง resolve DNS) */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || !host.includes('.')) return !host.includes(':') || isPrivateIpv6(host);
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return isPrivateAddress(host);
}

/**
 * ตรวจ URL ก่อนบันทึกเป็นลิงก์บริการ
 * ปฏิเสธ scheme อื่นทั้งหมด (javascript:, data:, file:, ftp: ฯลฯ)
 */
export function validateServiceUrl(input: string, options: { allowHttp?: boolean } = {}): UrlCheck {
  const value = input.trim();
  if (!value) return { ok: false, reason: 'กรุณาระบุ URL' };
  if (value.length > MAX_URL_LENGTH) return { ok: false, reason: 'URL ยาวเกินไป' };
  if (/[\u0000- \u007f]/.test(value)) return { ok: false, reason: 'URL มีช่องว่างหรืออักขระที่ไม่อนุญาต' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'รูปแบบ URL ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)' };
  }
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:')) {
    return {
      ok: false,
      reason: options.allowHttp
        ? 'อนุญาตเฉพาะลิงก์ที่ขึ้นต้นด้วย https:// หรือ http://'
        : 'อนุญาตเฉพาะลิงก์ที่ขึ้นต้นด้วย https://',
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'ห้ามใส่ชื่อผู้ใช้หรือรหัสผ่านไว้ใน URL' };
  }
  if (!url.hostname) return { ok: false, reason: 'URL ไม่มีชื่อโฮสต์' };
  return { ok: true, url: url.toString(), isPrivateHost: isPrivateHostname(url.hostname) };
}
