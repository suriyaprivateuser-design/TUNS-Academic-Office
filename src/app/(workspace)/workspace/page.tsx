import { ArrowRight, ArrowUpRight, ChevronRight, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { AppIcon } from '@/components/shared/app-icon';
import { EmptyState } from '@/components/shared/empty-state';
import { ReferenceChip } from '@/components/shared/reference-chip';
import { ServiceTile, type ServiceTileColor } from '@/components/shared/service-tile';
import { StatusBadge } from '@/components/shared/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notificationTypeLabel } from '@/config/reference';
import { SYSTEM } from '@/config/school';
import { requireUser, toClientUser } from '@/lib/auth/session';
import { cn } from '@/lib/utils/cn';
import {
  formatThaiDateFull,
  formatThaiDateRange,
  formatThaiDateTime,
  formatThaiDayMonth,
  formatThaiTime,
  formatThaiWeekdayShort,
  greetingFor,
} from '@/lib/utils/thai-date';
import { getDb } from '@/repositories/db';
import { EVENT_TYPE_LABEL, getWorkspaceData } from '@/services/workspace';

export const metadata: Metadata = { title: 'พื้นที่ทำงานของฉัน' };

const RELATION_LABEL = {
  owner: 'กิจกรรมของฉัน',
  subject_teacher: 'นักเรียนในคาบสอนของฉัน',
  advisor: 'นักเรียนในที่ปรึกษา',
  staff: 'ภาพรวมสำนักงาน',
} as const;

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md text-label font-medium text-accent hover:underline"
    >
      {children}
      <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

export default async function WorkspacePage() {
  const user = await requireUser();
  const data = await getWorkspaceData(getDb(), user);
  const profile = toClientUser(user);
  const now = new Date();
  const canCreateLeave = user.permissions.can('classLeave.requests', 'create');
  const { documentCounts: counts } = data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-title font-bold">
            {greetingFor(now)} {user.displayName}
          </h1>
          <p className="mt-0.5 text-body text-muted-foreground">{formatThaiDateFull(now)}</p>
        </div>
        {data.term ? (
          <Badge tone="accent" className="h-7 px-3 text-label">
            {data.term.label}
          </Badge>
        ) : (
          <Badge tone="warning" className="h-7 px-3">
            ยังไม่ได้ตั้งค่าปีการศึกษา
          </Badge>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Welcome Banner */}
        <section
          aria-labelledby="banner-heading"
          className="relative min-w-0 overflow-hidden rounded-card bg-accent-soft xl:col-span-8"
        >
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="p-6 sm:p-8">
              <h2 id="banner-heading" className="max-w-[18ch] text-display font-bold text-foreground">
                {SYSTEM.taglineTh}
              </h2>
              <p className="mt-3 max-w-[44ch] text-body text-muted-foreground">
                ระบบงาน เว็บไซต์ และเอกสารของกลุ่มบริหารวิชาการ รวมไว้ให้เปิดได้จากที่เดียว
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button asChild size="lg">
                  <Link href="/services">
                    <AppIcon name="serviceHub" />
                    เข้าสู่ศูนย์รวมระบบวิชาการ
                  </Link>
                </Button>
                {canCreateLeave ? (
                  <Button asChild size="lg" variant="secondary">
                    <Link href="/class-leave/new">
                      <AppIcon name="classLeave" />
                      สร้างหนังสือขอเวลาเรียน
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <Image
              src="/illustrations/welcome-workspace.svg"
              alt=""
              width={480}
              height={300}
              priority
              unoptimized
              className="hidden h-auto w-[19rem] self-end pr-4 sm:block lg:w-[22rem]"
            />
          </div>
        </section>

        {/* Compact Profile Card */}
        <Card className="min-w-0 xl:col-span-4">
          <CardContent className="flex h-full flex-col justify-between gap-5">
            <div className="flex items-center gap-4">
              <Avatar src={profile.avatarUrl} initials={profile.initials} name={profile.displayName} className="size-14 text-body" />
              <div className="min-w-0">
                <p className="truncate text-subheading font-semibold">{profile.displayName}</p>
                <p className="truncate text-label text-muted-foreground">{profile.position ?? profile.roleNames[0]}</p>
                {profile.departmentName ? (
                  <p className="truncate text-label text-muted-foreground">กลุ่มสาระ{profile.departmentName}</p>
                ) : null}
              </div>
            </div>
            <ul className="flex flex-wrap gap-1.5" aria-label="บทบาทในระบบ">
              {profile.roleNames.map((role) => (
                <li key={role}>
                  <Badge>{role}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-label text-muted-foreground">สถานะเอกสารที่ฉันจัดทำ</p>
            <dl className="-mt-2 grid grid-cols-4 gap-2 border-t border-border/70 pt-4 text-center">
              {(
                [
                  ['รอพิจารณา', counts.pending],
                  ['อนุมัติแล้ว', counts.approved],
                  ['ส่งกลับแก้ไข', counts.returned],
                  ['ฉบับร่าง', counts.draft],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dd className="text-heading font-bold text-foreground tabular-nums">{value}</dd>
                  <dt className="text-caption leading-tight text-muted-foreground">{label}</dt>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* คอลัมน์ซ้าย */}
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
          <section aria-labelledby="services-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 id="services-heading" className="text-heading font-semibold">
                บริการที่ใช้งานบ่อย
              </h2>
              <SectionLink href="/services">ระบบทั้งหมด</SectionLink>
            </div>
            {data.services.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  illustration="setup-required"
                  title="ยังไม่มีระบบที่ตั้งค่าลิงก์แล้ว"
                  description="เมื่อผู้ดูแลเพิ่มลิงก์ของระบบงานวิชาการ ระบบที่ใช้บ่อยจะแสดงที่นี่"
                />
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.services.map((service) => {
                  const external = service.linkType === 'external';
                  return (
                    <li key={service.id}>
                      <a
                        href={`${service.href}?from=workspace`}
                        target={external ? '_blank' : undefined}
                        rel={external ? 'noopener noreferrer' : undefined}
                        className="group flex h-full items-center gap-3.5 rounded-card bg-surface p-4 shadow-card ring-1 ring-border/60 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised"
                      >
                        <ServiceTile icon={service.icon} color={service.color as ServiceTileColor} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label font-semibold text-foreground">{service.nameTh}</span>
                          <span className="block truncate text-caption text-muted-foreground">
                            {(service.nameEn !== service.nameTh ? service.nameEn : null) ??
                              service.ownerUnit ??
                              service.description}
                          </span>
                        </span>
                        {external ? (
                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" strokeWidth={1.75} aria-label="เปิดในแท็บใหม่" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" strokeWidth={1.75} aria-hidden />
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>
                งานที่ต้องทำ
                {data.todo.length > 0 ? (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-caption font-semibold text-white tabular-nums">
                    {data.todo.length}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            {data.todo.length === 0 ? (
              <EmptyState
                compact
                illustration="empty-approvals"
                title="ไม่มีงานค้าง"
                description="เอกสารที่รอคุณพิจารณา ถูกส่งกลับแก้ไข หรือรอรับทราบ จะแสดงที่นี่"
              />
            ) : (
              <ul className="px-2 pt-2 pb-3">
                {data.todo.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3.5 rounded-[0.75rem] px-3 py-3 transition-colors duration-150 hover:bg-surface-subtle sm:px-4"
                    >
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-[0.75rem]',
                          item.kind === 'approval' ? 'bg-accent text-white' : 'bg-accent-soft text-accent',
                        )}
                      >
                        <AppIcon name={item.icon} size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label font-semibold">{item.title}</span>
                        <span className="block truncate text-caption text-muted-foreground">{item.meta}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent" strokeWidth={1.75} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>เอกสารของฉัน</CardTitle>
              {data.documents.length > 0 ? <SectionLink href="/class-leave">ดูทั้งหมด</SectionLink> : null}
            </CardHeader>
            {data.documents.length === 0 ? (
              <EmptyState
                compact
                illustration="empty-documents"
                title="ยังไม่มีเอกสาร"
                description="หนังสือขอเวลาเรียนที่คุณจัดทำจะแสดงที่นี่พร้อมสถานะการอนุมัติ"
                action={
                  canCreateLeave ? (
                    <Button asChild size="sm">
                      <Link href="/class-leave/new">สร้างหนังสือขอเวลาเรียน</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="px-2 pt-2 pb-3">
                {data.documents.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={doc.status === 'draft' ? `/class-leave/${doc.id}/edit` : `/class-leave/${doc.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[0.75rem] px-3 py-3 transition-colors duration-150 hover:bg-surface-subtle sm:px-4"
                    >
                      <span className="min-w-0 flex-1 basis-56">
                        <span className="block truncate text-label font-semibold">{doc.activityName}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                          <ReferenceChip value={doc.referenceNo} />
                          {doc.startDate ? <span>{formatThaiDateRange(doc.startDate, doc.endDate)}</span> : null}
                          <span>นักเรียน {doc.studentCount} คน</span>
                        </span>
                      </span>
                      <StatusBadge status={doc.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* คอลัมน์ขวา */}
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>กิจกรรมนักเรียนวันนี้</CardTitle>
            </CardHeader>
            {data.today.length === 0 ? (
              <EmptyState
                compact
                title="วันนี้ไม่มีนักเรียนขอเวลาเรียน"
                description="เฉพาะกิจกรรมที่อนุมัติแล้วและเกี่ยวข้องกับคุณ"
              />
            ) : (
              <ul className="flex flex-col gap-1 px-2 pt-2 pb-3">
                {data.today.map((activity) => (
                  <li key={activity.requestId}>
                    <Link
                      href={`/class-leave/${activity.requestId}`}
                      className="block rounded-[0.75rem] px-3 py-3 transition-colors duration-150 hover:bg-surface-subtle sm:px-4"
                    >
                      <span className="block text-label font-semibold">{activity.activityName}</span>
                      <span className="mt-1 block text-caption text-muted-foreground">
                        คาบ {activity.periodNos.join(', ')} · นักเรียน {activity.studentCount} คน
                        {activity.classroomNames.length ? ` · ${activity.classroomNames.join(', ')}` : ''}
                      </span>
                      <span className="mt-1.5 block">
                        <Badge tone={activity.relation === 'owner' ? 'accent' : 'neutral'}>{RELATION_LABEL[activity.relation]}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ปฏิทินวิชาการ</CardTitle>
            </CardHeader>
            {data.agenda.length === 0 ? (
              <EmptyState compact illustration="empty-calendar" title="ยังไม่มีกิจกรรมที่กำลังจะมาถึง" />
            ) : (
              <ol className="flex flex-col px-5 pt-3 pb-5 sm:px-6">
                {data.agenda.map((event, index) => {
                  const body = (
                    <>
                      <span className="block text-label font-semibold">{event.title}</span>
                      <span className="block text-caption text-muted-foreground">
                        {EVENT_TYPE_LABEL[event.eventType] ?? event.eventType}
                        {event.allDay ? '' : ` · ${formatThaiTime(event.startAt)}`}
                      </span>
                      {event.location ? (
                        <span className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                          {event.location}
                        </span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="grid size-12 shrink-0 place-items-center rounded-[0.75rem] bg-accent-soft text-center leading-none">
                          <span className="text-caption text-accent">{formatThaiWeekdayShort(event.startAt)}</span>
                          <span className="-mt-2 text-label font-bold text-accent tabular-nums">{formatThaiDayMonth(event.startAt)}</span>
                        </span>
                        {index < data.agenda.length - 1 ? <span className="thread-y my-1 flex-1" aria-hidden /> : null}
                      </div>
                      <div className={cn('min-w-0 flex-1', index < data.agenda.length - 1 ? 'pb-4' : '')}>
                        {event.href ? (
                          <Link href={event.href} className="block rounded-md hover:text-accent">
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>การแจ้งเตือนล่าสุด</CardTitle>
              {data.notifications.length > 0 ? <SectionLink href="/notifications">ทั้งหมด</SectionLink> : null}
            </CardHeader>
            {data.notifications.length === 0 ? (
              <EmptyState compact illustration="empty-notifications" title="ยังไม่มีการแจ้งเตือน" />
            ) : (
              <ul className="px-2 pt-2 pb-3">
                {data.notifications.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.linkPath ?? '/notifications'}
                      className="flex gap-2.5 rounded-[0.75rem] px-3 py-2.5 transition-colors duration-150 hover:bg-surface-subtle sm:px-4"
                    >
                      <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', item.isRead ? 'bg-border' : 'bg-accent')} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-label', item.isRead ? 'text-muted-foreground' : 'font-semibold')}>{item.title}</span>
                        <span className="block text-caption text-muted-foreground">
                          {notificationTypeLabel(item.type)} · {formatThaiDateTime(item.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
