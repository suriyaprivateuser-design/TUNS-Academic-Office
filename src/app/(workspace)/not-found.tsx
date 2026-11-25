import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { HOME_PATH } from '@/config/routes';

export default function WorkspaceNotFound() {
  return (
    <div className="rounded-card bg-surface shadow-card ring-1 ring-border/60">
      <EmptyState
        illustration="empty-search"
        title="ไม่พบรายการที่ต้องการ"
        description="รายการนี้อาจถูกย้าย ถูกจัดเก็บ หรือคุณไม่มีสิทธิ์เข้าถึง"
        action={
          <Button asChild>
            <Link href={HOME_PATH}>กลับหน้าแรก</Link>
          </Button>
        }
      />
    </div>
  );
}
