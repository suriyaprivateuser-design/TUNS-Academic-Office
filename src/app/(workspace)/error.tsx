'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { HOME_PATH } from '@/config/routes';

/**
 * ข้อผิดพลาดที่ไม่คาดคิดของหน้าใน Workspace
 * ข้อความจาก Server ถูก Next.js แทนที่ด้วยข้อความทั่วไปใน Production อยู่แล้ว
 * หน้านี้แสดงเฉพาะรหัสอ้างอิง (digest) ให้ผู้ดูแลใช้ค้นใน log
 */
export default function WorkspaceError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest =
    error instanceof Error && 'digest' in error && typeof error.digest === 'string' ? error.digest : null;

  return (
    <div className="rounded-card bg-surface shadow-card ring-1 ring-border/60">
      <EmptyState
        illustration="setup-required"
        title="หน้านี้โหลดไม่สำเร็จ"
        description={
          <>
            อาจเป็นปัญหาชั่วคราวของการเชื่อมต่อ ลองโหลดใหม่อีกครั้ง หากยังไม่ได้ กรุณาแจ้งผู้ดูแลระบบ
            {digest ? (
              <span className="mt-2 block text-caption">
                รหัสอ้างอิง: <code className="font-mono">{digest}</code>
              </span>
            ) : null}
          </>
        }
        action={
          <>
            <Button onClick={() => retry()}>ลองใหม่</Button>
            <Button asChild variant="secondary">
              <Link href={HOME_PATH}>กลับหน้าแรก</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
