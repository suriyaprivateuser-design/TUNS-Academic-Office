/**
 * Global Search (ข้อ 29)
 *
 * ผลการค้นหาทุกประเภทผ่านบริการของ Module นั้น ซึ่งกรองสิทธิ์แล้ว
 * จึงไม่มีข้อมูลที่ผู้ใช้ไม่มีสิทธิ์เห็นหลุดออกไปยัง browser
 */
import 'server-only';
import type { IconKey } from '@/config/icons';
import { DOCUMENT_STATUS_META } from '@/config/reference';
import type { DriveAdapter } from '@/lib/drive/types';
import type { Db } from '@/repositories/db';
import { listApprovals } from './approvals';
import { classLeaveAdapter, listRequests } from './class-leave';
import type { CurrentUser } from './identity';
import { getExplorer } from './library';
import { getDirectory } from './service-hub';

export type SearchGroupId = 'services' | 'class_leave' | 'approvals' | 'library';

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  icon: IconKey;
  /** เปิดในแท็บใหม่ (ลิงก์ไปเว็บไซต์ภายนอก) */
  external: boolean;
}

export interface SearchGroup {
  id: SearchGroupId;
  label: string;
  results: SearchResult[];
}

const PER_GROUP = 5;

function matcher(query: string): (...fields: (string | null | undefined)[]) => boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (...fields) => {
    const haystack = fields.filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  };
}

export async function globalSearch(
  db: Db,
  drive: DriveAdapter,
  user: CurrentUser,
  rawQuery: string,
): Promise<SearchGroup[]> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return [];
  const matches = matcher(query);
  const can = user.permissions;
  const groups: SearchGroup[] = [];

  if (can.can('services.directory', 'view')) {
    const { services } = await getDirectory(db, user);
    const results = services
      .filter((service) => service.href && matches(service.nameTh, service.nameEn, service.description, service.ownerUnit))
      .slice(0, PER_GROUP)
      .map<SearchResult>((service) => ({
        id: service.id,
        title: service.nameTh,
        subtitle: service.nameEn ?? service.ownerUnit,
        href: `${service.href}?from=search`,
        icon: service.icon as IconKey,
        external: service.linkType === 'external',
      }));
    if (results.length) groups.push({ id: 'services', label: 'ระบบและบริการ', results });
  }

  if (can.can('classLeave.requests', 'view')) {
    const results = (await listRequests(db, user))
      .filter((request) => matches(request.referenceNo, request.activityName, request.ownerName))
      .slice(0, PER_GROUP)
      .map<SearchResult>((request) => ({
        id: request.id,
        title: request.activityName,
        subtitle: `${request.referenceNo} · ${DOCUMENT_STATUS_META[request.status].label}`,
        href: `/class-leave/${request.id}`,
        icon: 'classLeave',
        external: false,
      }));
    if (results.length) groups.push({ id: 'class_leave', label: 'หนังสือขอเวลาเรียน', results });
  }

  if (can.can('documents.approvals', 'view') || can.can('classLeave.approvals', 'view')) {
    const results = (await listApprovals(db, user, [classLeaveAdapter], 'all'))
      .filter((item) => matches(item.refNo, item.title, item.requesterName))
      .slice(0, PER_GROUP)
      .map<SearchResult>((item) => ({
        id: item.id,
        title: item.title,
        subtitle: `${item.refNo} · เสนอโดย ${item.requesterName}`,
        href: `/documents/approvals/${item.id}`,
        icon: 'approval',
        external: false,
      }));
    if (results.length) groups.push({ id: 'approvals', label: 'เอกสารเสนออนุมัติ', results });
  }

  if (can.can('knowledge.library', 'view')) {
    const { files } = await getExplorer(db, user, drive);
    const results = files
      .filter((file) => matches(file.title, file.originalFilename, file.storedFilename, file.categoryName))
      .slice(0, PER_GROUP)
      .map<SearchResult>((file) => ({
        id: file.id,
        title: file.title,
        subtitle: [file.categoryName, file.storedFilename].filter(Boolean).join(' · '),
        href: `/library?file=${file.id}`,
        icon: 'library',
        external: false,
      }));
    if (results.length) groups.push({ id: 'library', label: 'ไฟล์เอกสาร', results });
  }

  return groups;
}
