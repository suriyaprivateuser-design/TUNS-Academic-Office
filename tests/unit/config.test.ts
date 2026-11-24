import { describe, expect, it } from 'vitest';
import { ICONS, ICON_KEYS } from '@/config/icons';
import {
  MODULES,
  RESOURCE_KEYS,
  SUBSYSTEMS,
  subsystemsOf,
  type SubsystemDef,
} from '@/config/modules';
import {
  ACTIONS,
  DEFAULT_PERMISSION_MATRIX,
  flattenMatrix,
  type Action,
} from '@/config/permissions';
import { ROLE_IDS, ROLES } from '@/config/roles';
import { LEARNING_AREAS, SYSTEM } from '@/config/school';

describe('project identity', () => {
  it('uses the exact school and system names from the specification', () => {
    expect(SYSTEM.nameEn).toBe('TUNS Academic Office');
    expect(SYSTEM.nameTh).toBe('ระบบสำนักงานวิชาการดิจิทัล');
    expect(SYSTEM.schoolNameTh).toBe('โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า สมุทรปราการ');
    expect(SYSTEM.taglineTh).toBe('ทุกงานวิชาการ เชื่อมถึงกันในที่เดียว');
    expect(SYSTEM.taglineEn).toBe('One Workspace. Connected Academic Operations.');
    expect(SYSTEM.driveRootFolderName).toBe(
      'TUNS Academic Office - โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า สมุทรปราการ',
    );
  });

  it('lists the 8 learning areas', () => {
    expect(LEARNING_AREAS.map((a) => a.nameTh)).toEqual([
      'ภาษาไทย',
      'คณิตศาสตร์',
      'วิทยาศาสตร์และเทคโนโลยี',
      'สังคมศึกษา ศาสนา และวัฒนธรรม',
      'สุขศึกษาและพลศึกษา',
      'ศิลปะ',
      'การงานอาชีพ',
      'ภาษาต่างประเทศ',
    ]);
  });
});

describe('module registry', () => {
  // ใช้ชนิดกว้าง เพราะสถานะใน registry เปลี่ยนตามความคืบหน้าจริง
  const subsystems: readonly SubsystemDef[] = SUBSYSTEMS;

  it('has 9 modules and 34 subsystems', () => {
    expect(MODULES).toHaveLength(9);
    expect(SUBSYSTEMS).toHaveLength(34);
  });

  it('matches the subsystem count of every module in the scope table', () => {
    const expected: Record<string, number> = {
      '01': 3,
      '02': 7,
      '03': 5,
      '04': 4,
      '05': 4,
      '06': 3,
      '07': 3,
      '08': 2,
      '09': 3,
    };
    for (const [moduleId, count] of Object.entries(expected)) {
      expect(subsystemsOf(moduleId), `module ${moduleId}`).toHaveLength(count);
    }
  });

  it('has unique ids, resource keys and paths', () => {
    expect(new Set(SUBSYSTEMS.map((s) => s.id)).size).toBe(34);
    expect(new Set(SUBSYSTEMS.map((s) => s.key)).size).toBe(34);
    expect(new Set(SUBSYSTEMS.map((s) => s.path)).size).toBe(34);
  });

  it('places the Service Hub right after the dashboard module in the sidebar', () => {
    const order = [...MODULES].sort((a, b) => a.navOrder - b.navOrder).map((m) => m.id);
    expect(order).toEqual(['01', '09', '02', '03', '04', '05', '06', '07', '08']);
  });

  it('never marks a subsystem production ready without UAT', () => {
    expect(subsystems.filter((s) => s.status === 'production_ready')).toEqual([]);
  });

  it('only releases subsystems that are at least implemented', () => {
    for (const subsystem of subsystems) {
      if (subsystem.released) {
        expect(
          ['implemented', 'tested', 'ready_for_uat', 'production_ready'],
          `${subsystem.id} is released`,
        ).toContain(subsystem.status);
      }
    }
  });
});

describe('icon mapping', () => {
  it('resolves every icon key to an installed lucide-react export', () => {
    for (const iconKey of ICON_KEYS) {
      expect(ICONS[iconKey], `icon "${iconKey}"`).toBeDefined();
    }
  });

  it('gives every module and subsystem a registered icon', () => {
    for (const item of [...MODULES, ...SUBSYSTEMS]) {
      expect(ICON_KEYS, `icon of ${item.id}`).toContain(item.icon);
    }
  });
});

describe('default permission matrix', () => {
  const entries = flattenMatrix(DEFAULT_PERMISSION_MATRIX);
  const actionsOf = (roleId: string) =>
    new Set(entries.filter((e) => e.roleId === roleId).map((e) => e.action));

  it('defines 9 roles', () => {
    expect(ROLE_IDS).toHaveLength(9);
    expect(ROLES.map((r) => r.id)).toEqual([...ROLE_IDS]);
  });

  it('only references known resources and actions', () => {
    for (const entry of entries) {
      expect(RESOURCE_KEYS).toContain(entry.resource);
      expect(ACTIONS).toContain(entry.action);
    }
  });

  it('gives Super Admin no document decision or submission rights by default', () => {
    const forbiddenActions: Action[] = ['approve', 'reject', 'return', 'submit'];
    const adminDecisions = entries.filter(
      (e) =>
        e.roleId === 'super_admin' &&
        forbiddenActions.includes(e.action) &&
        // การ "ส่ง" งานส่วนตัว (ส่งงาน/ตอบแบบสำรวจ) เป็นสิทธิ์พื้นฐานของบุคลากรทุกคน
        !(e.action === 'submit' && e.scope === 'own'),
    );
    expect(adminDecisions).toEqual([]);
  });

  it('lets Super Admin manage the Admin Console', () => {
    expect(DEFAULT_PERMISSION_MATRIX.super_admin['intelligence.admin']?.manage).toBe('all');
  });

  it('keeps the auditor read-only', () => {
    const mutating = entries.filter(
      (e) =>
        e.roleId === 'auditor' &&
        !['view', 'export'].includes(e.action) &&
        // ยกเว้นการทำเครื่องหมายอ่านแล้วของการแจ้งเตือนของตนเอง
        !(e.resource === 'dashboard.notifications' && e.action === 'edit' && e.scope === 'own'),
    );
    expect(mutating).toEqual([]);
  });

  it('does not let teachers approve anything', () => {
    const teacherActions = actionsOf('teacher');
    expect(teacherActions.has('approve')).toBe(false);
    expect(teacherActions.has('reject')).toBe(false);
    expect(teacherActions.has('manage')).toBe(false);
  });

  it('limits teachers to their own class leave requests', () => {
    expect(DEFAULT_PERMISSION_MATRIX.teacher['classLeave.requests']).toMatchObject({
      view: 'own',
      create: 'own',
      submit: 'own',
    });
  });

  it('gives every role access to the Service Hub and their workspace', () => {
    for (const roleId of ROLE_IDS) {
      expect(DEFAULT_PERMISSION_MATRIX[roleId]['services.directory']?.view, roleId).toBe('all');
      expect(DEFAULT_PERMISSION_MATRIX[roleId]['dashboard.workspace']?.view, roleId).toBeDefined();
    }
  });

  it('only lets office staff and super admin manage service links', () => {
    const managers = entries
      .filter((e) => e.resource === 'services.manage' && e.action === 'manage')
      .map((e) => e.roleId)
      .sort();
    expect(managers).toEqual(['office_staff', 'super_admin']);
  });
});
