// =============================================================================
// __tests__/unit/category.test.js
// Sprint 2 単体テスト - Category バリデーション & 操作
//
// 対応テストケース: TC_040 / F-EC-007, F-SC-001, F-BR-010
// =============================================================================

import { describe, test, expect } from "vitest";
import {
  validateCategory,
  isDuplicateCategoryName,
  normalizeCategoryName,
  createCategory,
  updateCategory,
  softDeleteCategory,
  filterActiveCategories,
  nextSortOrder,
  CATEGORY_VALIDATION,
} from "../../src/utils/category.js";

describe("normalizeCategoryName", () => {
  test("前後空白を除去し小文字化する", () => {
    expect(normalizeCategoryName("  断熱  ")).toBe("断熱");
    expect(normalizeCategoryName("Heat Insulation")).toBe("heat insulation");
  });
  test("null / undefined / 空文字を許容する", () => {
    expect(normalizeCategoryName(null)).toBe("");
    expect(normalizeCategoryName(undefined)).toBe("");
    expect(normalizeCategoryName("")).toBe("");
  });
});

describe("validateCategory (TC_040 / F-BR-010)", () => {
  test("空文字でエラー", () => {
    expect(validateCategory({ name: "" }, [])).toHaveProperty("name");
    expect(validateCategory({ name: "   " }, [])).toHaveProperty("name");
  });

  test("30 文字 OK / 31 文字 NG (境界値)", () => {
    expect(validateCategory({ name: "あ".repeat(30) }, [])).not.toHaveProperty("name");
    expect(validateCategory({ name: "あ".repeat(31) }, [])).toHaveProperty("name");
  });

  test("TC_040: 既存と大小区別なしで重複検出する", () => {
    const existing = [{ id: "c1", normalizedName: "断熱" }];
    expect(validateCategory({ name: "断熱" }, existing)).toHaveProperty("name");
    expect(validateCategory({ name: "断熱 " }, existing)).toHaveProperty("name");
    expect(validateCategory({ name: "  断熱" }, existing)).toHaveProperty("name");
  });

  test("TC_040 補助: 英字大小区別なしで重複検出", () => {
    const existing = [{ id: "c1", normalizedName: "kitchen" }];
    expect(validateCategory({ name: "Kitchen" }, existing)).toHaveProperty("name");
    expect(validateCategory({ name: "KITCHEN" }, existing)).toHaveProperty("name");
  });

  test("論理削除済みは重複扱いしない", () => {
    const existing = [
      { id: "c1", normalizedName: "断熱", deletedAt: "2026-01-01T00:00:00Z" },
    ];
    expect(validateCategory({ name: "断熱" }, existing)).not.toHaveProperty("name");
  });

  test("excludeId 指定時は自分自身を重複扱いしない (編集ケース)", () => {
    const existing = [{ id: "c1", normalizedName: "断熱" }];
    expect(validateCategory({ name: "断熱" }, existing, "c1")).not.toHaveProperty("name");
    expect(validateCategory({ name: "断熱" }, existing, "c2")).toHaveProperty("name");
  });

  test("異なる名前なら通過", () => {
    const existing = [{ id: "c1", normalizedName: "断熱" }];
    expect(validateCategory({ name: "構造" }, existing)).toEqual({});
  });
});

describe("isDuplicateCategoryName", () => {
  test("既存名と一致で true", () => {
    expect(isDuplicateCategoryName("断熱", [{ normalizedName: "断熱" }])).toBe(true);
  });
  test("空文字は false", () => {
    expect(isDuplicateCategoryName("", [{ normalizedName: "断熱" }])).toBe(false);
  });
});

describe("createCategory", () => {
  test("name から normalizedName を生成し sortOrder を設定", () => {
    const c = createCategory({ name: "  外装  " }, 5);
    expect(c.id).toBeTruthy();
    expect(c.name).toBe("外装");
    expect(c.normalizedName).toBe("外装");
    expect(c.sortOrder).toBe(5);
    expect(c.isDefault).toBe(false);
    expect(c.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(c.deletedAt).toBeUndefined();
  });
});

describe("updateCategory", () => {
  test("name 更新で normalizedName も更新される", () => {
    const original = createCategory({ name: "旧名" });
    const updated = updateCategory(original, { name: "新名" });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.name).toBe("新名");
    expect(updated.normalizedName).toBe("新名");
  });
});

describe("softDeleteCategory", () => {
  test("deletedAt が ISO 文字列で付与される", () => {
    const c = createCategory({ name: "削除対象" });
    const deleted = softDeleteCategory(c);
    expect(deleted.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(deleted.id).toBe(c.id);
  });
});

describe("filterActiveCategories", () => {
  test("削除済みを除外し sortOrder 順に並べる", () => {
    const list = [
      { id: "a", name: "A", sortOrder: 2 },
      { id: "b", name: "B", sortOrder: 0, deletedAt: "2026-01-01T00:00:00Z" },
      { id: "c", name: "C", sortOrder: 1 },
    ];
    const result = filterActiveCategories(list);
    expect(result.map((c) => c.id)).toEqual(["c", "a"]);
  });
});

describe("nextSortOrder", () => {
  test("空配列で 0 を返す", () => {
    expect(nextSortOrder([])).toBe(0);
  });
  test("最大値 + 1 を返す", () => {
    expect(nextSortOrder([{ sortOrder: 2 }, { sortOrder: 5 }, { sortOrder: 1 }])).toBe(6);
  });
});

describe("CATEGORY_VALIDATION 定数", () => {
  test("Spec.md §4-1 の上限値が反映されている", () => {
    expect(CATEGORY_VALIDATION.name.maxLength).toBe(30);
  });
});
