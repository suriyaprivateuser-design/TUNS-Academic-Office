'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { AppIcon } from '@/components/shared/app-icon';
import { FormField } from '@/components/shared/form-field';
import { Notice } from '@/components/shared/notice';
import { SERVICE_TILE_COLORS, ServiceTile } from '@/components/shared/service-tile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ICON_KEYS } from '@/config/icons';
import { SERVICE_STATUSES } from '@/config/reference';
import { ROLES } from '@/config/roles';
import { cn } from '@/lib/utils/cn';
import {
  EMPTY_SERVICE_INPUT,
  serviceInputSchema,
  type ServiceInput,
} from '@/schemas/forms/service';
import type { CategoryView, ManagedService } from '@/services/service-hub';
import { saveServiceAction } from './actions';

function toInput(service: ManagedService): ServiceInput {
  return {
    categoryId: service.categoryId,
    nameTh: service.nameTh,
    nameEn: service.nameEn,
    description: service.description,
    ownerUnit: service.ownerUnit,
    linkType: service.linkType,
    url: service.url,
    internalPath: service.internalPath,
    icon: service.icon,
    color: service.color,
    status: service.status,
    isVisible: service.isVisible,
    isPinned: service.isPinned,
    audience: service.audience,
    roleIds: service.roleIds,
  };
}

/**
 * ฟอร์มเพิ่ม/แก้ไขบริการ
 * ผู้เรียกเปลี่ยน `key` ทุกครั้งที่เปิด ฟอร์มจึงเริ่มจากค่าของรายการที่เลือกเสมอ (ไม่ต้องรีเซ็ตด้วย effect)
 */
