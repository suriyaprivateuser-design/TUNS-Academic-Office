'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  EllipsisVertical,
  ExternalLink,
  EyeOff,
  GripVertical,
  Link2Off,
  Lock,
  Network,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionHeader } from '@/components/shared/page-header';
import { ServiceTile } from '@/components/shared/service-tile';
import { ServiceStatusBadge } from '@/components/shared/status-badge';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { LINK_CHECK_RESULTS } from '@/config/reference';
import { cn } from '@/lib/utils/cn';
import { formatThaiDateShort } from '@/lib/utils/thai-date';
import type { CategoryView, ManagedService } from '@/services/service-hub';
import {
  checkServiceLinkAction,
  patchServiceAction,
  reorderServicesAction,
} from './actions';
import { ServiceFormDialog } from './service-form-dialog';

export interface ManagePermissions {
  create: boolean;
  edit: boolean;
  archive: boolean;
  check: boolean;
}

type ViewFilter = 'active' | 'unconfigured' | 'hidden' | 'review' | 'archived';

/**
 * แถวที่กำลังบันทึก (`saving`) ถูกปิดการแก้ไขชั่วคราวจนกว่าข้อมูลล่าสุดจาก Server จะมาถึง
 * เพราะทุกการแก้ไขส่ง `version` ของแถวไปตรวจการแก้ไขชนกัน — ถ้ากดซ้ำด้วยเลขเวอร์ชันเก่า
 * Server จะปฏิเสธทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
 */
type Row = ManagedService & { saving?: boolean };

type OptimisticChange =
  | { type: 'reorder'; orderedIds: readonly string[] }
  | { type: 'patch'; id: string; patch: Partial<Pick<ManagedService, 'isVisible' | 'isPinned' | 'archived'>> };

function applyChange(state: readonly Row[], change: OptimisticChange): Row[] {
  if (change.type === 'patch') {
    return state.map((service) =>
      service.id === change.id
        ? { ...service, ...change.patch, ...(change.patch.archived ? { isVisible: false } : {}), saving: true }
        : service,
    );
  }
  // การจัดลำดับเปลี่ยนเลขเวอร์ชันของทุกแถวที่ถูกย้าย จึงพักทั้งชุดที่ส่งไป
  const position = new Map(change.orderedIds.map((id, index) => [id, index + 1]));
  return state.map((service) =>
    position.has(service.id)
      ? { ...service, sortOrder: position.get(service.id) ?? service.sortOrder, saving: true }
      : service,
  );
}

const needsReview = (service: ManagedService) =>
  service.lastCheckResult === 'broken' || service.lastCheckResult === 'unreachable';

const FILTERS: { id: ViewFilter; label: string; match: (service: ManagedService) => boolean }[] = [
  { id: 'active', label: 'ทั้งหมด', match: (service) => !service.archived },
  { id: 'unconfigured', label: 'ยังไม่ตั้งค่าลิงก์', match: (service) => !service.archived && !service.configured },
  { id: 'hidden', label: 'ซ่อนอยู่', match: (service) => !service.archived && !service.isVisible },
  { id: 'review', label: 'ลิงก์ควรตรวจสอบ', match: (service) => !service.archived && needsReview(service) },
  { id: 'archived', label: 'จัดเก็บแล้ว', match: (service) => service.archived },
];

