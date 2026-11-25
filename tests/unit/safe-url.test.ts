import { describe, expect, it } from 'vitest';
import { checkLink, type LinkCheckDeps } from '@/lib/security/link-check';
import { checkRateLimit, resetRateLimits } from '@/lib/security/rate-limit';
import {
  isPrivateAddress,
  isPrivateHostname,
  validateServiceUrl,
} from '@/lib/security/safe-url';

describe('validateServiceUrl', () => {
  it('accepts https links and normalises them', () => {
    expect(validateServiceUrl('  https://example.org/path?a=1  ')).toEqual({
      ok: true,
      url: 'https://example.org/path?a=1',
      isPrivateHost: false,
    });
  });

  it('rejects every non-web scheme', () => {
    for (const url of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.org/file',
      'vbscript:msgbox(1)',
      '//example.org',
      'example.org',
      '',
    ]) {
      expect(validateServiceUrl(url).ok, url).toBe(false);
    }
  });

  it('allows http only when the administrator has enabled it', () => {
    expect(validateServiceUrl('http://example.org').ok).toBe(false);
    expect(validateServiceUrl('http://example.org', { allowHttp: true }).ok).toBe(true);
  });

  it('rejects embedded credentials, whitespace and over-long values', () => {
    expect(validateServiceUrl('https://user:pass@example.org').ok).toBe(false);
    expect(validateServiceUrl('https://example.org/a b').ok).toBe(false);
    expect(validateServiceUrl('https://example.org/\nSet-Cookie:x').ok).toBe(false);
    expect(validateServiceUrl(`https://example.org/${'a'.repeat(2100)}`).ok).toBe(false);
  });

  it('flags intranet hosts so the server never fetches them', () => {
    const result = validateServiceUrl('https://sis.school.local/login');
    expect(result).toMatchObject({ ok: true, isPrivateHost: true });
  });
});

describe('private address detection', () => {
  it('recognises non-public IPv4 ranges', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '203.150.1.1', '1.1.1.1']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('recognises non-public IPv6 ranges including IPv4-mapped addresses', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.5', 'ff02::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('recognises internal host names', () => {
    for (const host of ['localhost', 'intranet', 'server.local', 'app.internal', '192.168.0.10', '[::1]']) {
      expect(isPrivateHostname(host), host).toBe(true);
    }
    expect(isPrivateHostname('www.example.org')).toBe(false);
  });
});

describe('checkLink (SSRF-safe link health check)', () => {
  const PUBLIC = [{ address: '93.184.216.34', family: 4 as const }];
  function deps(overrides: Partial<LinkCheckDeps> & { calls?: string[] } = {}): Partial<LinkCheckDeps> {
    return {
      resolve: async () => PUBLIC,
      send: async () => ({ status: 200, location: null }),
      ...overrides,
    };
  }

  it('reports a healthy link', async () => {
    expect(await checkLink('https://example.org/', deps())).toMatchObject({ result: 'ok', httpStatus: 200 });
  });

  it('separates broken links from login walls and bot blocking', async () => {
    const status = (code: number) => deps({ send: async () => ({ status: code, location: null }) });
    expect((await checkLink('https://example.org/', status(404))).result).toBe('broken');
    expect((await checkLink('https://example.org/', status(410))).result).toBe('broken');
    expect((await checkLink('https://example.org/', status(401))).result).toBe('auth_required');
    expect((await checkLink('https://example.org/', status(403))).result).toBe('blocked');
    expect((await checkLink('https://example.org/', status(429))).result).toBe('blocked');
    expect((await checkLink('https://example.org/', status(503))).result).toBe('unreachable');
  });

  it('falls back to GET when HEAD is not supported', async () => {
    const methods: string[] = [];
    const outcome = await checkLink(
      'https://example.org/',
      deps({
        send: async (_url, _address, method) => {
          methods.push(method);
          return { status: method === 'HEAD' ? 405 : 200, location: null };
        },
      }),
    );
    expect(methods).toEqual(['HEAD', 'GET']);
    expect(outcome.result).toBe('ok');
  });

  it('never connects to internal targets', async () => {
    let sent = 0;
    const tracking = deps({
      send: async () => {
        sent += 1;
        return { status: 200, location: null };
      },
    });
    for (const url of [
      'http://localhost/admin',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.1/',
      'http://[::1]/',
      'https://intranet/',
      'https://app.internal/',
      'https://example.org:8443/',
      'https://user:pw@example.org/',
      'ftp://example.org/',
      'not a url',
    ]) {
      expect((await checkLink(url, tracking)).result, url).toBe('unsafe');
    }
    expect(sent).toBe(0);
  });

  it('rejects public host names that resolve to internal addresses (DNS rebinding)', async () => {
    let sent = 0;
    const outcome = await checkLink(
      'https://innocent.example.org/',
      deps({
        resolve: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ],
        send: async () => {
          sent += 1;
          return { status: 200, location: null };
        },
      }),
    );
    expect(outcome.result).toBe('unsafe');
    expect(sent).toBe(0);
  });

  it('re-validates every redirect hop and connects only to the vetted address', async () => {
    const seen: string[] = [];
    const outcome = await checkLink(
      'https://example.org/start',
      deps({
        send: async (url, address) => {
          seen.push(`${url.href}@${address.address}`);
          return { status: 302, location: 'http://169.254.169.254/latest/meta-data/' };
        },
      }),
    );
    expect(outcome.result).toBe('unsafe');
    expect(seen).toEqual(['https://example.org/start@93.184.216.34']);
  });

  it('follows a limited number of safe redirects', async () => {
    let hops = 0;
    const loop = deps({
      send: async () => {
        hops += 1;
        return { status: 301, location: `/next-${hops}` };
      },
    });
    expect((await checkLink('https://example.org/', loop)).result).toBe('unreachable');
    expect(hops).toBe(4);

    let step = 0;
    const once = deps({
      send: async () => {
        step += 1;
        return step === 1 ? { status: 302, location: '/login' } : { status: 200, location: null };
      },
    });
    expect((await checkLink('https://example.org/', once)).result).toBe('ok');
  });

  it('reports DNS failures and timeouts as unreachable', async () => {
    const dns = deps({
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect((await checkLink('https://nope.example.org/', dns)).result).toBe('unreachable');
    const timeout = deps({
      send: async () => {
        throw new Error('timeout');
      },
    });
    expect((await checkLink('https://example.org/', timeout)).message).toContain('ไม่ตอบกลับ');
  });
});

describe('checkRateLimit', () => {
  it('allows up to the limit per window and then blocks', () => {
    resetRateLimits();
    const rule = { limit: 3, windowMs: 1000 };
    expect([1, 2, 3, 4].map(() => checkRateLimit('u1:test', rule, 1000))).toEqual([true, true, true, false]);
    // ผู้ใช้อื่นมีโควตาแยกกัน และหน้าต่างเวลาใหม่เริ่มนับใหม่
    expect(checkRateLimit('u2:test', rule, 1000)).toBe(true);
    expect(checkRateLimit('u1:test', rule, 2001)).toBe(true);
  });
});
