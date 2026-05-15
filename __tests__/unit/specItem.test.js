// =============================================================================
// __tests__/unit/specItem.test.js
// Sprint 2 単体テスト - SpecItem & SpecValue 操作
//
// 対応テストケース: TC_041〜TC_044 (moveSpecItem), TC_045 (永続化は IT)
// =============================================================================

import { describe, test, expect } from "vitest";
import {
  createSpecItem,
  updateSpecItem,
  softDeleteSpecItem,
  validateSpecItem,
  validateSpecValue,
  moveSpecItem,
  specItemsByCategory,
  getSpecValue,
  setSpecValue,
  nextSortOrderForCategory,
  SPEC_ITEM_VALIDATION,
} from "../../src/utils/specItem.js";

describe("validateSpecItem (F-VL-018, F-VL-019)", () => {
  test("name 空でエラー", () => {
    expect(validateSpecItem({ name: "", categoryId: "c1" })).toHaveProperty("name");
  });
  test("name 50 文字 OK / 51 文字 NG (境界値)", () => {
    expect(validateSpecItem({ name: "あ".repeat(50), categoryId: "c1" })).not.toHaveProperty("name");
    expect(validateSpecItem({ name: "あ".repeat(51), categoryId: "c1" })).toHaveProperty("name");
  });
  test("categoryId 未指定でエラー", () => {
    expect(validateSpecItem({ name: "ABC" })).toHaveProperty("categoryId");
  });
  test("正常値で errors なし", () => {
    expect(validateSpecItem({ name: "断熱材", categoryId: "c1" })).toEqual({});
  });
});

describe("validateSpecValue (F-VL-020 / DT-BV-005)", () => {
  test("200 文字 OK / 201 文字 NG (境界値)", () => {
    expect(validateSpecValue("a".repeat(200))).not.toHaveProperty("value");
    expect(validateSpecValue("a".repeat(201))).toHaveProperty("value");
  });
  test("undefined / null は OK", () => {
    expect(validateSpecValue(undefined)).toEqual({});
    expect(validateSpecValue(null)).toEqual({});
  });
});

