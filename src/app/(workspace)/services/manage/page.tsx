import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/shared/access-denied';
import { AppIcon } from '@/components/shared/app-icon';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ManageServices } from '@/features/services/manage-services';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/repositories/db';
import { listManagedServices } from '@/services/service-hub';

export const metadata: Metadata = { title: 'จัดการลิงก์' };

export default async function ManageServicesPage() {
  const user = await requireUser();
  const can = (action: 'view' | 'create' | 'edit' | 'archive' | 'manage') =>
    user.permissions.can('services.manage', action);
  if (!can('view')) return <AccessDenied what="หน้าจัดการลิงก์" />;
  const { categories, services } = await listManagedServices(getDb(), user);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="จัดการลิงก์"
        description="เพิ่ม แก้ไข จัดลำดับ และกำหนดผู้ที่มองเห็นแต่ละระบบ ทุกการแก้ไขมีบันทึกย้อนหลัง"
        actions={
          <Button asChild variant="secondary">
            <Link href="/services">
              <AppIcon name="serviceHub" />
              ดูหน้าที่ผู้ใช้เห็น
            </Link>
          </Button>
        }
      />
      <ManageServices
        categories={categories}
        services={services}
        permissions={{ create: can('create'), edit: can('edit'), archive: can('archive'), check: can('manage') }}
      />
    </div>
  );
}
