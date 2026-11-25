import '@fontsource-variable/noto-sans-thai';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { SYSTEM } from '@/config/school';

export const metadata: Metadata = {
  title: {
    default: `${SYSTEM.nameEn} — ${SYSTEM.nameTh}`,
    template: `%s · ${SYSTEM.nameEn}`,
  },
  description: `${SYSTEM.nameTh} ${SYSTEM.schoolNameTh} — ${SYSTEM.taglineTh}`,
  applicationName: SYSTEM.nameEn,
  // ระบบภายในของโรงเรียน ไม่ให้เครื่องมือค้นหาจัดทำดัชนี
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F8EDE3',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
