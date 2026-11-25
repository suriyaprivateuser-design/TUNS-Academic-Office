import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HOME_PATH } from '@/config/routes';
import { EmptyState } from './empty-state';

/**
 * สถานะ “ไม่มีสิทธิ์เข้าถึง” ของหน้า
 * การตัดสินสิทธิ์ทำที่ Server ก่อนเรียกข้อมูลใด ๆ — หน้านี้จึงไม่มีข้อมูลของส่วนที่ถูกปฏิเสธอยู่เลย
 */
export function AccessDenied({ what }: { what?: string }) {
  return (
    <div className="rounded-card bg-surface shadow-card ring-1 ring-border/60">
      <EmptyState
        illustration="access-denied"
        title={what ? `คุณไม่มีสิทธิ์เข้าถึง${what}` : 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้'}
        description="สิทธิ์กำหนดตามบทบาทและหน้าที่ของคุณ หากต้องใช้งานส่วนนี้ กรุณาติดต่อผู้ดูแลระบบของกลุ่มบริหารวิชาการ"
        action={
          <Button asChild>
            <Link href={HOME_PATH}>กลับหน้าแรก</Link>
          </Button>
        }
      />
    </div>
  );
}
