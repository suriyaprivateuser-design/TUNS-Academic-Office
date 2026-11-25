'use client';

import { ArrowUpRight, Link2Off, Pin, Search, Star } from 'lucide-react';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { ServiceTile, type ServiceTileColor } from '@/components/shared/service-tile';
import { ServiceStatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import type { CategoryView, ServiceView } from '@/services/service-hub';
import { toggleFavoriteAction } from './actions';

type Filter = 'all' | 'favorites' | string;

function ServiceCard({
  service,
  onToggleFavorite,
}: {
  service: ServiceView;
  onToggleFavorite: (service: ServiceView) => void;
}) {
  const external = service.linkType === 'external';
  const subtitle = service.nameEn && service.nameEn !== service.nameTh ? service.nameEn : null;
  return (
    <article className="group flex h-full flex-col rounded-card bg-surface p-5 shadow-card ring-1 ring-border/60 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <ServiceTile icon={service.icon} color={service.color as ServiceTileColor} />
        <div className="flex items-center gap-0.5">
          {service.isPinned ? (
            <Tooltip label="ระบบสำคัญที่ผู้ดูแลปักหมุดไว้">
              <span tabIndex={0} className="grid size-9 place-items-center rounded-control text-secondary">
                <Pin className="size-[1.125rem]" strokeWidth={1.75} aria-label="ระบบสำคัญ" />
              </span>
            </Tooltip>
          ) : null}
          <Tooltip label={service.isFavorite ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}>
            <button
              type="button"
              aria-pressed={service.isFavorite}
              aria-label={`${service.isFavorite ? 'นำออกจาก' : 'เพิ่มใน'}รายการโปรด: ${service.nameTh}`}
              onClick={() => onToggleFavorite(service)}
              className={cn(
                'grid size-9 place-items-center rounded-control transition-[color,background-color,transform] duration-150 ease-out hover:bg-accent-soft active:scale-90',
                service.isFavorite ? 'text-accent' : 'text-muted-foreground hover:text-accent',
              )}
            >
              <Star
                className="size-[1.125rem]"
                strokeWidth={1.75}
                fill={service.isFavorite ? 'currentColor' : 'none'}
                aria-hidden
              />
            </button>
          </Tooltip>
        </div>
      </div>

      <h3 className="mt-4 text-subheading font-semibold text-foreground">{service.nameTh}</h3>
      {subtitle ? <p className="text-caption text-muted-foreground">{subtitle}</p> : null}
      {service.description ? (
        <p className="mt-2 line-clamp-2 text-label text-muted-foreground">{service.description}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-5">
        <div className="min-w-0">
          {service.ownerUnit ? (
            <p className="truncate text-caption text-muted-foreground">{service.ownerUnit}</p>
          ) : null}
          {service.status !== 'active' ? <ServiceStatusBadge status={service.status} /> : null}
        </div>
        {service.href ? (
          <Button asChild size="sm" variant={external ? 'secondary' : 'soft'}>
            <a
              href={`${service.href}?from=hub`}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
            >
              เข้าสู่ระบบ
              {external ? (
                <>
                  <ArrowUpRight className="size-4" strokeWidth={1.75} aria-hidden />
                  <span className="sr-only">(เปิดในแท็บใหม่)</span>
                </>
              ) : null}
            </a>
          </Button>
        ) : service.configured ? null : (
          <Badge>
            <Link2Off strokeWidth={2} aria-hidden />
            ยังไม่ได้ตั้งค่าลิงก์
          </Badge>
        )}
      </div>
    </article>
  );
}

export function ServiceDirectory({
  categories,
  services,
}: {
  categories: readonly CategoryView[];
  services: readonly ServiceView[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    services,
    (state: readonly ServiceView[], change: { id: string; favorite: boolean }) =>
      state.map((service) => (service.id === change.id ? { ...service, isFavorite: change.favorite } : service)),
  );

  const toggleFavorite = (service: ServiceView) => {
    const favorite = !service.isFavorite;
    startTransition(async () => {
      setOptimistic({ id: service.id, favorite });
      const result = await toggleFavoriteAction(service.id, favorite);
      if (!result.ok) toast.error(result.error.message);
    });
  };

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      optimistic.filter(
        (service) =>
          (filter === 'all' || (filter === 'favorites' ? service.isFavorite : service.categoryId === filter)) &&
          (!needle ||
            [service.nameTh, service.nameEn, service.description, service.ownerUnit]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle)),
      ),
    [optimistic, filter, needle],
  );
  const favoriteCount = optimistic.filter((service) => service.isFavorite).length;
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'ทั้งหมด', count: optimistic.length },
    { id: 'favorites', label: 'รายการโปรด', count: favoriteCount },
    ...categories.map((category) => ({
      id: category.id,
      label: category.nameTh,
      count: optimistic.filter((service) => service.categoryId === category.id).length,
    })),
  ];
  const grouped = categories
    .map((category) => ({ category, items: visible.filter((service) => service.categoryId === category.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อระบบหรือหน่วยงาน"
            aria-label="ค้นหาระบบและบริการ"
            className="pl-10"
          />
        </div>
        {/* มือถือ: เลื่อนแนวนอนในแถวเดียว · จอกว้างขึ้น: ขึ้นบรรทัดใหม่ ไม่มีตัวเลือกถูกตัด */}
        <div
          role="group"
          aria-label="กรองตามหมวดหมู่"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 sm:flex-wrap sm:overflow-visible"
        >
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-label transition-colors duration-150',
                filter === item.id
                  ? 'bg-accent font-semibold text-white'
                  : 'bg-surface text-muted-foreground ring-1 ring-border hover:text-foreground',
              )}
            >
              {item.label}
              <span className="tabular-nums opacity-80">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        พบ {visible.length} รายการ
      </p>

      {visible.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card ring-1 ring-border/60">
          <EmptyState
            illustration={filter === 'favorites' && !needle ? 'empty-documents' : 'empty-search'}
            title={filter === 'favorites' && !needle ? 'ยังไม่มีรายการโปรด' : 'ไม่พบระบบที่ค้นหา'}
            description={
              filter === 'favorites' && !needle
                ? 'กดรูปดาวบนการ์ดของระบบที่ใช้บ่อย เพื่อเก็บไว้เปิดได้เร็วขึ้น'
                : 'ลองใช้คำค้นที่สั้นลง หรือเลือกหมวดหมู่ “ทั้งหมด”'
            }
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                แสดงทั้งหมด
              </Button>
            }
          />
        </div>
      ) : (
        grouped.map(({ category, items }) => (
          <section key={category.id} aria-labelledby={`category-${category.id}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
              <h2 id={`category-${category.id}`} className="text-heading font-semibold">
                {category.nameTh}
              </h2>
              {category.description ? (
                <p className="text-label text-muted-foreground">{category.description}</p>
              ) : null}
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((service) => (
                <li key={service.id}>
                  <ServiceCard service={service} onToggleFavorite={toggleFavorite} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
