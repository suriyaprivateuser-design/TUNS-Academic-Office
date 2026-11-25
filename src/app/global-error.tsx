'use client';

import { useEffect } from 'react';

/**
 * ข้อผิดพลาดระดับ Root Layout — หน้านี้แทนที่ทั้งเอกสาร จึงไม่มี stylesheet ของระบบ
 * ใช้ style ในตัวตามโทนสีของ Design Token (Background #F8EDE3, Primary #642517, Text #402D20)
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#F8EDE3',
          color: '#402D20',
          fontFamily: "'Noto Sans Thai Variable', 'Noto Sans Thai', system-ui, sans-serif",
        }}
      >
        <title>เกิดข้อผิดพลาด</title>
        <main style={{ maxWidth: '28rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', lineHeight: 1.4, margin: 0 }}>ระบบขัดข้องชั่วคราว</h1>
          <p style={{ margin: '0.75rem 0 1.5rem', lineHeight: 1.7, color: '#6F4E37' }}>
            ลองโหลดใหม่อีกครั้ง หากยังใช้งานไม่ได้ กรุณาแจ้งผู้ดูแลระบบของกลุ่มบริหารวิชาการ
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              height: '2.75rem',
              padding: '0 1.25rem',
              border: 0,
              borderRadius: '0.75rem',
              background: '#642517',
              color: '#FFFFFF',
              font: 'inherit',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  );
}
