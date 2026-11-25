import { ArrowUpRight, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { ServiceTile, type ServiceTileColor } from '@/components/shared/service-tile';
import { ServiceStatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import type { ServiceView } from '@/services/service-hub';

/**
 * รายการบริการแบบกะทัดรัด (รายการโปรด / ใช้ล่าสุด / ใช้บ่อย)
 * บริการที่เปิดไม่ได้แสดงเหตุผลแทนลิงก์ — ไม่มีแถวที่กดแล้วไม่เกิดอะไรขึ้น
 */
export function ServiceQuickList({
  services,
  label,
  trailing,
}: {
  services: readonly ServiceView[];
  label: string;
  /** ปุ่มเสริมท้ายแถว เช่น นำออกจากรายการโปรด */
  trailing?: (service: ServiceView) => ReactNode;
}) {
  return (
    <ul aria-label={label} className="px-2 pt-2 pb-3">
      {services.map((service) => {
        const external = service.linkType === 'external';
        const body = (
          <>
            <ServiceTile icon={service.icon} color={service.color as ServiceTileColor} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label font-semibold text-foreground">{service.nameTh}</span>
              <span className="block truncate text-caption text-muted-foreground">
                {service.ownerUnit ?? (service.nameEn !== service.nameTh ? service.nameEn : null) ?? service.description}
              </span>
            </span>
          </>
        );
        return (
          <li key={service.id} className="flex items-center gap-1">
            {service.href ? (
              <a
                href={`${service.href}?from=hub`}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-[0.75rem] px-3 py-2.5 transition-colors duration-150 hover:bg-surface-subtle"
              >
                {body}
                {external ? (
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
                    strokeWidth={1.75}
                    aria-label="เปิดในแท็บใหม่"
                  />
                ) : (
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
              </a>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
                {body}
                {service.configured ? <ServiceStatusBadge status={service.status} /> : <Badge>ยังไม่ได้ตั้งค่าลิงก์</Badge>}
              </div>
            )}
            {trailing?.(service)}
          </li>
        );
      })}
    </ul>
  );
}
