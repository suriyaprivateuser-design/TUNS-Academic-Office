import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { PermissionSet, type Principal } from '@/lib/security/authorization';

const SCI = 'dept-sci';
const MATH = 'dept-math';
const ASSESSMENT = 'unit-assessment';

const teacher: Principal = {
  id: 'u-teacher',
  departmentId: SCI,
  roles: [{ roleId: 'teacher', departmentId: null, unitId: null }],
};

const otherTeacher: Principal = {
  id: 'u-other',
  departmentId: MATH,
  roles: [{ roleId: 'teacher', departmentId: null, unitId: null }],
};

const scienceHead: Principal = {
  id: 'u-head-sci',
  departmentId: SCI,
  roles: [
    { roleId: 'teacher', departmentId: null, unitId: null },
    { roleId: 'department_head', departmentId: SCI, unitId: null },
  ],
};

const unitHead: Principal = {
  id: 'u-unit',
  departmentId: MATH,
  roles: [{ roleId: 'unit_head', departmentId: null, unitId: ASSESSMENT }],
};

const staff: Principal = {
  id: 'u-staff',
  departmentId: null,
  roles: [{ roleId: 'office_staff', departmentId: null, unitId: null }],
};

const admin: Principal = {
  id: 'u-admin',
  departmentId: null,
  roles: [{ roleId: 'super_admin', departmentId: null, unitId: null }],
};

const auditor: Principal = {
  id: 'u-auditor',
  departmentId: null,
  roles: [{ roleId: 'auditor', departmentId: null, unitId: null }],
};

const requestBy = (ownerId: string, departmentId: string) => ({
  ownerIds: [ownerId],
  departmentId,
});

describe('PermissionSet', () => {
  it('lets a teacher see their own class leave request but not someone else’s', () => {
    const permissions = new PermissionSet(teacher);
    expect(
      permissions.canOnRecord('classLeave.requests', 'view', requestBy('u-teacher', SCI)),
    ).toBe(true);
    expect(
      permissions.canOnRecord('classLeave.requests', 'view', requestBy('u-other', SCI)),
    ).toBe(false);
    expect(
      permissions.canOnRecord('classLeave.requests', 'view', requestBy('u-other', MATH)),
    ).toBe(false);
  });

  it('treats participants (co-owners, recipients) as related to the record', () => {
    const permissions = new PermissionSet(teacher);
    expect(
      permissions.canOnRecord('classLeave.requests', 'view', {
        ownerIds: ['u-other'],
        participantIds: ['u-teacher'],
        departmentId: MATH,
      }),
    ).toBe(true);
  });

  it('limits a department head to their own department', () => {
    const permissions = new PermissionSet(scienceHead);
    expect(
      permissions.canOnRecord('classLeave.approvals', 'approve', requestBy('u-teacher', SCI)),
    ).toBe(true);
    expect(
      permissions.canOnRecord('classLeave.approvals', 'approve', requestBy('u-other', MATH)),
    ).toBe(false);
    expect(permissions.widestScope('classLeave.approvals', 'approve')).toBe('department');
  });

  it('still lets a department head open a record they own in another department', () => {
    const permissions = new PermissionSet(scienceHead);
    expect(
      permissions.canOnRecord('classLeave.requests', 'view', requestBy('u-head-sci', MATH)),
    ).toBe(true);
  });

  it('scopes a unit head to their unit', () => {
    const permissions = new PermissionSet(unitHead);
    expect(
      permissions.canOnRecord('tasks.assignments', 'edit', {
        ownerIds: ['x'],
        unitId: ASSESSMENT,
      }),
    ).toBe(true);
    expect(
      permissions.canOnRecord('tasks.assignments', 'edit', { ownerIds: ['x'], unitId: 'unit-z' }),
    ).toBe(false);
  });

  it('gives office staff organisation-wide access where the matrix says so', () => {
    const permissions = new PermissionSet(staff);
    expect(permissions.canAll('classLeave.requests', 'view')).toBe(true);
    expect(permissions.can('services.manage', 'manage')).toBe(true);
    expect(permissions.can('intelligence.admin', 'manage')).toBe(false);
  });

  it('does not let the super admin approve documents', () => {
    const permissions = new PermissionSet(admin);
    expect(permissions.can('documents.approvals', 'approve')).toBe(false);
    expect(permissions.can('classLeave.approvals', 'approve')).toBe(false);
    expect(permissions.can('intelligence.admin', 'manage')).toBe(true);
  });

  it('unions permissions when a person holds several roles', () => {
    const adminWhoIsDirector: Principal = {
      ...admin,
      roles: [...admin.roles, { roleId: 'director', departmentId: null, unitId: null }],
    };
    expect(new PermissionSet(adminWhoIsDirector).can('documents.approvals', 'approve')).toBe(true);
  });

  it('keeps the auditor from changing anything', () => {
    const permissions = new PermissionSet(auditor);
    expect(permissions.can('classLeave.requests', 'view')).toBe(true);
    expect(permissions.can('classLeave.requests', 'create')).toBe(false);
    expect(permissions.can('documents.approvals', 'approve')).toBe(false);
    expect(permissions.can('services.manage', 'edit')).toBe(false);
  });

  it('filters lists down to what the user may see', () => {
    const records = [
      { id: 1, ...requestBy('u-teacher', SCI) },
      { id: 2, ...requestBy('u-other', MATH) },
      { id: 3, ...requestBy('u-x', SCI) },
    ];
    const ids = (principal: Principal) =>
      new PermissionSet(principal)
        .filter('classLeave.requests', 'view', records, (r) => r)
        .map((r) => r.id);

    expect(ids(teacher)).toEqual([1]);
    expect(ids(otherTeacher)).toEqual([2]);
    expect(ids(scienceHead)).toEqual([1, 3]);
    expect(ids(staff)).toEqual([1, 2, 3]);
  });

  it('returns nothing when the user has no grant at all', () => {
    const nobody: Principal = { id: 'u-none', departmentId: null, roles: [] };
    const permissions = new PermissionSet(nobody);
    expect(permissions.filter('classLeave.requests', 'view', [{ a: 1 }], () => ({}))).toEqual([]);
    expect(permissions.viewableResources().size).toBe(0);
  });

  it('throws a FORBIDDEN AppError from the assert helpers', () => {
    const permissions = new PermissionSet(teacher);
    expect(() => permissions.assertCan('services.manage', 'edit')).toThrowError(AppError);
    try {
      permissions.assertCanOnRecord('classLeave.requests', 'edit', requestBy('u-other', SCI));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('FORBIDDEN');
      expect((error as AppError).status).toBe(403);
    }
  });

  it('lists viewable resources for menu filtering', () => {
    const viewable = new PermissionSet(teacher).viewableResources();
    expect(viewable.has('services.directory')).toBe(true);
    expect(viewable.has('classLeave.requests')).toBe(true);
    expect(viewable.has('intelligence.admin')).toBe(false);
    expect(viewable.has('services.manage')).toBe(false);
  });
});
