/**
 * Icon Mapping กลางของทั้งระบบ (ข้อ 07.1)
 *
 * ใช้ Lucide Icons ชุดเดียว (แพ็กเกจ `lucide-react`, สัญญาอนุญาต ISC)
 * ชื่อ export ทุกตัวตรวจกับเวอร์ชันที่ติดตั้งจริงแล้ว และมี unit test กำกับ (tests/unit/config.test.ts)
 * ห้าม import ไอคอนจาก lucide-react ตรง ๆ สำหรับ "ความหมายของระบบ" ที่มีอยู่ในตารางนี้
 */
import {
  ArrowUpRight,
  Award,
  Bell,
  BellRing,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  CloudUpload,
  ContactRound,
  FileCheck,
  FilePen,
  Files,
  FolderOpen,
  GraduationCap,
  Grid2X2,
  Handshake,
  HardDrive,
  House,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListTodo,
  Megaphone,
  Network,
  NotebookPen,
  ScrollText,
  Search,
  Send,
  Settings,
  SquareKanban,
  Star,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  home: House,
  dashboard: LayoutDashboard,
  serviceHub: Grid2X2,
  serviceManage: Link2,
  documents: Files,
  incoming: Inbox,
  outgoing: Send,
  approval: FileCheck,
  memo: FilePen,
  order: ScrollText,
  certificate: Award,
  classLeave: CalendarClock,
  classLeaveNotice: BellRing,
  tasks: ListTodo,
  taskBoard: SquareKanban,
  taskTracking: ListChecks,
  calendar: CalendarDays,
  meeting: Users,
  meetingAttendance: UserCheck,
  meetingMinutes: NotebookPen,
  organization: Network,
  personnel: ContactRound,
  coordination: Handshake,
  library: FolderOpen,
  announcement: Megaphone,
  survey: ClipboardList,
  report: ChartNoAxesCombined,
  achievement: Trophy,
  academic: GraduationCap,
  assessment: ClipboardCheck,
  drive: HardDrive,
  upload: CloudUpload,
  notification: Bell,
  search: Search,
  settings: Settings,
  favorite: Star,
  external: ArrowUpRight,
} as const satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;

export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

/** ค่ามาตรฐานของขนาดและเส้นไอคอน (ข้อ 07.1) */
export const ICON_SIZE = {
  menu: 18,
  action: 18,
  serviceCard: 24,
  emptyState: 44,
} as const;

export const ICON_STROKE_WIDTH = 1.75;

export function isIconKey(value: string): value is IconKey {
  return Object.prototype.hasOwnProperty.call(ICONS, value);
}
