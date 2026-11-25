/**
 * Server-side Link Health Check พร้อมการป้องกัน SSRF (ข้อ 09.3)
 *
 *   - ตรวจเฉพาะ http/https บนพอร์ตมาตรฐาน
 *   - resolve DNS เองแล้วปฏิเสธทุกที่อยู่ที่ไม่ใช่สาธารณะ (ภายใน loopback link-local cloud metadata)
 *   - เชื่อมต่อไปยัง "ที่อยู่ที่ตรวจแล้ว" เท่านั้น (กัน DNS rebinding)
 *   - ไม่ตาม redirect อัตโนมัติ: ตรวจปลายทางของทุก redirect ซ้ำ และจำกัดจำนวนครั้ง
 *   - ไม่ส่ง cookie หรือ credentials ใด ๆ และอ่านเฉพาะ status ไม่อ่านเนื้อหา
 *
 * ผลลัพธ์แยก "ลิงก์เสีย" ออกจาก "ต้องเข้าสู่ระบบ" และ "ปลายทางปฏิเสธการตรวจอัตโนมัติ"
 */
import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LinkCheckResult } from '@/config/reference';
import { isPrivateAddress, isPrivateHostname } from './safe-url';

export interface LinkCheckOutcome {
  result: LinkCheckResult;
  httpStatus: number | null;
  responseMs: number;
  message: string;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface LinkCheckDeps {
  resolve: (hostname: string) => Promise<ResolvedAddress[]>;
  /** ส่งคำขอไปยังที่อยู่ที่ระบุ คืน status และ header location */
  send: (
    url: URL,
    address: ResolvedAddress,
    method: 'HEAD' | 'GET',
  ) => Promise<{ status: number; location: string | null }>;
  now: () => number;
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

async function defaultResolve(hostname: string): Promise<ResolvedAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family === 6 ? 6 : 4 }));
}

function defaultSend(
  url: URL,
  address: ResolvedAddress,
  method: 'HEAD' | 'GET',
): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.protocol === 'https:' ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method,
        // ตรึงการเชื่อมต่อไว้กับที่อยู่ที่ผ่านการตรวจแล้ว
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        servername: url.hostname,
        headers: {
          'user-agent': 'TUNS-Academic-Office-LinkCheck/1.0',
          accept: '*/*',
        },
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const location = response.headers.location;
        response.destroy(); // ไม่อ่านเนื้อหา
        resolve({
          status: response.statusCode ?? 0,
          location: typeof location === 'string' ? location : null,
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.end();
  });
}

function classify(status: number): { result: LinkCheckResult; message: string } {
  if (status >= 200 && status < 400) return { result: 'ok', message: 'ปลายทางตอบกลับปกติ' };
  if (status === 401 || status === 407) {
    return { result: 'auth_required', message: 'ปลายทางต้องเข้าสู่ระบบ (ไม่ใช่ลิงก์เสีย)' };
  }
  if (status === 403 || status === 405 || status === 429 || status === 999) {
    return {
      result: 'blocked',
      message: 'ปลายทางปฏิเสธการตรวจอัตโนมัติ กรุณาทดลองเปิดด้วยตนเอง',
    };
  }
  if (status === 404 || status === 410) return { result: 'broken', message: 'ไม่พบหน้าปลายทาง' };
  return { result: 'unreachable', message: `ปลายทางตอบกลับผิดปกติ (HTTP ${status})` };
}

export async function checkLink(
  rawUrl: string,
  overrides: Partial<LinkCheckDeps> = {},
): Promise<LinkCheckOutcome> {
  const deps: LinkCheckDeps = {
    resolve: overrides.resolve ?? defaultResolve,
    send: overrides.send ?? defaultSend,
    now: overrides.now ?? Date.now,
  };
  const startedAt = deps.now();
  const finish = (
    result: LinkCheckResult,
    message: string,
    httpStatus: number | null = null,
  ): LinkCheckOutcome => ({ result, httpStatus, message, responseMs: deps.now() - startedAt });
  const unsafe = (message: string) => finish('unsafe', message);

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return unsafe('รูปแบบ URL ไม่ถูกต้อง');
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== 'https:' && current.protocol !== 'http:') {
      return unsafe('ตรวจได้เฉพาะลิงก์ http/https');
    }
    if (current.username || current.password) return unsafe('URL มีข้อมูลเข้าสู่ระบบฝังอยู่');
    if (current.port && current.port !== '443' && current.port !== '80') {
      return unsafe('ตรวจได้เฉพาะพอร์ตมาตรฐาน (80/443)');
    }
    if (isPrivateHostname(current.hostname)) {
      return unsafe('ปลายทางอยู่ในเครือข่ายภายใน ระบบไม่ตรวจจากฝั่ง Server');
    }

    let addresses: ResolvedAddress[];
    try {
      addresses = await deps.resolve(current.hostname);
    } catch {
      return finish('unreachable', 'ไม่พบชื่อโฮสต์ปลายทาง (DNS)');
    }
    if (addresses.length === 0) return finish('unreachable', 'ไม่พบชื่อโฮสต์ปลายทาง (DNS)');
    // ถ้าชื่อโฮสต์ชี้ไปที่อยู่ภายในแม้เพียงรายการเดียว ให้ปฏิเสธทั้งหมด
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      return unsafe('ชื่อโฮสต์ชี้ไปยังที่อยู่ในเครือข่ายภายใน ระบบไม่ตรวจจากฝั่ง Server');
    }
    const target = addresses[0] as ResolvedAddress;

    let response: { status: number; location: string | null };
    try {
      response = await deps.send(current, target, 'HEAD');
      // บางเว็บไซต์ไม่รองรับ HEAD — ลอง GET หนึ่งครั้ง
      if (response.status === 405 || response.status === 501) {
        response = await deps.send(current, target, 'GET');
      }
    } catch (error) {
      const timedOut = error instanceof Error && error.message === 'timeout';
      return finish('unreachable', timedOut ? 'ปลายทางไม่ตอบกลับภายในเวลาที่กำหนด' : 'เชื่อมต่อปลายทางไม่ได้');
    }

    if (response.status >= 300 && response.status < 400 && response.location) {
      try {
        current = new URL(response.location, current);
      } catch {
        return finish('broken', 'ปลายทาง redirect ไปยังที่อยู่ที่ไม่ถูกต้อง', response.status);
      }
      continue;
    }
    const { result, message } = classify(response.status);
    return finish(result, message, response.status);
  }
  return finish('unreachable', 'ปลายทาง redirect หลายครั้งเกินไป');
}
