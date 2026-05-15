// =============================================================================
// __tests__/unit/specReflection.test.js
// Sprint 4 単体テスト - computeNewSpecItem / canReflect
//
// 関連 TC: TC_080 補助 (pure computation), TC_081 補助
// =============================================================================

import { describe, test, expect } from "vitest";
import { computeNewSpecItem, canReflect } from "../../src/utils/specReflection.js";

describe("computeNewSpecItem", () => {
  test("新規 SpecValue を追加して新オブジェクトを返す (不変)", () => {
    const item = { id: "s1", name: "断熱材", values: [] };
    const decision = { specCompanyId: "co1", specValue: "GW 16K", meetingId: "m1" };
    const next = computeNewSpecItem(item, decision);
    expect(next).not.toBe(item);
    expect(item.values).toEqual([]); // 元は変更されない
    expect(next.values).toHaveLength(1);
    expect(next.values[0]).toMatchObject({ companyId: "co1", value: "GW 16K", meetingId: "m1" });
  });

  test("既存の同一 companyId 値を置換", () => {
    const item = {
      id: "s1", name: "x",
      values: [
        { companyId: "co1", value: "旧", updatedAt: "x" },
        { companyId: "co2", value: "他社", updatedAt: "y" },
      ],
    };
    const next = computeNewSpecItem(item, { specCompanyId: "co1", specValue: "新", meetingId: "m1" });
    expect(next.values.find((v) => v.companyId === "co1").value).toBe("新");
    expect(next.values.find((v) => v.companyId === "co2").value).toBe("他社");
    expect(next.values).toHaveLength(2);
  });

  test("meetingId が undefined でも OK", () => {
    const item = { id: "s1", values: [] };
    const next = computeNewSpecItem(item, { specCompanyId: "co1", specValue: "x" });
    expect(next.values[0].meetingId).toBeUndefined();
  });
});

describe("canReflect", () => {
  test("3 つすべてあれば true", () => {
    expect(canReflect({ specItemId: "s1", specCompanyId: "co1", specValue: "x" })).toBe(true);
    expect(canReflect({ specItemId: "s1", specCompanyId: "co1", specValue: "" })).toBe(true); // 空文字も値とみなす
  });

  test("どれか欠ければ false", () => {
    expect(canReflect({ specCompanyId: "co1", specValue: "x" })).toBe(false);
    expect(canReflect({ specItemId: "s1", specValue: "x" })).toBe(false);
    expect(canReflect({ specItemId: "s1", specCompanyId: "co1" })).toBe(false);
  });

  test("null/undefined セーフ", () => {
    expect(canReflect(null)).toBe(false);
    expect(canReflect(undefined)).toBe(false);
    expect(canReflect({})).toBe(false);
  });
});
