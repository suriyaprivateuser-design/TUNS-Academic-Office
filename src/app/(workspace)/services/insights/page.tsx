import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/shared/access-denied';
import { AppIcon } from '@/components/shared/app-icon';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader, SectionHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RemoveFavoriteButton } from '@/features/services/remove-favorite-button';
import { ServiceQuickList } from '@/features/services/service-quick-list';
import { MonthlyOpensChart, type MonthlyPoint } from '@/features/services/usage-chart';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/repositories/db';
import { getPersonalHub, getUsageStats } from '@/services/service-hub';

export const metadata: Metadata = { title: 'รายการโปรดและสถิติการใช้งาน' };

const count = (value: number) => value.toLocaleString('th-TH');

const monthShort = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function toPoint(entry: { month: string; opens: number }): MonthlyPoint {
  const date = new Date(`${entry.month}-01T00:00:00Z`);
  return { ...entry, label: monthShort.format(date), fullLabel: monthLong.format(date) };
}

export default async function ServiceInsightsPage() {
  const user = await requireUser();
  if (!user.permissions.can('services.insights', 'view')) {
    return <AccessDenied what="หน้ารายการโปรดและสถิติการใช้งาน" />;
  }
  const db = getDb();
  const seesOrganization = user.permissions.canAll('services.insights', 'view');
  const canEditFavorites = user.permissions.can('services.insights', 'edit');
  const canManage = user.permissions.can('services.manage', 'view');
  const [hub, stats] = await Promise.all([
    getPersonalHub(db, user, 6),
    seesOrganization ? getUsageStats(db, user) : null,
  ]);
  const monthly = stats?.monthly.map(toPoint) ?? [];
  const peak = Math.max(1, ...(stats?.topServices.map((service) => service.opens) ?? []));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="รายการโปรดและสถิติการใช้งาน"
        description="ระบบที่คุณติดดาว เปิดล่าสุด และเปิดบ่อย"
        actions={
          <Button asChild variant="secondary">
            <Link href="/services">
              <AppIcon name="serviceHub" />
              ระบบและบริการทั้งหมด
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>รายการโปรด</CardTitle>
          </CardHeader>
          {hub.favorites.length === 0 ? (
            <EmptyState
              compact
              title="ยังไม่มีรายการโปรด"
              description="กดรูปดาวที่ระบบในหน้า “ระบบและบริการทั้งหมด” เพื่อเก็บไว้ที่นี่"
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/services">เลือกระบบ</Link>
                </Button>
              }
            />
          ) : (
            <ServiceQuickList
              label="รายการโปรด"
              services={hub.favorites}
              trailing={
                canEditFavorites
                  ? (service) => <RemoveFavoriteButton serviceId={service.id} name={service.nameTh} />
                  : undefined
              }
            />
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>ใช้ล่าสุด</CardTitle>
          </CardHeader>
          {hub.recent.length === 0 ? (
            <EmptyState compact title="ยังไม่มีประวัติการเปิดระบบ" description="ระบบที่คุณเปิดผ่านหน้านี้จะแสดงเรียงจากล่าสุด" />
          ) : (
            <ServiceQuickList label="ใช้ล่าสุด" services={hub.recent} />
          )}
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>ใช้บ่อย</CardTitle>
          </CardHeader>
          {hub.frequent.length === 0 ? (
            <EmptyState compact title="ยังไม่มีข้อมูลการใช้งาน" description="ระบบที่คุณเปิดบ่อยที่สุดจะแสดงที่นี่" />
          ) : (
            <ServiceQuickList label="ใช้บ่อย" services={hub.frequent} />
          )}
        </Card>
      </div>

      {stats ? (
        <section aria-labelledby="org-stats" className="flex flex-col gap-4">
          <SectionHeader
            title="สถิติของทั้งหน่วยงาน"
            description="นับจำนวนครั้งที่บุคลากรเปิดลิงก์ผ่านระบบนี้ ไม่ใช่จำนวนผู้ใช้ของเว็บไซต์ปลายทาง"
            action={
              canManage ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/services/manage">
                    <AppIcon name="serviceManage" />
                    จัดการลิงก์
                  </Link>
                </Button>
              ) : null
            }
          />
          <span id="org-stats" className="sr-only">
            สถิติของทั้งหน่วยงาน
          </span>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {(
              [
                ['ระบบทั้งหมด', stats.total, 'ไม่รวมที่จัดเก็บแล้ว'],
                ['พร้อมใช้งาน', stats.active, 'ตั้งค่าลิงก์แล้วและเปิดให้บริการ'],
                ['ยังไม่ตั้งค่าลิงก์', stats.notConfigured, 'รอผู้ดูแลใส่ URL จริง'],
                ['ลิงก์ควรตรวจสอบ', stats.needsReview, 'ผลตรวจล่าสุด: เสียหรือติดต่อไม่ได้'],
                ['เปิดลิงก์ทั้งหมด', stats.totalOpens, 'ครั้ง ตั้งแต่เริ่มใช้ระบบ'],
              ] as const
            ).map(([label, value, hint]) => (
              <div key={label} className="rounded-card bg-surface p-4 shadow-card ring-1 ring-border/60 sm:p-5">
                <dt className="text-label text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-title font-bold text-foreground">{count(value)}</dd>
                <dd className="mt-0.5 text-caption text-muted-foreground">{hint}</dd>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <Card className="min-w-0 xl:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>จำนวนครั้งที่เปิดลิงก์รายเดือน</CardTitle>
                  <CardDescription>ย้อนหลังไม่เกิน 12 เดือน ตามเวลาประเทศไทย</CardDescription>
                </div>
              </CardHeader>
              {monthly.length >= 2 ? (
                <CardContent>
                  <MonthlyOpensChart data={monthly} />
                </CardContent>
              ) : (
                <EmptyState
                  compact
                  title={
                    monthly.length === 1
                      ? `${monthly[0]?.fullLabel}: ${count(monthly[0]?.opens ?? 0)} ครั้ง`
                      : 'ยังไม่มีการเปิดลิงก์ผ่านระบบ'
                  }
                  description="กราฟรายเดือนจะแสดงเมื่อมีข้อมูลตั้งแต่ 2 เดือนขึ้นไป"
                />
              )}
            </Card>

            <Card className="min-w-0 xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>ระบบที่ถูกเปิดมากที่สุด</CardTitle>
                  <CardDescription>จำนวนครั้งที่เปิดลิงก์ ตั้งแต่เริ่มใช้ระบบ</CardDescription>
                </div>
              </CardHeader>
              {stats.topServices.length === 0 ? (
                <EmptyState compact title="ยังไม่มีการเปิดลิงก์ผ่านระบบ" />
              ) : (
                <CardContent>
                  <ol className="flex flex-col gap-3.5">
                    {stats.topServices.map((service) => (
                      <li key={service.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
                        <span className="truncate text-label text-foreground">{service.name}</span>
                        <span className="text-label font-semibold text-foreground tabular-nums">{count(service.opens)}</span>
                        <span aria-hidden className="col-span-2 block h-2">
                          <span
                            className="block h-full min-w-1 rounded-r-[4px] bg-chart-1"
                            style={{ width: `${(service.opens / peak) * 100}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              )}
            </Card>
          </div>
        </section>
      ) : null}
    </div>
  );
}
