/**
 * TUNS Academic Office — Write Gateway (Google Apps Script)
 *
 * ไฟล์นี้สร้างอัตโนมัติจาก apps-script/src และ src/lib/storage/gateway-core
 * ห้ามแก้ไขโดยตรง ให้แก้ที่ซอร์สแล้วรัน `npm run apps-script:build`
 * วิธีติดตั้ง: ดู apps-script/README.md
 */
"use strict";
var TunsGateway = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // apps-script/src/main.ts
  var main_exports = {};
  __export(main_exports, {
    PROTOCOL_VERSION: () => PROTOCOL_VERSION,
    constantTimeEquals: () => constantTimeEquals,
    doGet: () => doGet,
    doPost: () => doPost,
    handle: () => handle,
    toHex: () => toHex
  });

  // src/lib/storage/gateway-core/types.ts
  var SYSTEM_DB = "system";
  var JOURNAL_TABLE = "system.OperationLogs";
  var SEQUENCE_TABLE = "system.DocumentSequences";
  var AUDIT_TABLE = "system.AuditLogs";
  var AUDIT_CHAIN_TABLE = "system.AuditChain";
  var AUDIT_CHAIN_HEAD_ID = "head";
  var LEDGER_SHEET = "_Ledger";
  var AUDIT_HASH_FIELDS = [
    "id",
    "created_at",
    "actor_id",
    "action",
    "category",
    "resource",
    "entity_type",
    "entity_id",
    "outcome",
    "summary",
    "metadata"
  ];
  var AUDIT_GENESIS_HASH = "GENESIS";
  var MAX_MUTATIONS_PER_OPERATION = 5e3;
  var MAX_CELL_LENGTH = 45e3;
  function dbOf(table) {
    const index = table.indexOf(".");
    return index === -1 ? "" : table.slice(0, index);
  }
  function sheetOf(table) {
    const index = table.indexOf(".");
    return index === -1 ? table : table.slice(index + 1);
  }
  function ledgerTable(db) {
    return `${db}.${LEDGER_SHEET}`;
  }

  // src/lib/storage/gateway-core/execute.ts
  var GatewayError = class extends Error {
    constructor(code, message, extra = {}) {
      super(message);
      __publicField(this, "code", code);
      __publicField(this, "extra", extra);
    }
  };
  function fail(error) {
    var _a;
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        table: error.extra.table,
        id: error.extra.id,
        columns: error.extra.columns,
        retryable: (_a = error.extra.retryable) != null ? _a : false
      }
    };
  }
  var SEQ_TOKEN = /\{\{seq:([A-Za-z0-9_]+)(?::(\d{1,2}))?\}\}/g;
  function isRecordOfStrings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    for (const key of Object.keys(value)) {
      if (typeof value[key] !== "string") return false;
    }
    return true;
  }
  function isUniqueBy(value) {
    if (value === void 0) return true;
    return Array.isArray(value) && value.every(
      (group) => Array.isArray(group) && group.length > 0 && group.every((c) => typeof c === "string")
    );
  }
  function validateOperation(op) {
    var _a, _b;
    const invalid = (message) => new GatewayError("INVALID_OPERATION", message);
    if (!op || typeof op !== "object") throw invalid("operation must be an object");
    if (typeof op.id !== "string" || !op.id) throw invalid("operation.id is required");
    if (typeof op.idempotencyKey !== "string" || !op.idempotencyKey) {
      throw invalid("operation.idempotencyKey is required");
    }
    if (typeof op.action !== "string" || !op.action) throw invalid("operation.action is required");
    if (typeof op.now !== "string" || Number.isNaN(Date.parse(op.now))) {
      throw invalid("operation.now must be an ISO timestamp");
    }
    if (op.actorId !== null && typeof op.actorId !== "string") {
      throw invalid("operation.actorId must be a string or null");
    }
    if (!Array.isArray(op.mutations)) throw invalid("operation.mutations must be an array");
    if (op.mutations.length > MAX_MUTATIONS_PER_OPERATION) {
      throw invalid(`operation has more than ${MAX_MUTATIONS_PER_OPERATION} mutations`);
    }
    if (op.data !== void 0 && !isRecordOfStrings(op.data)) {
      throw invalid("operation.data must be a record of strings");
    }
    const seen = /* @__PURE__ */ new Set();
    for (const mutation of op.mutations) {
      if (!mutation || typeof mutation !== "object") throw invalid("mutation must be an object");
      if (typeof mutation.table !== "string" || !dbOf(mutation.table)) {
        throw invalid('mutation.table must look like "database.Worksheet"');
      }
      if (!isUniqueBy(mutation.uniqueBy)) throw invalid("mutation.uniqueBy must be string[][]");
      let id;
      if (mutation.op === "insert") {
        if (!isRecordOfStrings(mutation.values)) {
          throw invalid("insert.values must be a record of strings");
        }
        id = (_a = mutation.values.id) != null ? _a : "";
        if (!id) throw invalid(`insert into ${mutation.table} requires values.id`);
      } else if (mutation.op === "update") {
        if (!isRecordOfStrings(mutation.set)) throw invalid("update.set must be a record of strings");
        if (typeof mutation.id !== "string" || !mutation.id) throw invalid("update.id is required");
        if ("id" in mutation.set) throw invalid("update.set must not change id");
        if (mutation.expectedVersion !== void 0 && (!Number.isInteger(mutation.expectedVersion) || mutation.expectedVersion < 1)) {
          throw invalid("update.expectedVersion must be a positive integer");
        }
        id = mutation.id;
      } else {
        throw invalid('mutation.op must be "insert" or "update"');
      }
      const ref = `${mutation.table}:${id}`;
      if (seen.has(ref)) {
        throw invalid(`operation touches ${ref} more than once`);
      }
      seen.add(ref);
    }
    const names = /* @__PURE__ */ new Set();
    for (const sequence of (_b = op.sequences) != null ? _b : []) {
      if (!sequence || typeof sequence.name !== "string" || !/^[A-Za-z0-9_]+$/.test(sequence.name)) {
        throw invalid("sequence.name must be alphanumeric");
      }
      if (typeof sequence.key !== "string" || !sequence.key) throw invalid("sequence.key is required");
      if (names.has(sequence.name)) throw invalid(`duplicate sequence name "${sequence.name}"`);
      names.add(sequence.name);
    }
  }
  function substitute(value, sequences) {
    if (value.indexOf("{{seq:") === -1) return value;
    return value.replace(SEQ_TOKEN, (match, name, pad) => {
      const number = sequences[name];
      if (number === void 0) {
        throw new GatewayError("INVALID_OPERATION", `unknown sequence token ${match}`);
      }
      const text = String(number);
      return pad ? text.padStart(Number(pad), "0") : text;
    });
  }
  function substituteRecord(record, sequences) {
    var _a;
    const result = {};
    for (const key of Object.keys(record)) result[key] = substitute((_a = record[key]) != null ? _a : "", sequences);
    return result;
  }
  function requireColumns(table, header, columns) {
    const missing = columns.filter((column) => header.indexOf(column) === -1);
    if (missing.length > 0) {
      throw new GatewayError(
        "UNKNOWN_COLUMN",
        `table ${table} has no column(s): ${missing.join(", ")}`,
        { table, columns: missing }
      );
    }
  }
  function assertCellSizes(table, values) {
    var _a;
    for (const key of Object.keys(values)) {
      if (((_a = values[key]) != null ? _a : "").length > MAX_CELL_LENGTH) {
        throw new GatewayError(
          "INVALID_OPERATION",
          `value of ${table}.${key} exceeds ${MAX_CELL_LENGTH} characters`,
          { table, columns: [key] }
        );
      }
    }
  }
  function safeParse(text, fallback) {
    if (!text) return fallback;
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }
  function tupleKey(parts) {
    for (const part of parts) if (!part) return null;
    return parts.join("");
  }
  function ensureBatch(batches, db) {
    let batch = batches.get(db);
    if (!batch) {
      batch = { appends: [], updates: [] };
      batches.set(db, batch);
    }
    return batch;
  }
  function addAppend(batch, table, row) {
    const existing = batch.appends.find((entry) => entry.table === table);
    if (existing) existing.rows.push(row);
    else batch.appends.push({ table, rows: [row] });
  }
  function run(store, env, op) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v;
    validateOperation(op);
    const mutationTables = Array.from(new Set(op.mutations.map((m) => m.table)));
    const hasSequences = ((_b = (_a = op.sequences) == null ? void 0 : _a.length) != null ? _b : 0) > 0;
    const hasAudit = op.mutations.some((m) => m.op === "insert" && m.table === AUDIT_TABLE);
    const dataDbs = Array.from(new Set(mutationTables.map(dbOf)));
    const otherDbs = dataDbs.filter((db) => db !== SYSTEM_DB).sort();
    const neededTables = new Set(mutationTables);
    neededTables.add(JOURNAL_TABLE);
    if (hasSequences) neededTables.add(SEQUENCE_TABLE);
    if (hasAudit) neededTables.add(AUDIT_CHAIN_TABLE);
    for (const db of otherDbs) neededTables.add(ledgerTable(db));
    const headers = store.readHeaders(Array.from(neededTables));
    const headerOf = (table) => {
      const header = headers[table];
      if (!header || header.length === 0) {
        throw new GatewayError(
          "UNKNOWN_TABLE",
          `worksheet for ${table} does not exist or has no header row`,
          { table }
        );
      }
      return header;
    };
    for (const table of neededTables) headerOf(table);
    const journalHeader = headerOf(JOURNAL_TABLE);
    requireColumns(JOURNAL_TABLE, journalHeader, [
      "id",
      "created_at",
      "idempotency_key",
      "action",
      "actor_id",
      "status",
      "databases",
      "applied_databases",
      "row_refs",
      "result_json",
      "error",
      "completed_at"
    ]);
    const journalCol = (name) => journalHeader.indexOf(name);
    const [journalKeys = []] = store.readColumns([
      { table: JOURNAL_TABLE, column: "idempotency_key" }
    ]);
    const existingIndex = journalKeys.indexOf(op.idempotencyKey);
    let resumeRow = null;
    if (existingIndex !== -1) {
      const [row = []] = store.readRows([{ table: JOURNAL_TABLE, rowIndex: existingIndex }]);
      const status = (_c = row[journalCol("status")]) != null ? _c : "";
      if (status === "applied") {
        const stored = safeParse(row[journalCol("result_json")], null);
        if (stored && stored.ok) return { ...stored, replayed: true };
        return {
          ok: true,
          opId: (_d = row[journalCol("id")]) != null ? _d : op.id,
          replayed: true,
          sequences: {},
          versions: {},
          touched: [],
          data: {}
        };
      }
      if (status !== "pending" || ((_e = row[journalCol("id")]) != null ? _e : "") !== op.id) {
        throw new GatewayError(
          "INCOMPLETE_OPERATION",
          `a previous operation with idempotency key "${op.idempotencyKey}" did not complete`,
          { id: row[journalCol("id")] }
        );
      }
      resumeRow = row;
    }
    const resuming = resumeRow !== null;
    const journalRowIndex = resuming ? existingIndex : journalKeys.length;
    const priorResult = resuming ? safeParse(resumeRow == null ? void 0 : resumeRow[journalCol("result_json")], null) : null;
    const appliedDbs = /* @__PURE__ */ new Set();
    if (resuming && otherDbs.length > 0) {
      const ledgers = store.readColumns(
        otherDbs.map((db) => ({ table: ledgerTable(db), column: "op_id" }))
      );
      otherDbs.forEach((db, index) => {
        var _a2;
        if (((_a2 = ledgers[index]) != null ? _a2 : []).indexOf(op.id) !== -1) appliedDbs.add(db);
      });
    }
    const sequences = {};
    const sequenceWrites = [];
    if (hasSequences) {
      if (resuming) {
        Object.assign(sequences, (_f = priorResult == null ? void 0 : priorResult.sequences) != null ? _f : {});
        for (const request of (_g = op.sequences) != null ? _g : []) {
          if (sequences[request.name] === void 0) {
            throw new GatewayError(
              "INCOMPLETE_OPERATION",
              `sequence "${request.name}" was not reserved by the previous attempt`
            );
          }
        }
      } else {
        const header = headerOf(SEQUENCE_TABLE);
        requireColumns(SEQUENCE_TABLE, header, ["id", "version", "current_value"]);
        const [ids = [], values = [], versions2 = []] = store.readColumns([
          { table: SEQUENCE_TABLE, column: "id" },
          { table: SEQUENCE_TABLE, column: "current_value" },
          { table: SEQUENCE_TABLE, column: "version" }
        ]);
        const state = /* @__PURE__ */ new Map();
        for (const request of (_h = op.sequences) != null ? _h : []) {
          let entry = state.get(request.key);
          if (!entry) {
            const rowIndex = ids.indexOf(request.key);
            entry = {
              rowIndex,
              value: rowIndex === -1 ? 0 : Number((_i = values[rowIndex]) != null ? _i : "0") || 0,
              version: rowIndex === -1 ? 0 : Number((_j = versions2[rowIndex]) != null ? _j : "0") || 0
            };
            state.set(request.key, entry);
          }
          entry.value += 1;
          sequences[request.name] = entry.value;
        }
        const existing = Array.from(state.entries()).filter(([, entry]) => entry.rowIndex !== -1);
        const currentRows2 = store.readRows(
          existing.map(([, entry]) => ({ table: SEQUENCE_TABLE, rowIndex: entry.rowIndex }))
        );
        const rowByKey = new Map(existing.map(([key], index) => {
          var _a2;
          return [key, (_a2 = currentRows2[index]) != null ? _a2 : []];
        }));
        for (const [key, entry] of state) {
          const base = entry.rowIndex === -1 ? [] : (_k = rowByKey.get(key)) != null ? _k : [];
          const row = header.map((column, index) => {
            var _a2, _b2, _c2, _d2, _e2;
            switch (column) {
              case "id":
                return key;
              case "version":
                return String(entry.version + 1);
              case "current_value":
                return String(entry.value);
              case "created_at":
                return entry.rowIndex === -1 ? op.now : (_a2 = base[index]) != null ? _a2 : "";
              case "created_by":
                return entry.rowIndex === -1 ? (_b2 = op.actorId) != null ? _b2 : "" : (_c2 = base[index]) != null ? _c2 : "";
              case "updated_at":
                return op.now;
              case "updated_by":
                return (_d2 = op.actorId) != null ? _d2 : "";
              default:
                return (_e2 = base[index]) != null ? _e2 : "";
            }
          });
          sequenceWrites.push({
            table: SEQUENCE_TABLE,
            id: key,
            kind: entry.rowIndex === -1 ? "insert" : "update",
            row,
            rowIndex: entry.rowIndex === -1 ? void 0 : entry.rowIndex
          });
        }
      }
    }
    const mutations = op.mutations.map(
      (mutation) => mutation.op === "insert" ? { ...mutation, values: substituteRecord(mutation.values, sequences) } : { ...mutation, set: substituteRecord(mutation.set, sequences) }
    );
    const data = substituteRecord((_l = op.data) != null ? _l : {}, sequences);
    const pending = mutations.filter((mutation) => !appliedDbs.has(dbOf(mutation.table)));
    for (const mutation of pending) {
      const header = headerOf(mutation.table);
      const fields = mutation.op === "insert" ? mutation.values : mutation.set;
      requireColumns(mutation.table, header, Object.keys(fields));
      assertCellSizes(mutation.table, fields);
      for (const group of (_m = mutation.uniqueBy) != null ? _m : []) requireColumns(mutation.table, header, group);
    }
    const updates = pending.filter((m) => m.op === "update");
    const updateTables = Array.from(new Set(updates.map((m) => m.table)));
    const idColumns = store.readColumns(updateTables.map((table) => ({ table, column: "id" })));
    const idsByTable = new Map(updateTables.map((table, index) => {
      var _a2;
      return [table, (_a2 = idColumns[index]) != null ? _a2 : []];
    }));
    const rowRequests = updates.map((mutation) => {
      var _a2;
      const rowIndex = ((_a2 = idsByTable.get(mutation.table)) != null ? _a2 : []).indexOf(mutation.id);
      if (rowIndex === -1) {
        throw new GatewayError("NOT_FOUND", `row ${mutation.table}:${mutation.id} does not exist`, {
          table: mutation.table,
          id: mutation.id
        });
      }
      return { table: mutation.table, rowIndex };
    });
    const currentRows = store.readRows(rowRequests);
    const versions = {};
    const planned = [];
    const currentByRef = /* @__PURE__ */ new Map();
    updates.forEach((mutation, index) => {
      var _a2, _b2, _c2, _d2;
      const header = headerOf(mutation.table);
      const current = (_a2 = currentRows[index]) != null ? _a2 : [];
      const rowIndex = (_c2 = (_b2 = rowRequests[index]) == null ? void 0 : _b2.rowIndex) != null ? _c2 : -1;
      const versionIndex = header.indexOf("version");
      const currentVersion = versionIndex === -1 ? 0 : Number((_d2 = current[versionIndex]) != null ? _d2 : "0") || 0;
      if (mutation.expectedVersion !== void 0 && currentVersion !== mutation.expectedVersion) {
        throw new GatewayError(
          "VERSION_CONFLICT",
          `row ${mutation.table}:${mutation.id} is at version ${currentVersion}, expected ${mutation.expectedVersion}`,
          { table: mutation.table, id: mutation.id }
        );
      }
      const nextVersion = currentVersion + 1;
      const row = header.map((column, columnIndex) => {
        var _a3, _b3;
        if (column === "version") return String(nextVersion);
        if (column === "updated_at") return op.now;
        if (column === "updated_by") return (_a3 = op.actorId) != null ? _a3 : "";
        const next = mutation.set[column];
        return next !== void 0 ? next : (_b3 = current[columnIndex]) != null ? _b3 : "";
      });
      if (versionIndex !== -1) versions[`${mutation.table}:${mutation.id}`] = nextVersion;
      currentByRef.set(`${mutation.table}:${mutation.id}`, row);
      planned.push({ table: mutation.table, id: mutation.id, kind: "update", row, rowIndex });
    });
    const inserts = pending.filter((m) => m.op === "insert");
    for (const mutation of inserts) {
      const header = headerOf(mutation.table);
      const row = header.map((column) => {
        var _a2;
        const value = mutation.values[column];
        if (value !== void 0 && value !== "") return value;
        if (column === "version") return "1";
        if (column === "created_at") return op.now;
        if (column === "created_by") return (_a2 = op.actorId) != null ? _a2 : "";
        return value != null ? value : "";
      });
      currentByRef.set(`${mutation.table}:${mutation.values.id}`, row);
      planned.push({ table: mutation.table, id: (_n = mutation.values.id) != null ? _n : "", kind: "insert", row });
    }
    const uniqueChecks = pending.flatMap(
      (mutation) => {
        var _a2;
        return ((_a2 = mutation.uniqueBy) != null ? _a2 : []).map((group) => ({ mutation, group }));
      }
    );
    if (uniqueChecks.length > 0) {
      const columnRequests = [];
      const requestIndex = /* @__PURE__ */ new Map();
      const want = (table, column) => {
        const key = `${table}${column}`;
        if (!requestIndex.has(key)) {
          requestIndex.set(key, columnRequests.length);
          columnRequests.push({ table, column });
        }
      };
      for (const { mutation, group } of uniqueChecks) {
        want(mutation.table, "id");
        for (const column of group) want(mutation.table, column);
      }
      const columnValues = store.readColumns(columnRequests);
      const columnOf = (table, column) => {
        var _a2, _b2;
        return (_b2 = columnValues[(_a2 = requestIndex.get(`${table}${column}`)) != null ? _a2 : -1]) != null ? _b2 : [];
      };
      const claimed = /* @__PURE__ */ new Map();
      for (const { mutation, group } of uniqueChecks) {
        const id = mutation.op === "insert" ? (_o = mutation.values.id) != null ? _o : "" : mutation.id;
        const header = headerOf(mutation.table);
        const row = (_p = currentByRef.get(`${mutation.table}:${id}`)) != null ? _p : [];
        const key = tupleKey(group.map((column) => row[header.indexOf(column)]));
        if (key === null) continue;
        const scope = `${mutation.table}${group.join(",")}${key}`;
        const violation = () => new GatewayError(
          "UNIQUE_VIOLATION",
          `${mutation.table} already has a row with the same ${group.join(" + ")}`,
          { table: mutation.table, id, columns: group }
        );
        const claimedBy = claimed.get(scope);
        if (claimedBy !== void 0 && claimedBy !== id) throw violation();
        claimed.set(scope, id);
        const ids = columnOf(mutation.table, "id");
        const columns = group.map((column) => columnOf(mutation.table, column));
        for (let rowIndex = 0; rowIndex < ids.length; rowIndex += 1) {
          const otherId = (_q = ids[rowIndex]) != null ? _q : "";
          if (!otherId || otherId === id) continue;
          const rewritten = currentByRef.get(`${mutation.table}:${otherId}`);
          const otherKey = rewritten ? tupleKey(group.map((column) => rewritten[header.indexOf(column)])) : tupleKey(columns.map((values) => values[rowIndex]));
          if (otherKey === key) throw violation();
        }
      }
    }
    const auditWrites = planned.filter((write) => write.table === AUDIT_TABLE && write.kind === "insert");
    let chainWrite = null;
    if (auditWrites.length > 0) {
      const auditHeader = headerOf(AUDIT_TABLE);
      requireColumns(AUDIT_TABLE, auditHeader, ["prev_hash", "row_hash"]);
      const chainHeader = headerOf(AUDIT_CHAIN_TABLE);
      requireColumns(AUDIT_CHAIN_TABLE, chainHeader, ["id", "version", "last_hash", "entry_count"]);
      const [chainIds = []] = store.readColumns([{ table: AUDIT_CHAIN_TABLE, column: "id" }]);
      const headIndex = chainIds.indexOf(AUDIT_CHAIN_HEAD_ID);
      const headRow = headIndex === -1 ? [] : (_r = store.readRows([{ table: AUDIT_CHAIN_TABLE, rowIndex: headIndex }])[0]) != null ? _r : [];
      let lastHash = headRow[chainHeader.indexOf("last_hash")] || AUDIT_GENESIS_HASH;
      let count = Number((_s = headRow[chainHeader.indexOf("entry_count")]) != null ? _s : "0") || 0;
      const headVersion = Number((_t = headRow[chainHeader.indexOf("version")]) != null ? _t : "0") || 0;
      for (const write of auditWrites) {
        const fields = AUDIT_HASH_FIELDS.map((field) => {
          var _a2;
          return (_a2 = write.row[auditHeader.indexOf(field)]) != null ? _a2 : "";
        });
        const hash = env.sha256Hex([lastHash, ...fields].join(""));
        write.row[auditHeader.indexOf("prev_hash")] = lastHash;
        write.row[auditHeader.indexOf("row_hash")] = hash;
        lastHash = hash;
        count += 1;
      }
      const row = chainHeader.map((column, index) => {
        var _a2, _b2;
        switch (column) {
          case "id":
            return AUDIT_CHAIN_HEAD_ID;
          case "version":
            return String(headVersion + 1);
          case "last_hash":
            return lastHash;
          case "entry_count":
            return String(count);
          case "created_at":
            return headIndex === -1 ? op.now : (_a2 = headRow[index]) != null ? _a2 : "";
          case "updated_at":
            return op.now;
          default:
            return (_b2 = headRow[index]) != null ? _b2 : "";
        }
      });
      chainWrite = {
        table: AUDIT_CHAIN_TABLE,
        id: AUDIT_CHAIN_HEAD_ID,
        kind: headIndex === -1 ? "insert" : "update",
        row,
        rowIndex: headIndex === -1 ? void 0 : headIndex
      };
    }
    const batches = /* @__PURE__ */ new Map();
    const place = (write) => {
      var _a2;
      const batch = ensureBatch(batches, dbOf(write.table));
      if (write.kind === "insert") addAppend(batch, write.table, write.row);
      else batch.updates.push({ table: write.table, rowIndex: (_a2 = write.rowIndex) != null ? _a2 : -1, row: write.row });
    };
    for (const write of planned) place(write);
    if (chainWrite) place(chainWrite);
    const touched = Array.from(
      /* @__PURE__ */ new Set([
        ...mutationTables,
        ...hasSequences ? [SEQUENCE_TABLE] : [],
        ...hasAudit ? [AUDIT_CHAIN_TABLE] : []
      ])
    ).sort();
    const result = {
      ok: true,
      opId: op.id,
      replayed: false,
      sequences,
      versions: { ...(_u = priorResult == null ? void 0 : priorResult.versions) != null ? _u : {}, ...versions },
      touched,
      data
    };
    const refs = op.mutations.map((m) => `${m.table}:${m.op === "insert" ? m.values.id : m.id}`);
    let rowRefs = JSON.stringify(refs);
    if (rowRefs.length > MAX_CELL_LENGTH) {
      const kept = [];
      let length = 2;
      for (const ref of refs) {
        if (length + ref.length + 3 > MAX_CELL_LENGTH - 40) break;
        kept.push(ref);
        length += ref.length + 3;
      }
      rowRefs = JSON.stringify([...kept, `…+${refs.length - kept.length}`]);
    }
    let resultJson = JSON.stringify(result);
    if (resultJson.length > MAX_CELL_LENGTH) {
      resultJson = JSON.stringify({ ...result, versions: {} });
    }
    const allDbs = [...otherDbs, SYSTEM_DB];
    const journalRow = (status) => journalHeader.map((column) => {
      var _a2, _b2;
      switch (column) {
        case "id":
          return op.id;
        case "created_at":
          return resuming ? (_a2 = resumeRow == null ? void 0 : resumeRow[journalCol("created_at")]) != null ? _a2 : op.now : op.now;
        case "idempotency_key":
          return op.idempotencyKey;
        case "action":
          return op.action;
        case "actor_id":
          return (_b2 = op.actorId) != null ? _b2 : "";
        case "status":
          return status;
        case "databases":
          return JSON.stringify(allDbs);
        case "applied_databases":
          return status === "applied" ? JSON.stringify(allDbs) : JSON.stringify([]);
        case "row_refs":
          return rowRefs;
        case "result_json":
          return resultJson;
        case "completed_at":
          return status === "applied" ? op.now : "";
        default:
          return "";
      }
    });
    const systemBatch = ensureBatch(batches, SYSTEM_DB);
    if (otherDbs.length === 0 && !resuming) {
      for (const write of sequenceWrites) place(write);
      addAppend(systemBatch, JOURNAL_TABLE, journalRow("applied"));
      store.applyBatch(SYSTEM_DB, systemBatch);
      return result;
    }
    if (!resuming) {
      const reserve = { appends: [], updates: [] };
      addAppend(reserve, JOURNAL_TABLE, journalRow("pending"));
      for (const write of sequenceWrites) {
        if (write.kind === "insert") addAppend(reserve, write.table, write.row);
        else reserve.updates.push({ table: write.table, rowIndex: (_v = write.rowIndex) != null ? _v : -1, row: write.row });
      }
      store.applyBatch(SYSTEM_DB, reserve);
    }
    for (const db of otherDbs) {
      if (appliedDbs.has(db)) continue;
      const batch = ensureBatch(batches, db);
      addAppend(batch, ledgerTable(db), [op.id, op.now]);
      store.applyBatch(db, batch);
    }
    systemBatch.updates.push({
      table: JOURNAL_TABLE,
      rowIndex: journalRowIndex,
      row: journalRow("applied")
    });
    store.applyBatch(SYSTEM_DB, systemBatch);
    return result;
  }
  function executeCommit(store, env, op) {
    try {
      return run(store, env, op);
    } catch (error) {
      if (error instanceof GatewayError) return fail(error);
      const message = error instanceof Error ? error.message : String(error);
      return fail(new GatewayError("STORE_ERROR", message, { retryable: true }));
    }
  }

  // apps-script/src/sheets-store.ts
  function quoteSheet(title) {
    return `'${title.replace(/'/g, "''")}'`;
  }
  function columnLetter(index) {
    let n = index + 1;
    let letters = "";
    while (n > 0) {
      const remainder = (n - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }
  function toText(value) {
    if (value === null || value === void 0) return "";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return String(value);
  }
  function toCell(value) {
    return value === "" ? {} : { userEnteredValue: { stringValue: value } };
  }
  var SHEET_ID_CACHE_SECONDS = 6 * 60 * 60;
  var SheetsTableStore = class {
    constructor(runtime, spreadsheets) {
      __publicField(this, "runtime", runtime);
      __publicField(this, "spreadsheets", spreadsheets);
      __publicField(this, "headers", /* @__PURE__ */ new Map());
      __publicField(this, "sheetIds", /* @__PURE__ */ new Map());
    }
    spreadsheetId(db) {
      const id = this.spreadsheets[db];
      if (!id) throw new Error(`spreadsheet id for database "${db}" was not provided`);
      return id;
    }
    cacheKey(db) {
      return `sheetIds:${this.spreadsheetId(db)}`;
    }
    /** ชื่อ Worksheet → sheetId ของไฟล์ (sheetId ไม่เปลี่ยนตลอดอายุของ Worksheet จึง cache ได้) */
    loadSheetIds(db, refresh = false) {
      var _a, _b, _c;
      const existing = this.sheetIds.get(db);
      if (existing && !refresh) return existing;
      const cache = this.runtime.CacheService.getScriptCache();
      if (!refresh) {
        const cached = cache.get(this.cacheKey(db));
        if (cached) {
          const map2 = new Map(JSON.parse(cached));
          this.sheetIds.set(db, map2);
          return map2;
        }
      }
      const response = this.runtime.Sheets.Spreadsheets.get(this.spreadsheetId(db), {
        fields: "sheets.properties(sheetId,title)"
      });
      const map = /* @__PURE__ */ new Map();
      for (const sheet of (_a = response.sheets) != null ? _a : []) {
        const title = (_b = sheet.properties) == null ? void 0 : _b.title;
        const sheetId = (_c = sheet.properties) == null ? void 0 : _c.sheetId;
        if (title !== void 0 && sheetId !== void 0) map.set(title, sheetId);
      }
      this.sheetIds.set(db, map);
      cache.put(this.cacheKey(db), JSON.stringify(Array.from(map.entries())), SHEET_ID_CACHE_SECONDS);
      return map;
    }
    forgetSheetIds(db) {
      this.sheetIds.delete(db);
      this.runtime.CacheService.getScriptCache().remove(this.cacheKey(db));
    }
    sheetId(table) {
      const db = dbOf(table);
      let id = this.loadSheetIds(db).get(sheetOf(table));
      if (id === void 0) id = this.loadSheetIds(db, true).get(sheetOf(table));
      if (id === void 0) throw new Error(`worksheet ${table} does not exist`);
      return id;
    }
    batchGet(db, ranges, majorDimension) {
      if (ranges.length === 0) return [];
      const response = this.runtime.Sheets.Spreadsheets.Values.batchGet(this.spreadsheetId(db), {
        ranges,
        valueRenderOption: "UNFORMATTED_VALUE",
        majorDimension
      });
      return ranges.map(
        (_, index) => {
          var _a, _b, _c;
          return ((_c = (_b = (_a = response.valueRanges) == null ? void 0 : _a[index]) == null ? void 0 : _b.values) != null ? _c : []).map((line) => line.map(toText));
        }
      );
    }
    groupByDb(items) {
      const groups = /* @__PURE__ */ new Map();
      items.forEach((item, position) => {
        var _a;
        const db = dbOf(item.table);
        const group = (_a = groups.get(db)) != null ? _a : [];
        group.push({ item, position });
        groups.set(db, group);
      });
      return groups;
    }
    readHeaders(tables) {
      var _a;
      const result = {};
      const unknown = tables.filter((table) => !this.headers.has(table));
      for (const [db, group] of this.groupByDb(unknown.map((table) => ({ table })))) {
        let titles = this.loadSheetIds(db);
        if (group.some(({ item }) => !titles.has(sheetOf(item.table)))) {
          titles = this.loadSheetIds(db, true);
        }
        const present = group.filter(({ item }) => titles.has(sheetOf(item.table)));
        const values = this.batchGet(
          db,
          present.map(({ item }) => `${quoteSheet(sheetOf(item.table))}!1:1`),
          "ROWS"
        );
        present.forEach(({ item }, index) => {
          var _a2, _b;
          this.headers.set(item.table, (_b = (_a2 = values[index]) == null ? void 0 : _a2[0]) != null ? _b : []);
        });
      }
      for (const table of tables) result[table] = (_a = this.headers.get(table)) != null ? _a : null;
      return result;
    }
    header(table) {
      var _a;
      const cached = this.headers.get(table);
      if (cached) return cached;
      return (_a = this.readHeaders([table])[table]) != null ? _a : [];
    }
    readColumns(requests) {
      const result = requests.map(() => []);
      for (const [db, group] of this.groupByDb(requests)) {
        const wanted = group.map(({ item, position }) => ({
          position,
          table: item.table,
          index: this.header(item.table).indexOf(item.column)
        })).filter((entry) => entry.index !== -1);
        const values = this.batchGet(
          db,
          wanted.map(({ table, index }) => {
            const letter = columnLetter(index);
            return `${quoteSheet(sheetOf(table))}!${letter}2:${letter}`;
          }),
          "COLUMNS"
        );
        wanted.forEach(({ position }, index) => {
          var _a, _b;
          result[position] = (_b = (_a = values[index]) == null ? void 0 : _a[0]) != null ? _b : [];
        });
      }
      return result;
    }
    readRows(requests) {
      const result = requests.map(() => []);
      for (const [db, group] of this.groupByDb(requests)) {
        const values = this.batchGet(
          db,
          group.map(({ item }) => {
            const width = Math.max(1, this.header(item.table).length);
            const sheetRow = item.rowIndex + 2;
            return `${quoteSheet(sheetOf(item.table))}!A${sheetRow}:${columnLetter(width - 1)}${sheetRow}`;
          }),
          "ROWS"
        );
        group.forEach(({ item, position }, index) => {
          var _a, _b;
          const header = this.header(item.table);
          const row = (_b = (_a = values[index]) == null ? void 0 : _a[0]) != null ? _b : [];
          result[position] = header.map((_, columnIndex) => {
            var _a2;
            return (_a2 = row[columnIndex]) != null ? _a2 : "";
          });
        });
      }
      return result;
    }
    applyBatch(db, batch) {
      const requests = [];
      for (const update of batch.updates) {
        if (dbOf(update.table) !== db) throw new Error(`batch for "${db}" contains ${update.table}`);
        requests.push({
          updateCells: {
            range: {
              sheetId: this.sheetId(update.table),
              startRowIndex: update.rowIndex + 1,
              endRowIndex: update.rowIndex + 2,
              startColumnIndex: 0,
              endColumnIndex: update.row.length
            },
            rows: [{ values: update.row.map(toCell) }],
            fields: "userEnteredValue"
          }
        });
      }
      for (const append of batch.appends) {
        if (dbOf(append.table) !== db) throw new Error(`batch for "${db}" contains ${append.table}`);
        if (append.rows.length === 0) continue;
        requests.push({
          appendCells: {
            sheetId: this.sheetId(append.table),
            rows: append.rows.map((row) => ({ values: row.map(toCell) })),
            fields: "userEnteredValue"
          }
        });
      }
      if (requests.length === 0) return;
      this.runtime.Sheets.Spreadsheets.batchUpdate({ requests }, this.spreadsheetId(db));
    }
  };

  // apps-script/src/schema.ts
  var DEFAULT_ROWS = 1e3;
  function ensureSchema(runtime, store, spec) {
    var _a, _b, _c, _d;
    const createdTables = [];
    const addedColumns = [];
    let checkedTables = 0;
    for (const db of Object.keys(spec.databases)) {
      const sheets = (_a = spec.databases[db]) != null ? _a : {};
      const spreadsheetId = store.spreadsheetId(db);
      const titles = Object.keys(sheets);
      checkedTables += titles.length;
      const meta = runtime.Sheets.Spreadsheets.get(spreadsheetId, {
        fields: "sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))"
      });
      const existing = /* @__PURE__ */ new Map();
      for (const sheet of (_b = meta.sheets) != null ? _b : []) {
        const properties = sheet.properties;
        if ((properties == null ? void 0 : properties.title) !== void 0 && properties.sheetId !== void 0) {
          existing.set(properties.title, {
            sheetId: properties.sheetId,
            columnCount: (_d = (_c = properties.gridProperties) == null ? void 0 : _c.columnCount) != null ? _d : 26
          });
        }
      }
      const missing = titles.filter((title) => !existing.has(title));
      if (missing.length > 0) {
        const response = runtime.Sheets.Spreadsheets.batchUpdate(
          {
            requests: missing.map((title) => {
              var _a2;
              return {
                addSheet: {
                  properties: {
                    title,
                    gridProperties: {
                      rowCount: DEFAULT_ROWS,
                      columnCount: Math.max(((_a2 = sheets[title]) != null ? _a2 : []).length, 1),
                      frozenRowCount: 1
                    }
                  }
                }
              };
            })
          },
          spreadsheetId
        );
        missing.forEach((title, index) => {
          var _a2, _b2, _c2, _d2, _e;
          const sheetId = (_d2 = (_c2 = (_b2 = (_a2 = response.replies) == null ? void 0 : _a2[index]) == null ? void 0 : _b2.addSheet) == null ? void 0 : _c2.properties) == null ? void 0 : _d2.sheetId;
          if (sheetId === void 0) throw new Error(`could not create worksheet ${db}.${title}`);
          existing.set(title, { sheetId, columnCount: Math.max(((_e = sheets[title]) != null ? _e : []).length, 1) });
          createdTables.push(`${db}.${title}`);
        });
      }
      const current = runtime.Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
        ranges: titles.map((title) => `${quoteSheet(title)}!1:1`),
        valueRenderOption: "UNFORMATTED_VALUE",
        majorDimension: "ROWS"
      });
      const requests = [];
      titles.forEach((title, index) => {
        var _a2, _b2, _c2, _d2, _e;
        const wanted = (_a2 = sheets[title]) != null ? _a2 : [];
        const sheet = existing.get(title);
        if (!sheet) return;
        const header = ((_e = (_d2 = (_c2 = (_b2 = current.valueRanges) == null ? void 0 : _b2[index]) == null ? void 0 : _c2.values) == null ? void 0 : _d2[0]) != null ? _e : []).map(toText);
        const isNew = missing.indexOf(title) !== -1;
        const toAdd = wanted.filter((column) => header.indexOf(column) === -1);
        if (toAdd.length > 0) {
          const start = header.length;
          const needed = start + toAdd.length;
          if (needed > sheet.columnCount) {
            requests.push({
              appendDimension: {
                sheetId: sheet.sheetId,
                dimension: "COLUMNS",
                length: needed - sheet.columnCount
              }
            });
          }
          requests.push({
            updateCells: {
              range: {
                sheetId: sheet.sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: start,
                endColumnIndex: needed
              },
              rows: [{ values: toAdd.map(toCell) }],
              fields: "userEnteredValue"
            }
          });
          if (!isNew) for (const column of toAdd) addedColumns.push(`${db}.${title}.${column}`);
        }
        if (isNew) {
          requests.push({
            repeatCell: {
              range: { sheetId: sheet.sheetId },
              cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
              fields: "userEnteredFormat.numberFormat"
            }
          });
          requests.push({
            repeatCell: {
              range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold"
            }
          });
        }
      });
      if (requests.length > 0) runtime.Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheetId);
      store.forgetSheetIds(db);
    }
    return { ok: true, createdTables, addedColumns, checkedTables };
  }

  // apps-script/src/main.ts
  var PROTOCOL_VERSION = 1;
  var MAX_CLOCK_SKEW_MS = 5 * 60 * 1e3;
  var NONCE_TTL_SECONDS = 10 * 60;
  var LOCK_WAIT_MS = 25 * 1e3;
  var SECRET_PROPERTY = "GATEWAY_SHARED_SECRET";
  function failure(code, message, retryable = false) {
    return { ok: false, error: { code, message, retryable } };
  }
  function toHex(bytes) {
    let hex = "";
    for (const byte of bytes) {
      hex += ((byte + 256) % 256).toString(16).padStart(2, "0");
    }
    return hex;
  }
  function constantTimeEquals(a, b) {
    let difference = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
    }
    return difference === 0;
  }
  var UNAUTHORIZED = () => failure("UNAUTHORIZED", "request was not authorised");
  function authenticate(runtime, event) {
    var _a, _b;
    const secret = runtime.PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
    if (!secret) return failure("UNAUTHORIZED", "gateway secret is not configured");
    let body;
    try {
      body = JSON.parse((_b = (_a = event.postData) == null ? void 0 : _a.contents) != null ? _b : "");
    } catch {
      return UNAUTHORIZED();
    }
    if (typeof body.envelope !== "string" || typeof body.sig !== "string") return UNAUTHORIZED();
    const expected = toHex(
      runtime.Utilities.computeHmacSha256Signature(body.envelope, secret, runtime.Utilities.Charset.UTF_8)
    );
    if (!constantTimeEquals(expected, body.sig.toLowerCase())) return UNAUTHORIZED();
    let envelope;
    try {
      envelope = JSON.parse(body.envelope);
    } catch {
      return UNAUTHORIZED();
    }
    if (envelope.v !== PROTOCOL_VERSION) {
      return failure("INVALID_OPERATION", `unsupported protocol version ${String(envelope.v)}`);
    }
    if (typeof envelope.ts !== "number" || Math.abs(Date.now() - envelope.ts) > MAX_CLOCK_SKEW_MS) {
      return UNAUTHORIZED();
    }
    if (typeof envelope.nonce !== "string" || envelope.nonce.length < 16) return UNAUTHORIZED();
    const cache = runtime.CacheService.getScriptCache();
    const nonceKey = `nonce:${envelope.nonce}`;
    if (cache.get(nonceKey)) return UNAUTHORIZED();
    cache.put(nonceKey, "1", NONCE_TTL_SECONDS);
    if (!envelope.spreadsheets || typeof envelope.spreadsheets !== "object") {
      return failure("INVALID_OPERATION", "spreadsheets map is required");
    }
    return envelope;
  }
  function withLock(runtime, task) {
    const lock = runtime.LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      return failure("LOCK_TIMEOUT", "another write is in progress", true);
    }
    try {
      return task();
    } finally {
      lock.releaseLock();
    }
  }
  function ping(runtime, envelope) {
    var _a;
    const spreadsheets = {};
    for (const db of Object.keys(envelope.spreadsheets)) {
      try {
        runtime.Sheets.Spreadsheets.get((_a = envelope.spreadsheets[db]) != null ? _a : "", { fields: "spreadsheetId" });
        spreadsheets[db] = true;
      } catch {
        spreadsheets[db] = false;
      }
    }
    return { ok: true, version: PROTOCOL_VERSION, time: (/* @__PURE__ */ new Date()).toISOString(), spreadsheets };
  }
  function handle(runtime, event) {
    try {
      const envelope = authenticate(runtime, event);
      if ("ok" in envelope) return envelope;
      const store = new SheetsTableStore(runtime, envelope.spreadsheets);
      const env = {
        sha256Hex: (text) => toHex(
          runtime.Utilities.computeDigest(
            runtime.Utilities.DigestAlgorithm.SHA_256,
            text,
            runtime.Utilities.Charset.UTF_8
          )
        )
      };
      switch (envelope.command) {
        case "ping":
          return ping(runtime, envelope);
        case "commit":
          return withLock(runtime, () => executeCommit(store, env, envelope.payload));
        case "ensureSchema":
          return withLock(runtime, () => ensureSchema(runtime, store, envelope.payload));
        default:
          return failure("INVALID_OPERATION", `unknown command "${String(envelope.command)}"`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failure("STORE_ERROR", message, true);
    }
  }
  function globalRuntime() {
    return { Sheets, LockService, Utilities, PropertiesService, CacheService, ContentService };
  }
  function doPost(event) {
    const runtime = globalRuntime();
    return runtime.ContentService.createTextOutput(JSON.stringify(handle(runtime, event))).setMimeType(
      runtime.ContentService.MimeType.JSON
    );
  }
  function doGet() {
    const runtime = globalRuntime();
    return runtime.ContentService.createTextOutput(
      JSON.stringify({ ok: true, service: "TUNS Academic Office Write Gateway", version: PROTOCOL_VERSION })
    ).setMimeType(runtime.ContentService.MimeType.JSON);
  }
  return __toCommonJS(main_exports);
})();

// Apps Script เรียกฟังก์ชันระดับบนสุดเท่านั้น
function doPost(e) {
  return TunsGateway.doPost(e);
}

function doGet(e) {
  return TunsGateway.doGet(e);
}
