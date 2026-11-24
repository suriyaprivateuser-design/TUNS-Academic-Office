import type { NextConfig } from 'next';

/**
 * Security headers ที่ไม่ขึ้นกับ request (CSP แบบ nonce ตั้งใน src/proxy.ts)
 * ดูรายละเอียดและเหตุผลของแต่ละ header ใน docs/SECURITY.md
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // SAMEORIGIN (ไม่ใช่ DENY) เพราะหน้า preview เอกสารฝัง PDF จาก origin เดียวกันผ่าน <iframe>
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pdfkit อ่านไฟล์ข้อมูลฟอนต์จาก node_modules ด้วย fs จึงต้องไม่ถูก bundle
  serverExternalPackages: ['pdfkit'],
  images: {
    remotePatterns: [
      // รูปโปรไฟล์จากบัญชี Google ของผู้ใช้
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
