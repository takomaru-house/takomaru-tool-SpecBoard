// =============================================================================
// __tests__/unit/changeLog.test.js
// Sprint 2 単体テスト - ChangeLog 基本I/O
//
// 設計参照: docs/Spec.md §3-2 (ChangeLog), §3-4 (削除不可)
// 関連: F-BR-007 (削除不可・改ざん防止), F-CL-001/002
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import {
  buildChangeLog,
  appendChangeLog,
  loadChangeLogs,
  sortChangeLogsDesc,
  latestChangeLog,
} from "../../src/utils/changeLog.js";
import * as changeLogModule from "../../src/utils/changeLog.js";

describe("buildChangeLog", () => {
  test("必要フィールドが揃った ChangeLog を生成", () => {
    const log = buildChangeLog({
      specItemId: "s1", companyId: "co1",
      previousValue: "旧", newValue: "新",
      meetingId: "m1", reason: "確定",
    });
    expect(log.id).toBeTruthy();
    expect(log.specItemId).toBe("s1");
    expect(log.companyId).toBe("co1");
    expect(log.previousValue).toBe("旧");
    expect(log.newValue).toBe("新");
    expect(log.meetingId).toBe("m1");
    expect(log.reason).toBe("確定");
    expect(log.changedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(log.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("meetingId / reason は省略可 (undefined のまま)", () => {
    const log = buildChangeLog({
      specItemId: "s1", companyId: "co1",
      previousValue: "x", newValue: "y",
    });
    expect(log.meetingId).toBeUndefined();
    expect(log.reason).toBeUndefined();
  });

  test("previousValue / newValue が null でも空文字に正規化", () => {
    const log = buildChangeLog({
      specItemId: "s1", companyId: "co1",
      previousValue: null, newValue: null,
    });
    expect(log.previousValue).toBe("");
    expect(log.newValue).toBe("");
  });

  test("deletedAt フィールドは存在しない (削除不可)", () => {
    const log = buildChangeLog({
      specItemId: "s1", companyId: "co1",
      previousValue: "x", newValue: "y",
    });
    expect(log).not.toHaveProperty("deletedAt");
  });
});

describe("F-BR-007: 削除APIが存在しないこと", () => {
  test("changeLog モジュールに deleteChangeLog 系の関数が存在しない", () => {
    const exports = Object.keys(changeLogModule);
    const forbidden = exports.filter((k) => /delete|remove/i.test(k));
    expect(forbidden).toEqual([]);
  });
});

describe("appendChangeLog / loadChangeLogs", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("空ストレージから loadChangeLogs で []", async () => {
    expect(await loadChangeLogs(storage)).toEqual([]);
  });

  test("appendChangeLog で末尾追記される", async () => {
    const a = buildChangeLog({ specItemId: "s1", companyId: "co1", previousValue: "", newValue: "v1" });
    const b = buildChangeLog({ specItemId: "s1", companyId: "co1", previousValue: "v1", newValue: "v2" });
    await appendChangeLog(storage, a);
    await appendChangeLog(storage, b);
    const list = await loadChangeLogs(storage);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
  });

  test("E2 後勝ち: 同一 (specItemId, companyId) への複数追記で2件記録される", async () => {
    await appendChangeLog(storage, buildChangeLog({
      specItemId: "s1", companyId: "co1", previousValue: "", newValue: "v1", meetingId: "m1",
    }));
    await appendChangeLog(storage, buildChangeLog({
      specItemId: "s1", companyId: "co1", previousValue: "v1", newValue: "v2", meetingId: "m1",
    }));
    const list = await loadChangeLogs(storage);
    const related = list.filter((l) => l.specItemId === "s1" && l.companyId === "co1");
    expect(related).toHaveLength(2);
  });
});

describe("sortChangeLogsDesc / latestChangeLog", () => {
  const logs = [
    { id: "a", specItemId: "s1", companyId: "co1", changedAt: "2026-01-01T00:00:00Z" },
    { id: "b", specItemId: "s1", companyId: "co1", changedAt: "2026-03-01T00:00:00Z" },
    { id: "c", specItemId: "s1", companyId: "co1", changedAt: "2026-02-01T00:00:00Z" },
    { id: "d", specItemId: "s2", companyId: "co1", changedAt: "2026-04-01T00:00:00Z" },
  ];

  test("sortChangeLogsDesc: changedAt 降順", () => {
    const sorted = sortChangeLogsDesc(logs);
    expect(sorted.map((l) => l.id)).toEqual(["d", "b", "c", "a"]);
  });

  test("元配列を変更しない (不変)", () => {
    const original = [...logs];
    sortChangeLogsDesc(logs);
    expect(logs).toEqual(original);
  });

  test("latestChangeLog: 指定 specItemId+companyId の最新を返す", () => {
    expect(latestChangeLog(logs, "s1", "co1").id).toBe("b");
    expect(latestChangeLog(logs, "s2", "co1").id).toBe("d");
    expect(latestChangeLog(logs, "s9", "co9")).toBeUndefined();
  });
});