describe("createSpecItem / updateSpecItem / softDeleteSpecItem", () => {
  test("createSpecItem は新規 ID + createdAt + 空 values を持つ", () => {
    const item = createSpecItem({ name: "断熱材", categoryId: "c1" }, 3);
    expect(item.id).toBeTruthy();
    expect(item.name).toBe("断熱材");
    expect(item.categoryId).toBe("c1");
    expect(item.sortOrder).toBe(3);
    expect(item.values).toEqual([]);
    expect(item.deletedAt).toBeUndefined();
  });

  test("updateSpecItem は id / createdAt / values を維持し name のみ書き換える", () => {
    const original = createSpecItem({ name: "旧名", categoryId: "c1" });
    original.values = [{ companyId: "co1", value: "GW", updatedAt: "x" }];
    const updated = updateSpecItem(original, { name: "新名" });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.name).toBe("新名");
    expect(updated.values).toEqual(original.values);
    expect(updated.categoryId).toBe("c1");
  });

  test("softDeleteSpecItem は deletedAt を ISO 文字列で付与", () => {
    const item = createSpecItem({ name: "削除対象", categoryId: "c1" });
    const deleted = softDeleteSpecItem(item);
    expect(deleted.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("moveSpecItem (TC_041〜TC_044 / F-SC-010)", () => {
  const items = [
    { id: "a", categoryId: "c1", sortOrder: 0, name: "A" },
    { id: "b", categoryId: "c1", sortOrder: 1, name: "B" },
    { id: "c", categoryId: "c1", sortOrder: 2, name: "C" },
  ];

  test("TC_041: 上に移動すると対象と1つ上の sortOrder が入れ替わる", () => {
    const result = moveSpecItem(items, "b", "up");
    const sorted = [...result].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  test("TC_042: 下に移動すると対象と1つ下の sortOrder が入れ替わる", () => {
    const result = moveSpecItem(items, "b", "down");
    const sorted = [...result].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted.map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  test("TC_043: 先頭要素を上に移動しても元配列を返す", () => {
    const result = moveSpecItem(items, "a", "up");
    expect(result).toBe(items); // 同一参照で返却
  });

  test("末尾要素を下に移動しても元配列を返す", () => {
    const result = moveSpecItem(items, "c", "down");
    expect(result).toBe(items);
  });

  test("TC_044: 存在しないIDを指定した場合、元の配列を返す", () => {
    const result = moveSpecItem(items, "NONEXISTENT", "up");
    expect(result).toBe(items);
  });

  test("元配列を変更しない (不変性)", () => {
    const original = JSON.parse(JSON.stringify(items));
    moveSpecItem(items, "b", "up");
    expect(items).toEqual(original);
  });

  test("異カテゴリの項目とは入れ替わらない", () => {
    const mixed = [
      { id: "a", categoryId: "c1", sortOrder: 0 },
      { id: "x", categoryId: "c2", sortOrder: 1 }, // 別カテゴリ
      { id: "b", categoryId: "c1", sortOrder: 2 },
    ];
    const result = moveSpecItem(mixed, "b", "up");
    // b は a と入れ替わる (異カテゴリの x は無視)
    expect(result.find((i) => i.id === "a").sortOrder).toBe(2);
    expect(result.find((i) => i.id === "b").sortOrder).toBe(0);
    expect(result.find((i) => i.id === "x").sortOrder).toBe(1);
  });

  test("削除済み項目は並び替え対象外", () => {
    const withDeleted = [
      { id: "a", categoryId: "c1", sortOrder: 0 },
      { id: "del", categoryId: "c1", sortOrder: 1, deletedAt: "2026-01-01" },
      { id: "b", categoryId: "c1", sortOrder: 2 },
    ];
    const result = moveSpecItem(withDeleted, "b", "up");
    // b は (削除済 del をスキップして) a と入れ替わる
    expect(result.find((i) => i.id === "a").sortOrder).toBe(2);
    expect(result.find((i) => i.id === "b").sortOrder).toBe(0);
  });

  test("空配列でもエラーにならない", () => {
    expect(() => moveSpecItem([], "a", "up")).not.toThrow();
    expect(moveSpecItem([], "a", "up")).toEqual([]);
  });
});

describe("specItemsByCategory", () => {
  test("指定カテゴリの有効項目を sortOrder 順で返す", () => {
    const items = [
      { id: "a", categoryId: "c1", sortOrder: 2 },
      { id: "b", categoryId: "c2", sortOrder: 0 },
      { id: "c", categoryId: "c1", sortOrder: 1, deletedAt: "2026-01-01" },
      { id: "d", categoryId: "c1", sortOrder: 0 },
    ];
    const result = specItemsByCategory(items, "c1");
    expect(result.map((i) => i.id)).toEqual(["d", "a"]);
  });
});

describe("getSpecValue / setSpecValue", () => {
  test("getSpecValue: 既存値を返す / 存在しなければ undefined", () => {
    const item = {
      id: "s1", values: [
        { companyId: "co1", value: "GW", updatedAt: "x" },
      ],
    };
    expect(getSpecValue(item, "co1").value).toBe("GW");
    expect(getSpecValue(item, "co2")).toBeUndefined();
  });

  test("setSpecValue: 新規値を追加する (不変)", () => {
    const item = { id: "s1", values: [] };
    const updated = setSpecValue(item, "co1", "GW 16K");
    expect(item.values).toEqual([]); // 元配列は変更されない
    expect(updated.values).toHaveLength(1);
    expect(updated.values[0]).toMatchObject({ companyId: "co1", value: "GW 16K" });
    expect(updated.values[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("setSpecValue: 既存値を置換する (不変)", () => {
    const item = {
      id: "s1", values: [
        { companyId: "co1", value: "旧値", updatedAt: "x" },
        { companyId: "co2", value: "他社値", updatedAt: "y" },
      ],
    };
    const updated = setSpecValue(item, "co1", "新値", "m1");
    expect(updated.values.find((v) => v.companyId === "co1").value).toBe("新値");
    expect(updated.values.find((v) => v.companyId === "co1").meetingId).toBe("m1");
    expect(updated.values.find((v) => v.companyId === "co2").value).toBe("他社値"); // 他社は維持
  });
});

describe("nextSortOrderForCategory", () => {
  test("カテゴリ内が空なら 0", () => {
    expect(nextSortOrderForCategory([], "c1")).toBe(0);
    expect(nextSortOrderForCategory([{ categoryId: "c2", sortOrder: 5 }], "c1")).toBe(0);
  });
  test("カテゴリ内の最大値 + 1", () => {
    const items = [
      { categoryId: "c1", sortOrder: 0 },
      { categoryId: "c1", sortOrder: 3 },
      { categoryId: "c2", sortOrder: 99 }, // 別カテゴリは無視
    ];
    expect(nextSortOrderForCategory(items, "c1")).toBe(4);
  });
});

describe("SPEC_ITEM_VALIDATION 定数", () => {
  test("Spec.md §4-1 の上限値", () => {
    expect(SPEC_ITEM_VALIDATION.name.maxLength).toBe(50);
    expect(SPEC_ITEM_VALIDATION.value.maxLength).toBe(200);
  });
});
