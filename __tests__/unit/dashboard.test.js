// =============================================================================
// __tests__/unit/dashboard.test.js
// Sprint 5 単体テスト - ダッシュボード集計
//
// 対応テストケース: TC_100 (サマリー数値) / TC_102 (E13 判定)
// =============================================================================

import { describe, test, expect } from "vitest";
import {
  computeSummary,
  hasActiveCandidates,
  recentMeetings,
  recentDecisions,
  pendingActions,
} from "../../src/utils/dashboard.js";

const co = (id, status, deletedAt = undefined) => ({
  id, name: `${id}社`, status,
  contact: "x", type: "maker", createdAt: "x",
  ...(deletedAt && { deletedAt }),
});

describe("computeSummary (TC_100)", () => {
  test("4種サマリー数値が実データと一致する", () => {
    const result = computeSummary({
      companies: [
        co("a", "considering"),
        co("b", "considering"),
        co("c", "candidate"),
        co("d", "rejected"),
        co("e", "contracted"),
        co("f", "considering", "2026-01-01"), // 論理削除は除外
      ],
      meetings: [
        { id: "m1", createdAt: "x" },
        { id: "m2", createdAt: "y" },
        { id: "m3", deletedAt: "z", createdAt: "z" },
      ],
      decisions: [
        { id: "d1", status: "pending" },
        { id: "d2", status: "pending" },
        { id: "d3", status: "confirmed" },
        { id: "d4", status: "cancelled" },
        { id: "d5", status: "pending", deletedAt: "x" },
      ],
    });
    expect(result.considering).toBe(2);
    expect(result.candidate).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.contracted).toBe(1);
    expect(result.meetingCount).toBe(2);
    expect(result.pendingCount).toBe(2);
    expect(result.activeCompanyCount).toBe(5);
  });

  test("空入力で全 0 を返す", () => {
    const result = computeSummary({});
    expect(result.considering).toBe(0);
    expect(result.candidate).toBe(0);
    expect(result.meetingCount).toBe(0);
    expect(result.pendingCount).toBe(0);
  });
});

describe("hasActiveCandidates (TC_102 / E13)", () => {
  test("considering または candidate があれば true", () => {
    expect(hasActiveCandidates([co("a", "considering")])).toBe(true);
    expect(hasActiveCandidates([co("a", "candidate")])).toBe(true);
  });

  test("全社が rejected/contracted/cancelled/論理削除 のみで false (E13)", () => {
    expect(hasActiveCandidates([
      co("a", "rejected"),
      co("b", "contracted"),
      co("c", "considering", "2026-01-01"), // 削除済み
    ])).toBe(false);
  });

  test("0件で false", () => {
    expect(hasActiveCandidates([])).toBe(false);
  });
});

describe("recentMeetings", () => {
  test("日付降順で limit 件を返す + 削除済み除外", () => {
    const list = [
      { id: "m1", date: "2026-01-01", createdAt: "1" },
      { id: "m2", date: "2026-03-01", createdAt: "3" },
      { id: "m3", date: "2026-02-01", createdAt: "2", deletedAt: "x" },
      { id: "m4", date: "2026-04-01", createdAt: "4" },
      { id: "m5", date: "2026-05-01", createdAt: "5" },
      { id: "m6", date: "2026-06-01", createdAt: "6" },
    ];
    const result = recentMeetings(list, 3);
    expect(result.map((m) => m.id)).toEqual(["m6", "m5", "m4"]);
  });

  test("デフォルト limit は 5", () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`, date: `2026-01-${String(i + 1).padStart(2, "0")}`, createdAt: `${i}`,
    }));
    expect(recentMeetings(list)).toHaveLength(5);
  });
});

describe("recentDecisions", () => {
  test("createdAt 降順で limit 件 + 削除済み除外", () => {
    const list = [
      { id: "d1", createdAt: "2026-01-01" },
      { id: "d2", createdAt: "2026-03-01" },
      { id: "d3", createdAt: "2026-02-01", deletedAt: "x" },
      { id: "d4", createdAt: "2026-04-01" },
    ];
    const result = recentDecisions(list, 2);
    expect(result.map((d) => d.id)).toEqual(["d4", "d2"]);
  });
});

describe("pendingActions", () => {
  test("有効 pending のみを createdAt 降順で返す", () => {
    const list = [
      { id: "d1", status: "pending", createdAt: "1" },
      { id: "d2", status: "confirmed", createdAt: "2" },
      { id: "d3", status: "pending", createdAt: "3" },
      { id: "d4", status: "pending", createdAt: "4", deletedAt: "x" },
    ];
    expect(pendingActions(list).map((d) => d.id)).toEqual(["d3", "d1"]);
  });
});