export function ServiceFormDialog({
  open,
  onOpenChange,
  categories,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly CategoryView[];
  /** null = เพิ่มระบบใหม่ */
  service: ManagedService | null;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ServiceInput>({
    resolver: zodResolver(serviceInputSchema),
    defaultValues: service ? toInput(service) : { ...EMPTY_SERVICE_INPUT, categoryId: categories[0]?.id ?? '' },
  });

  const [linkType, audience, icon, color] = useWatch({
    control,
    name: ['linkType', 'audience', 'icon', 'color'],
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await saveServiceAction(
      values,
      service ? { id: service.id, expectedVersion: service.version } : undefined,
    );
    if (result.ok) {
      toast.success(service ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มระบบแล้ว');
      onOpenChange(false);
      return;
    }
    for (const [field, message] of Object.entries(result.error.fieldErrors ?? {})) {
      setError(field as keyof ServiceInput, { message });
    }
    setFormError(result.error.message);
  });

  const requestClose = (next: boolean) => {
    if (isSubmitting) return;
    if (!next && isDirty && !window.confirm('ยังไม่ได้บันทึกการแก้ไข ต้องการปิดหน้าต่างนี้หรือไม่')) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{service ? 'แก้ไขระบบ' : 'เพิ่มระบบหรือบริการ'}</DialogTitle>
          <DialogDescription>
            ใส่ URL จริงของระบบเท่านั้น ถ้ายังไม่ทราบให้เว้นว่าง ระบบจะแสดงสถานะ “ยังไม่ได้ตั้งค่าลิงก์”
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-5">
            {formError ? <Notice tone="danger">{formError}</Notice> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="service-nameTh" label="ชื่อระบบ (ภาษาไทย)" required error={errors.nameTh?.message}>
                <Input
                  id="service-nameTh"
                  aria-invalid={Boolean(errors.nameTh)}
                  aria-describedby={errors.nameTh ? 'service-nameTh-error' : undefined}
                  {...register('nameTh')}
                />
              </FormField>
              <FormField id="service-nameEn" label="ชื่อภาษาอังกฤษ" error={errors.nameEn?.message}>
                <Input id="service-nameEn" {...register('nameEn')} />
              </FormField>
              <FormField id="service-category" label="หมวดหมู่" required error={errors.categoryId?.message}>
                <Select
                  id="service-category"
                  aria-invalid={Boolean(errors.categoryId)}
                  aria-describedby={errors.categoryId ? 'service-category-error' : undefined}
                  {...register('categoryId')}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameTh}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="service-owner" label="หน่วยงาน/ผู้รับผิดชอบ" error={errors.ownerUnit?.message}>
                <Input id="service-owner" {...register('ownerUnit')} />
              </FormField>
            </div>

            <FormField id="service-description" label="คำอธิบายสั้น" error={errors.description?.message}>
              <Textarea id="service-description" rows={2} {...register('description')} />
            </FormField>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-label font-medium">ปลายทางของลิงก์</legend>
              <div className="flex gap-2">
                {(
                  [
                    ['external', 'เว็บไซต์ภายนอก'],
                    ['internal', 'หน้าในระบบนี้'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      'flex h-10 cursor-pointer items-center rounded-control border px-4 text-label transition-colors duration-150',
                      linkType === value
                        ? 'border-accent bg-accent-soft font-semibold text-accent'
                        : 'border-border-strong text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <input type="radio" value={value} className="sr-only" {...register('linkType')} />
                    {label}
                  </label>
                ))}
              </div>
              {linkType === 'external' ? (
                <FormField
                  id="service-url"
                  label="URL"
                  hint="ต้องขึ้นต้นด้วย https:// (หรือ http:// สำหรับระบบในเครือข่ายโรงเรียน) เว้นว่างได้ถ้ายังไม่มี"
                  error={errors.url?.message}
                >
                  <Input
                    id="service-url"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://"
                    aria-invalid={Boolean(errors.url)}
                    aria-describedby={errors.url ? 'service-url-error' : 'service-url-hint'}
                    {...register('url')}
                  />
                </FormField>
              ) : (
                <FormField
                  id="service-path"
                  label="เส้นทางภายใน"
                  hint="เช่น /class-leave"
                  required
                  error={errors.internalPath?.message}
                >
                  <Input
                    id="service-path"
                    placeholder="/"
                    aria-invalid={Boolean(errors.internalPath)}
                    aria-describedby={errors.internalPath ? 'service-path-error' : 'service-path-hint'}
                    {...register('internalPath')}
                  />
                </FormField>
              )}
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex flex-col items-start gap-2">
                <span className="text-label font-medium">ตัวอย่าง</span>
                <ServiceTile icon={icon} color={color} />
              </div>
              <div className="flex flex-col gap-4">
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <fieldset>
                      <legend className="mb-2 text-label font-medium">โทนสี</legend>
                      <div className="flex flex-wrap gap-2">
                        {SERVICE_TILE_COLORS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={field.value === option.id}
                            onClick={() => field.onChange(option.id)}
                            className={cn(
                              'flex h-9 items-center gap-2 rounded-full border px-3 text-caption transition-colors duration-150',
                              field.value === option.id
                                ? 'border-accent bg-accent-soft font-semibold text-accent'
                                : 'border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <ServiceTile icon="favorite" color={option.id} size="sm" className="size-5 rounded-full [&_svg]:hidden" />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                />
                <Controller
                  control={control}
                  name="icon"
                  render={({ field }) => (
                    <fieldset>
                      <legend className="mb-2 text-label font-medium">ไอคอน</legend>
                      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-input border border-border p-1.5">
                        {ICON_KEYS.map((key) => (
                          <button
                            key={key}
                            type="button"
                            title={key}
                            aria-label={`ไอคอน ${key}`}
                            aria-pressed={field.value === key}
                            onClick={() => field.onChange(key)}
                            className={cn(
                              'grid size-9 place-items-center rounded-[0.5rem] transition-colors duration-100',
                              field.value === key
                                ? 'bg-accent text-white'
                                : 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground',
                            )}
                          >
                            <AppIcon name={key} />
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="service-status" label="สถานะการให้บริการ">
                <Select id="service-status" {...register('status')}>
                  {SERVICE_STATUSES.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="service-audience" label="กลุ่มผู้ใช้งาน">
                <Select id="service-audience" {...register('audience')}>
                  <option value="all">บุคลากรทุกคน</option>
                  <option value="restricted">เฉพาะบทบาทที่เลือก</option>
                </Select>
              </FormField>
            </div>

            {audience === 'restricted' ? (
              <Controller
                control={control}
                name="roleIds"
                render={({ field }) => (
                  <fieldset>
                    <legend className="mb-2 text-label font-medium">บทบาทที่เข้าถึงได้</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ROLES.map((role) => {
                        const checked = field.value.includes(role.id);
                        return (
                          <label key={role.id} className="flex cursor-pointer items-center gap-2.5 text-label">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) =>
                                field.onChange(
                                  next === true
                                    ? [...field.value, role.id]
                                    : field.value.filter((id) => id !== role.id),
                                )
                              }
                            />
                            {role.nameTh}
                          </label>
                        );
                      })}
                    </div>
                    {errors.roleIds?.message ? (
                      <p role="alert" className="mt-2 text-caption font-medium text-danger">
                        {errors.roleIds.message}
                      </p>
                    ) : null}
                  </fieldset>
                )}
              />
            ) : null}

            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Controller
                control={control}
                name="isVisible"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center gap-3 text-label">
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                    แสดงในศูนย์รวมระบบ
                  </label>
                )}
              />
              <Controller
                control={control}
                name="isPinned"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center gap-3 text-label">
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                    ปักหมุดเป็นระบบสำคัญ
                  </label>
                )}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => requestClose(false)} disabled={isSubmitting}>
              ยกเลิก
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {service ? 'บันทึกการแก้ไข' : 'เพิ่มระบบ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
