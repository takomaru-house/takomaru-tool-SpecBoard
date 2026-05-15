// =============================================================================
// __tests__/unit/decision.test.js
// Sprint 3 単体テスト - Decision バリデーション & 操作
//
// 対応テストケース: TC_068 (ステータス変更) / F-VL-015〜017, F-MT-013
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import {
  validateDecision,
  createDecision,
  updateDecision,
  changeDecisionStatus,
  softDeleteDecision,
  filterActiveDecisions,
  decisionsByMeeting,
  pendingDecisions,
  loadDecisions,
  saveDecisions,
  appendDecision,
  replaceDecision,
  deleteDecision,
  DECISION_VALIDATION,
  DECISION_STATUSES,
} from "../../src/utils/decision.js";

describe("validateDecision (F-VL-015〜017)", () => {
  const base = { meetingId: "m1", content: "決定内容" };

  test("content 空でエラー", () => {
    expect(validateDecision({ ...base, content: "" })).toHaveProperty("content");
    expect(validateDecision({ ...base, content: "  " })).toHaveProperty("content");
  });

  test("content 1000 文字 OK / 1001 文字 NG (境界値)", () => {
    expect(validateDecision({ ...base, content: "a".repeat(1000) })).not.toHaveProperty("content");
    expect(validateDecision({ ...base, content: "a".repeat(1001) })).toHaveProperty("content");
  });

  test("specValue 200 文字 OK / 201 文字 NG", () => {
    expect(validateDecision({ ...base, specValue: "a".repeat(200) })).not.toHaveProperty("specValue");
    expect(validateDecision({ ...base, specValue: "a".repeat(201) })).toHaveProperty("specValue");
  });

  test("note 500 文字 OK / 501 文字 NG", () => {
    expect(validateDecision({ ...base, note: "a".repeat(500) })).not.toHaveProperty("note");
    expect(validateDecision({ ...base, note: "a".repeat(501) })).toHaveProperty("note");
  });

  test("status が範囲外でエラー", () => {
    expect(validateDecision({ ...base, status: "invalid" })).toHaveProperty("status");
  });

  test("有効な status は通過", () => {
    DECISION_STATUSES.forEach((s) => {
      expect(validateDecision({ ...base, status: s })).not.toHaveProperty("status");
    });
  });

  test("meetingId 未指定でエラー", () => {
    expect(validateDecision({ content: "x" })).toHaveProperty("meetingId");
  });

  test("最小入力 (meetingId+content) で errors なし", () => {
    expect(validateDecision(base)).toEqual({});
  });
});

describe("createDecision / updateDecision", () => {
  test("createDecision: 必須フィールド + デフォルトステータス pending", () => {
    const d = createDecision({ meetingId: "m1", content: "決定" });
    expect(d.id).toBeTruthy();
    expect(d.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d.meetingId).toBe("m1");
    expect(d.content).toBe("決定");
    expect(d.status).toBe("pending");
    expect(d.specItemId).toBeUndefined();
  });

  test("createDecision: 仕様反映フィールドが保存される", () => {
    const d = createDecision({
      meetingId: "m1", content: "断熱材変更",
      specItemId: "s1", specCompanyId: "co1", specValue: "GW 24K",
      note: "確定済み", status: "confirmed",
    });
    expect(d.specItemId).toBe("s1");
    expect(d.specCompanyId).toBe("co1");
    expect(d.specValue).toBe("GW 24K");
    expect(d.note).toBe("確定済み");
    expect(d.status).toBe("confirmed");
  });

  test("updateDecision: id / createdAt / meetingId 維持", () => {
    const original = createDecision({ meetingId: "m1", content: "旧" });
    const updated = updateDecision(original, {
      content: "新", status: "confirmed", note: "メモ",
    });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.meetingId).toBe("m1");
    expect(updated.content).toBe("新");
    expect(updated.status).toBe("confirmed");
    expect(updated.note).toBe("メモ");
  });
});

describe("changeDecisionStatus (TC_068)", () => {
  test("TC_068: pending → confirmed に変更", () => {
    const d = createDecision({ meetingId: "m1", content: "x", status: "pending" });
    const next = changeDecisionStatus(d, "confirmed");
    expect(next.status).toBe("confirmed");
    expect(next.id).toBe(d.id);
  });

  test("pending → cancelled", () => {
    const d = createDecision({ meetingId: "m1", content: "x" });
    expect(changeDecisionStatus(d, "cancelled").status).toBe("cancelled");
  });

  test("不正なステータスで例外", () => {
    const d = createDecision({ meetingId: "m1", content: "x" });
    expect(() => changeDecisionStatus(d, "invalid")).toThrow();
  });

  test("元オブジェクトは変更されない (不変)", () => {
    const d = createDecision({ meetingId: "m1", content: "x", status: "pending" });
    changeDecisionStatus(d, "confirmed");
    expect(d.status).toBe("pending");
  });
});

describe("補助フィルタ", () => {
  const list = [
    { id: "d1", meetingId: "m1", status: "pending", content: "x" },
    { id: "d2", meetingId: "m1", status: "confirmed", content: "y" },
    { id: "d3", meetingId: "m2", status: "pending", content: "z" },
    { id: "d4", meetingId: "m1", status: "cancelled", content: "w", deletedAt: "x" },
  ];

  test("filterActiveDecisions: 削除済み除外", () => {
    expect(filterActiveDecisions(list).map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  test("decisionsByMeeting: meetingId で絞り込み + 削除済み除外", () => {
    expect(decisionsByMeeting(list, "m1").map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(decisionsByMeeting(list, "m2").map((d) => d.id)).toEqual(["d3"]);
  });

  test("pendingDecisions: 有効かつ pending のみ", () => {
    expect(pendingDecisions(list).map((d) => d.id)).toEqual(["d1", "d3"]);
  });
});

describe("Storage I/O", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("append → load 往復", async () => {
    const d = createDecision({ meetingId: "m1", content: "x" });
    await appendDecision(storage, d);
    const list = await loadDecisions(storage);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(d.id);
  });

  test("replaceDecision で更新", async () => {
    const d = createDecision({ meetingId: "m1", content: "旧" });
    await appendDecision(storage, d);
    const updated = updateDecision(d, { content: "新" });
    await replaceDecision(storage, updated);
    const list = await loadDecisions(storage);
    expect(list[0].content).toBe("新");
    expect(list[0].id).toBe(d.id);
  });

  test("deleteDecision で物理削除", async () => {
    const d = createDecision({ meetingId: "m1", content: "x" });
    await appendDecision(storage, d);
    await deleteDecision(storage, d.id);
    expect(await loadDecisions(storage)).toEqual([]);
  });
});

describe("DECISION_VALIDATION / DECISION_STATUSES 定数", () => {
  test("Spec.md §4-1 の上限値", () => {
    expect(DECISION_VALIDATION.content.maxLength).toBe(1000);
    expect(DECISION_VALIDATION.specValue.maxLength).toBe(200);
    expect(DECISION_VALIDATION.note.maxLength).toBe(500);
  });

  test("3 種のステータスが定義されている", () => {
    expect(DECISION_STATUSES.sort()).toEqual(["cancelled", "confirmed", "pending"]);
  });
});
