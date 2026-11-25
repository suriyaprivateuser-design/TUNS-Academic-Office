import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { BrandLockup } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { HOME_PATH } from '@/config/routes';

export const metadata: Metadata = { title: 'ไม่พบหน้านี้' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 px-6 py-12">
      <BrandLockup />
      <div className="w-full rounded-card bg-surface shadow-card ring-1 ring-border/60">
        <EmptyState
          illustration="empty-search"
          title="ไม่พบหน้านี้"
          description="ที่อยู่ที่เปิดอาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว"
          action={
            <Button asChild>
              <Link href={HOME_PATH}>กลับหน้าแรก</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
