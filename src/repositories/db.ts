/**
 * Db — Data Access Layer ของหนึ่งคำขอ
 *
 * Service ทุกตัวรับ `Db` เข้าไป (ไม่เรียก Google API เอง) ทำให้ทดสอบได้ด้วย LocalStorageAdapter
 * และทำให้ทุกการเข้าถึงข้อมูลกลางผ่านชั้นเดียวกัน
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import type { ResourceKey } from '@/config/modules';
import { getMinFreshAt, markWrite } from '@/lib/storage/freshness';
import type {
  CommitSuccess,
  Mutation,
  SequenceRequest,
  WriteOperation,
} from '@/lib/storage/gateway-core';
import { getStorage } from '@/lib/storage';
import type { StorageAdapter } from '@/lib/storage/types';
import { AuditLogs } from '@/schemas/database/system';
import type { RowOf, TableDef } from '@/schemas/database/types';
import { Repository } from './base';

export type AuditCategory = RowOf<typeof AuditLogs>['category'];

export interface AuditInput {
  action: string;
  category: AuditCategory;
  resource?: ResourceKey | 'system';
  entityType?: string;
  entityId?: string;
  outcome?: 'success' | 'denied' | 'error';
  /** สรุปเหตุการณ์เป็นภาษาไทย ห้ามมี token รหัสผ่าน หรือรายชื่อนักเรียน */
  summary: string;
  metadata?: Record<string, unknown>;
  /** ระบุเมื่อผู้กระทำไม่ใช่ผู้สั่งคำสั่งนี้ (เช่น เหตุการณ์เข้าสู่ระบบ) */
  actorId?: string | null;
}

export interface OperationMeta {
  /** ชื่อคำสั่ง เช่น `classLeave.submit` — ปรากฏใน Operation Journal */
  action: string;
  actorId: string | null;
  /**
   * คีย์กันการทำซ้ำจากฝั่งผู้ใช้ (สร้างครั้งเดียวต่อการกดหนึ่งครั้งแล้วส่งซ้ำเมื่อ retry)
   * ระบบผูกคีย์กับผู้ใช้และชื่อคำสั่งเอง จึงชนกับคำสั่งของคนอื่นไม่ได้
   */
  idempotencyKey?: string;
}

export class UnitOfWork {
  /** เวลาของคำสั่ง ใช้กับทุกแถวในคำสั่งเดียวกัน */
  readonly now: string;
  private readonly mutations: Mutation[] = [];
  private readonly sequences: SequenceRequest[] = [];
  private readonly resultData: Record<string, string> = {};
  private committed = false;

  constructor(
    private readonly db: Db,
    readonly meta: OperationMeta,
    now: Date = new Date(),
  ) {
    this.now = now.toISOString();
  }

  add(...items: (Mutation | { mutation: Mutation } | null | undefined)[]): this {
    for (const item of items) {
      if (!item) continue;
      this.mutations.push('mutation' in item ? item.mutation : item);
    }
    return this;
  }

  /**
   * ขอเลขอ้างอิงถัดไปของชุดเลข `key` (จองภายใต้ lock ของ Write Gateway)
   * คืน token สำหรับวางในค่าของคอลัมน์ เช่น `CL-2569-${uow.sequence('ref', 'CL-2569', 4)}`
   */
  sequence(name: string, key: string, pad?: number): string {
    if (!this.sequences.some((s) => s.name === name)) this.sequences.push({ name, key });
    return pad ? `{{seq:${name}:${pad}}}` : `{{seq:${name}}}`;
  }

  /** ข้อมูลที่ต้องได้คืนแม้เป็นการเรียกซ้ำด้วยคีย์เดิม (เช่น id ของ record ที่สร้าง) */
  data(key: string, value: string): this {
    this.resultData[key] = value;
    return this;
  }

  /** เพิ่มบันทึก Audit Log เข้าในคำสั่งเดียวกับการเปลี่ยนแปลงข้อมูล */
  audit(input: AuditInput): this {
    // created_at ถูกเติมโดย Write Gateway ด้วยเวลาของคำสั่ง (ก่อนคำนวณ hash ของแถว)
    const { mutation } = this.db.repo(AuditLogs).insert({
      actor_id: input.actorId === undefined ? this.meta.actorId : input.actorId,
      action: input.action,
      category: input.category,
      resource: input.resource ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      outcome: input.outcome ?? 'success',
      summary: input.summary,
      metadata: input.metadata ?? null,
    });
    this.mutations.push(mutation);
    return this;
  }

  get size(): number {
    return this.mutations.length;
  }

  async commit(): Promise<CommitSuccess> {
    if (this.committed) throw new Error('UnitOfWork was already committed');
    this.committed = true;
    const id = randomUUID();
    const operation: WriteOperation = {
      id,
      idempotencyKey: this.meta.idempotencyKey
        ? `${this.meta.actorId ?? 'system'}:${this.meta.action}:${this.meta.idempotencyKey}`
        : id,
      action: this.meta.action,
      actorId: this.meta.actorId,
      now: this.now,
      mutations: this.mutations,
      sequences: this.sequences.length > 0 ? this.sequences : undefined,
      data: Object.keys(this.resultData).length > 0 ? this.resultData : undefined,
    };
    const result = await this.db.storage.commit(operation);
    await markWrite();
    return result;
  }
}

export class Db {
  private readonly repositories = new Map<string, Repository<TableDef>>();
  private freshness: Promise<number | undefined> | null = null;

  constructor(
    readonly storage: StorageAdapter,
    private readonly readFreshness: () => Promise<number | undefined> = async () => undefined,
  ) {}

  repo<T extends TableDef>(table: T): Repository<T> {
    let repository = this.repositories.get(table.key);
    if (!repository) {
      repository = new Repository(table, this.storage, () => {
        this.freshness ??= this.readFreshness();
        return this.freshness;
      }) as Repository<TableDef>;
      this.repositories.set(table.key, repository);
    }
    return repository as unknown as Repository<T>;
  }

  unitOfWork(meta: OperationMeta, now?: Date): UnitOfWork {
    return new UnitOfWork(this, meta, now);
  }
}

/** Db ของคำขอปัจจุบัน (หนึ่ง instance ต่อหนึ่ง request ผ่าน React cache) */
export const getDb = cache((): Db => new Db(getStorage(), getMinFreshAt));
