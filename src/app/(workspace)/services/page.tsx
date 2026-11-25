import type { Metadata } from 'next';
import Link from 'next/link';
import { AppIcon } from '@/components/shared/app-icon';
import { Notice } from '@/components/shared/notice';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ServiceDirectory } from '@/features/services/service-directory';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/repositories/db';
import { getDirectory } from '@/services/service-hub';

export const metadata: Metadata = { title: 'ระบบและบริการทั้งหมด' };

const NOTICE: Record<string, string> = {
  'not-configured': 'ระบบที่เลือกยังไม่ได้ตั้งค่าลิงก์หรือปิดให้บริการชั่วคราว กรุณาติดต่อเจ้าหน้าที่สำนักงานวิชาการ',
  'not-found': 'ไม่พบระบบที่เลือก หรือคุณไม่มีสิทธิ์เข้าถึงระบบนั้น',
};

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireUser();
  const [{ categories, services }, params] = await Promise.all([getDirectory(getDb(), user), searchParams]);
  const canManage = user.permissions.can('services.manage', 'view');
  const unconfigured = services.filter((service) => !service.configured).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ศูนย์รวมระบบและบริการวิชาการ"
        description="ระบบงาน เว็บไซต์ และเครื่องมือของกลุ่มบริหารวิชาการทั้งหมด เปิดได้จากหน้านี้"
        actions={
          canManage ? (
            <Button asChild variant="secondary">
              <Link href="/services/manage">
                <AppIcon name="serviceManage" />
                จัดการลิงก์
              </Link>
            </Button>
          ) : null
        }
      />
      {params.notice && NOTICE[params.notice] ? <Notice tone="warning">{NOTICE[params.notice]}</Notice> : null}
      {canManage && unconfigured > 0 ? (
        <Notice
          tone="accent"
          title={`มี ${unconfigured} ระบบที่ยังไม่ได้ตั้งค่าลิงก์`}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/services/manage">ตั้งค่าลิงก์</Link>
            </Button>
          }
        >
          ระบบเหล่านี้แสดงให้ผู้ใช้เห็นว่ามีอยู่ แต่ยังเปิดไม่ได้จนกว่าจะใส่ URL จริงของโรงเรียน
        </Notice>
      ) : null}
      <ServiceDirectory categories={categories} services={services} />
    </div>
  );
}