/** ลากได้เฉพาะแนวตั้ง — แถวไม่หลุดออกนอกรายการขณะลาก */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export function ManageServices({
  categories,
  services,
  permissions,
}: {
  categories: readonly CategoryView[];
  services: readonly ManagedService[];
  permissions: ManagePermissions;
}) {
  const router = useRouter();
  const [optimistic, applyOptimistic] = useOptimistic<readonly Row[], OptimisticChange>(services, applyChange);
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ViewFilter>('active');
  // nonce เปลี่ยนทุกครั้งที่เปิด เพื่อให้ฟอร์มเริ่มใหม่จากค่าของรายการที่เลือก
  const [dialog, setDialog] = useState<{ service: ManagedService | null; nonce: number; open: boolean }>({
    service: null,
    nonce: 0,
    open: false,
  });
  const openDialog = (service: ManagedService | null) =>
    setDialog((current) => ({ service, nonce: current.nonce + 1, open: true }));
  const [archiveTarget, setArchiveTarget] = useState<ManagedService | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((item) => [item.id, optimistic.filter(item.match).length])),
    [optimistic],
  ) as Record<ViewFilter, number>;

  const keyword = query.trim().toLocaleLowerCase('th');
  const activeFilter = FILTERS.find((item) => item.id === filter) ?? FILTERS[0]!;
  const visible = optimistic.filter(
    (service) =>
      activeFilter.match(service) &&
      (!keyword ||
        [service.nameTh, service.nameEn, service.ownerUnit, service.url, service.internalPath].some((value) =>
          value.toLocaleLowerCase('th').includes(keyword),
        )),
  );
  // จัดลำดับได้เฉพาะตอนเห็นรายการครบทั้งหมวด ไม่อย่างนั้นตำแหน่งที่วางจะไม่ตรงกับลำดับจริง
  const sortable = permissions.edit && filter === 'active' && !keyword;

  const patch = (
    service: ManagedService,
    change: { isVisible?: boolean; isPinned?: boolean; archived?: boolean },
    success: string,
  ) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        applyOptimistic({ type: 'patch', id: service.id, patch: change });
        const result = await patchServiceAction(service.id, change, service.version);
        if (result.ok) toast.success(success);
        else {
          toast.error(result.error.message);
          // มีผู้อื่นแก้ไขรายการนี้ไปก่อน: ดึงข้อมูลล่าสุดมาแสดง เพื่อให้ลองใหม่ได้ทันที
          if (result.error.code === 'CONFLICT') router.refresh();
        }
        resolve(result.ok);
      });
    });

  const reorder = (categoryId: string, shownIds: readonly string[]) => {
    // บริการที่จัดเก็บแล้วไม่แสดงในรายการ จึงต่อท้ายตามลำดับเดิมเพื่อให้ครบทั้งหมวด
    const hiddenIds = optimistic
      .filter((service) => service.categoryId === categoryId && !shownIds.includes(service.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((service) => service.id);
    const orderedIds = [...shownIds, ...hiddenIds];
    startTransition(async () => {
      applyOptimistic({ type: 'reorder', orderedIds });
      const result = await reorderServicesAction(categoryId, orderedIds);
      if (!result.ok) {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  };

  const checkLink = (service: ManagedService) => {
    setCheckingId(service.id);
    startTransition(async () => {
      const result = await checkServiceLinkAction(service.id);
      setCheckingId(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const meta = LINK_CHECK_RESULTS.find((item) => item.id === result.data.result);
      const notify =
        meta?.tone === 'success' ? toast.success : meta?.tone === 'danger' ? toast.error : toast.message;
      notify(`${service.nameTh}: ${meta?.label ?? result.data.result}`, { description: result.data.message });
    });
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    const ok = await patch(archiveTarget, { archived: true }, 'จัดเก็บแล้ว');
    setArchiving(false);
    if (ok) setArchiveTarget(null);
  };

  const groups = categories
    .map((category) => ({
      category,
      items: visible
        .filter((service) => service.categoryId === category.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.items.length > 0 || (filter === 'active' && !keyword));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อระบบ หน่วยงาน หรือ URL"
            aria-label="ค้นหาระบบที่จัดการ"
            className="pl-10"
          />
        </div>
        {permissions.create ? (
          <Button onClick={() => openDialog(null)}>
            <Plus className="size-[1.125rem]" strokeWidth={2} aria-hidden />
            เพิ่มระบบ
          </Button>
        ) : null}
      </div>

      <div role="group" aria-label="กรองรายการ" className="-mt-2 flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const selected = item.id === filter;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(item.id)}
              className={cn(
                'flex h-9 items-center gap-2 rounded-full border px-3.5 text-label transition-colors duration-150',
                selected
                  ? 'border-accent bg-accent-soft font-semibold text-accent'
                  : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              {item.label}
              <span className="text-caption tabular-nums opacity-80">{counts[item.id]}</span>
            </button>
          );
        })}
      </div>

      {permissions.edit && !sortable ? (
        <p className="-mt-2 text-caption text-muted-foreground">
          การจัดลำดับใช้ได้ในมุมมอง “ทั้งหมด” เมื่อไม่ได้ค้นหา
        </p>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-card bg-surface shadow-card ring-1 ring-border/60">
          <EmptyState
            illustration="empty-search"
            title={keyword ? `ไม่พบระบบที่ตรงกับ “${query.trim()}”` : 'ไม่มีรายการในมุมมองนี้'}
            description={
              keyword ? 'ลองใช้คำค้นที่สั้นลง หรือเปลี่ยนตัวกรอง' : 'รายการจะปรากฏที่นี่เมื่อมีระบบที่ตรงกับเงื่อนไข'
            }
            action={
              keyword || filter !== 'active' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setFilter('active');
                  }}
                >
                  ดูทั้งหมด
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        groups.map(({ category, items }) => (
          <CategorySection
            key={category.id}
            category={category}
            items={items}
            sortable={sortable}
            permissions={permissions}
            checkingId={checkingId}
            onReorder={(ids) => reorder(category.id, ids)}
            onEdit={openDialog}
            onToggleVisible={(service, next) =>
              void patch(service, { isVisible: next }, next ? 'แสดงในศูนย์รวมระบบแล้ว' : 'ซ่อนจากศูนย์รวมระบบแล้ว')
            }
            onTogglePinned={(service) =>
              void patch(
                service,
                { isPinned: !service.isPinned },
                service.isPinned ? 'เลิกปักหมุดแล้ว' : 'ปักหมุดเป็นระบบสำคัญแล้ว',
              )
            }
            onCheck={checkLink}
            onArchive={setArchiveTarget}
            onRestore={(service) => void patch(service, { archived: false }, 'กู้คืนแล้ว (ยังซ่อนอยู่จนกว่าจะเปิดแสดง)')}
          />
        ))
      )}

      <ServiceFormDialog
        key={dialog.nonce}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        categories={categories}
        service={dialog.service}
      />

      <ConfirmationDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={`จัดเก็บ “${archiveTarget?.nameTh ?? ''}”`}
        description="ระบบนี้จะหายจากศูนย์รวมระบบของทุกคน สถิติการใช้งานยังอยู่ และกู้คืนได้จากมุมมอง “จัดเก็บแล้ว”"
        confirmLabel="จัดเก็บ"
        tone="danger"
        loading={archiving}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  );
}

interface RowHandlers {
  onEdit: (service: ManagedService) => void;
  onToggleVisible: (service: ManagedService, next: boolean) => void;
  onTogglePinned: (service: ManagedService) => void;
  onCheck: (service: ManagedService) => void;
  onArchive: (service: ManagedService) => void;
  onRestore: (service: ManagedService) => void;
}

function CategorySection({
  category,
  items,
  sortable,
  permissions,
  checkingId,
  onReorder,
  ...handlers
}: {
  category: CategoryView;
  items: readonly Row[];
  sortable: boolean;
  permissions: ManagePermissions;
  checkingId: string | null;
  onReorder: (orderedIds: string[]) => void;
} & RowHandlers) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((service) => service.id);
  const nameOf = (id: string | number) => items.find((service) => service.id === id)?.nameTh ?? '';
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1;

  // คำประกาศสำหรับโปรแกรมอ่านหน้าจอ — ทุกข้อความบอกชื่อและลำดับครบในตัวเอง
  // (ข้อความตอนหยิบถูกแทนด้วยข้อความตำแหน่งแทบจะทันที จึงต้องเข้าใจได้โดยไม่ต้องได้ยินข้อความก่อนหน้า)
  const announcements: Announcements = {
    onDragStart: ({ active }) => `หยิบ ${nameOf(active.id)} แล้ว ลำดับ ${positionOf(active.id)} จาก ${ids.length}`,
    onDragOver: ({ active, over }) =>
      over ? `กำลังย้าย ${nameOf(active.id)}: ลำดับ ${positionOf(over.id)} จาก ${ids.length}` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `วาง ${nameOf(active.id)} ที่ลำดับ ${positionOf(over.id)} จาก ${ids.length} แล้ว`
        : `ยกเลิกการย้าย ${nameOf(active.id)}`,
    onDragCancel: ({ active }) => `ยกเลิกการย้าย ${nameOf(active.id)}`,
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  return (
    <section aria-labelledby={`manage-${category.id}`} className="flex flex-col gap-3">
      <SectionHeader
        title={category.nameTh}
        description={`${items.length} ระบบ`}
        className="[&_h2]:scroll-mt-24"
      />
      <span id={`manage-${category.id}`} className="sr-only">
        {category.nameTh}
      </span>
      {items.length === 0 ? (
        <p className="rounded-card bg-surface px-5 py-6 text-label text-muted-foreground shadow-card ring-1 ring-border/60">
          ยังไม่มีระบบในหมวดนี้
        </p>
      ) : (
        <DndContext
          id={`services-${category.id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'กด Space เพื่อหยิบรายการ ใช้ปุ่มลูกศรขึ้นหรือลงเพื่อย้าย กด Space อีกครั้งเพื่อวาง หรือกด Escape เพื่อยกเลิก',
            },
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!sortable}>
            <ul className="divide-y divide-border/70 rounded-card bg-surface shadow-card ring-1 ring-border/60">
              {items.map((service, index) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  sortable={sortable}
                  permissions={permissions}
                  checking={checkingId === service.id}
                  onMoveUp={index > 0 ? () => move(index, index - 1) : null}
                  onMoveDown={index < items.length - 1 ? () => move(index, index + 1) : null}
                  {...handlers}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function ServiceRow({
  service,
  sortable,
  permissions,
  checking,
  onMoveUp,
  onMoveDown,
  onEdit,
  onToggleVisible,
  onTogglePinned,
  onCheck,
  onArchive,
  onRestore,
}: {
  service: Row;
  sortable: boolean;
  permissions: ManagePermissions;
  checking: boolean;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
} & RowHandlers) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: service.id, disabled: !sortable || service.saving === true });
  const check = LINK_CHECK_RESULTS.find((item) => item.id === service.lastCheckResult);
  const target = service.linkType === 'internal' ? service.internalPath : service.url;
  const canCheck = permissions.check && service.linkType === 'external' && Boolean(service.url);
  const saving = service.saving === true;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
      }}
      aria-busy={saving || undefined}
      className={cn(
        'relative flex flex-wrap items-center gap-x-3 gap-y-2.5 bg-surface px-3 py-3 first:rounded-t-card last:rounded-b-card sm:px-4',
        isDragging && 'z-10 rounded-card shadow-raised ring-1 ring-accent/40',
        service.archived && 'bg-surface-subtle/60',
      )}
    >
      {sortable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={saving}
          aria-label={`จัดลำดับ ${service.nameTh}`}
          className="grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-control text-border-strong transition-colors duration-150 hover:bg-surface-subtle hover:text-muted-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-50"
        >
          <GripVertical className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
        </button>
      ) : null}

      <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        <ServiceTile icon={service.icon} color={service.color} size="sm" className={cn(!service.isVisible && 'opacity-50')} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-body font-medium text-foreground">
            <span className="truncate">{service.nameTh}</span>
            {service.isPinned ? (
              <Tooltip label="ปักหมุดเป็นระบบสำคัญ">
                <Pin tabIndex={0} className="size-4 shrink-0 text-secondary" strokeWidth={1.75} aria-label="ปักหมุด" />
              </Tooltip>
            ) : null}
          </p>
          {target ? (
            <p dir="ltr" className="truncate text-left text-caption text-muted-foreground">
              {target}
            </p>
          ) : (
            <p className="flex items-center gap-1 text-caption text-warning">
              <Link2Off className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
              ยังไม่ได้ตั้งค่าลิงก์
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {service.archived ? (
          <Badge>
            <Archive strokeWidth={2} aria-hidden />
            จัดเก็บแล้ว
          </Badge>
        ) : null}
        {service.status !== 'active' ? <ServiceStatusBadge status={service.status} /> : null}
        {!service.isVisible && !service.archived ? (
          <Badge>
            <EyeOff strokeWidth={2} aria-hidden />
            ซ่อน
          </Badge>
        ) : null}
        {service.audience === 'restricted' ? (
          <Tooltip label="เปิดให้เฉพาะบทบาทที่เลือก">
            <Badge tabIndex={0}>
              <Lock strokeWidth={2} aria-hidden />
              เฉพาะบางบทบาท
            </Badge>
          </Tooltip>
        ) : null}
        {service.isPrivateHost ? (
          <Tooltip label="ปลายทางอยู่ในเครือข่ายภายใน เปิดได้เฉพาะเมื่อเชื่อมต่อเครือข่ายของโรงเรียน และตรวจลิงก์อัตโนมัติไม่ได้">
            <Badge tone="info" tabIndex={0}>
              <Network strokeWidth={2} aria-hidden />
              เครือข่ายภายใน
            </Badge>
          </Tooltip>
        ) : null}
        {check ? (
          <Tooltip
            label={
              service.lastCheckedAt ? `ตรวจล่าสุด ${formatThaiDateShort(service.lastCheckedAt)}` : 'ผลตรวจลิงก์ล่าสุด'
            }
          >
            <Badge tone={check.tone as BadgeTone} tabIndex={0}>
              {check.label}
            </Badge>
          </Tooltip>
        ) : null}
      </div>

      <p className="ml-auto shrink-0 text-caption text-muted-foreground tabular-nums">
        เปิด {service.openCount.toLocaleString('th-TH')} ครั้ง
      </p>

      <div className="flex shrink-0 items-center gap-1">
        {permissions.edit && !service.archived ? (
          <label className="flex cursor-pointer items-center gap-2 pr-1 text-caption text-muted-foreground">
            <span className="hidden sm:inline">แสดง</span>
            <Switch
              checked={service.isVisible}
              disabled={saving}
              onCheckedChange={(next) => onToggleVisible(service, next)}
              aria-label={`แสดง ${service.nameTh} ในศูนย์รวมระบบ`}
            />
          </label>
        ) : null}
        {checking ? (
          <span role="status" className="grid size-9 place-items-center text-accent">
            <RefreshCw className="size-[1.125rem] animate-spin" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">กำลังตรวจลิงก์</span>
          </span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" disabled={saving} aria-label={`ตัวเลือกของ ${service.nameTh}`}>
              <EllipsisVertical className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {permissions.edit && !service.archived ? (
              <DropdownMenuItem onSelect={() => onEdit(service)}>
                <Pencil strokeWidth={1.75} aria-hidden />
                แก้ไข
              </DropdownMenuItem>
            ) : null}
            {permissions.edit && !service.archived ? (
              <DropdownMenuItem onSelect={() => onTogglePinned(service)}>
                {service.isPinned ? <PinOff strokeWidth={1.75} aria-hidden /> : <Pin strokeWidth={1.75} aria-hidden />}
                {service.isPinned ? 'เลิกปักหมุด' : 'ปักหมุดเป็นระบบสำคัญ'}
              </DropdownMenuItem>
            ) : null}
            {canCheck ? (
              <DropdownMenuItem disabled={checking} onSelect={() => onCheck(service)}>
                <RefreshCw strokeWidth={1.75} aria-hidden />
                ตรวจลิงก์
              </DropdownMenuItem>
            ) : null}
            {service.openHref ? (
              <DropdownMenuItem asChild>
                <a
                  href={service.openHref}
                  {...(service.linkType === 'external' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <ExternalLink strokeWidth={1.75} aria-hidden />
                  {service.linkType === 'external' ? 'เปิดลิงก์ในแท็บใหม่' : 'ไปยังหน้านี้'}
                </a>
              </DropdownMenuItem>
            ) : null}
            {sortable && (onMoveUp || onMoveDown) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!onMoveUp} onSelect={() => onMoveUp?.()}>
                  <ArrowUp strokeWidth={1.75} aria-hidden />
                  เลื่อนขึ้น
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!onMoveDown} onSelect={() => onMoveDown?.()}>
                  <ArrowDown strokeWidth={1.75} aria-hidden />
                  เลื่อนลง
                </DropdownMenuItem>
              </>
            ) : null}
            {permissions.archive ? (
              <>
                <DropdownMenuSeparator />
                {service.archived ? (
                  <DropdownMenuItem onSelect={() => onRestore(service)}>
                    <ArchiveRestore strokeWidth={1.75} aria-hidden />
                    กู้คืน
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem tone="danger" onSelect={() => onArchive(service)}>
                    <Archive strokeWidth={1.75} aria-hidden />
                    จัดเก็บ
                  </DropdownMenuItem>
                )}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
