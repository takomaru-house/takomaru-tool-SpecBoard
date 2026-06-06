// =============================================================================
// __tests__/unit/defaultTemplate.test.js
// F-SC-015 / F-SC-016 — 標準テンプレートの初期構築と差分補填ロジック
//
// 対応テストケース:
//   TC_048  (初回起動時の11カテゴリ・58項目投入)
//   TC_048b (旧5カテゴリ状態への差分補填)
//   TC_048c (冪等性: 全件揃った状態で再実行しても 0 件)
// =============================================================================

import { describe, test, expect } from "vitest";
import {
  DEFAULT_TEMPLATE,
  buildInitialTemplate,
  applyMissingDefaultTemplate,
} from "../../src/utils/defaultTemplate.js";

const NOW = "2026-06-06T00:00:00.000Z";

describe("DEFAULT_TEMPLATE 定義", () => {
  test("11 カテゴリ・合計 58 項目で構成される", () => {
    expect(DEFAULT_TEMPLATE).toHaveLength(11);
    const totalItems = DEFAULT_TEMPLATE.reduce((sum, c) => sum + c.items.length, 0);
    expect(totalItems).toBe(58);
  });

  test("カテゴリ順序が仕様書 4-11 と一致する", () => {
    expect(DEFAULT_TEMPLATE.map((t) => t.category)).toEqual([
      "コスト", "設計・間取り", "断熱", "省エネ・環境", "開口部（窓）",
      "構造", "設備（水回り）", "空調・電気", "外装・内装",
      "保証・アフターサービス", "会社情報",
    ]);
  });

  test("コストカテゴリの先頭項目は「坪単価」である", () => {
    const cost = DEFAULT_TEMPLATE.find((t) => t.category === "コスト");
    expect(cost.items[0]).toBe("坪単価");
  });
});

describe("buildInitialTemplate (TC_048 / F-SC-015)", () => {
  test("空状態から 11 カテゴリ・58 項目を生成する", () => {
    const { categories, specItems } = buildInitialTemplate({ now: NOW });
    expect(categories).toHaveLength(11);
    expect(specItems).toHaveLength(58);
  });

  test("生成された全カテゴリの isDefault=true / createdAt が同一", () => {
    const { categories } = buildInitialTemplate({ now: NOW });
    for (const c of categories) {
      expect(c.isDefault).toBe(true);
      expect(c.createdAt).toBe(NOW);
      expect(c.normalizedName).toBe(c.name.trim().toLowerCase());
    }
  });

  test("各 SpecItem の categoryId がいずれかの Category.id に紐づく", () => {
    const { categories, specItems } = buildInitialTemplate({ now: NOW });
    const ids = new Set(categories.map((c) => c.id));
    for (const item of specItems) {
      expect(ids.has(item.categoryId)).toBe(true);
    }
  });

  test("各カテゴリ内の sortOrder が 0 から連番", () => {
    const { categories, specItems } = buildInitialTemplate({ now: NOW });
    for (const cat of categories) {
      const items = specItems.filter((i) => i.categoryId === cat.id).sort((a, b) => a.sortOrder - b.sortOrder);
      items.forEach((item, idx) => expect(item.sortOrder).toBe(idx));
    }
  });
});

// 旧バージョンの 5 カテゴリ + 旧項目を再現するヘルパー
function buildLegacyData() {
  const legacy = [
    { name: "断熱", items: ["断熱工法", "断熱材の種類", "断熱等性能等級（UA値）", "床断熱材"] },
    { name: "開口部（窓）", items: ["サッシの種類", "ガラスの種類", "玄関ドアの種類"] },
    { name: "構造", items: ["工法", "耐震等級", "基礎の種類", "地盤保証"] },
    { name: "設備（水回り）", items: ["キッチン", "浴室", "洗面台", "トイレ"] },
    { name: "保証・アフターサービス", items: ["初期保証年数", "長期保証の条件", "定期点検の頻度"] },
  ];
  const categories = [];
  const specItems = [];
  legacy.forEach((l, catIdx) => {
    const catId = `legacy-cat-${catIdx}`;
    categories.push({
      id: catId,
      name: l.name,
      normalizedName: l.name.trim().toLowerCase(),
      sortOrder: catIdx,
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    l.items.forEach((itemName, itemIdx) => {
      specItems.push({
        id: `legacy-item-${catIdx}-${itemIdx}`,
        categoryId: catId,
        name: itemName,
        sortOrder: itemIdx,
        values: [{ companyId: "co1", value: "既存値", updatedAt: "2026-02-01T00:00:00.000Z" }],
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });
  });
  return { categories, specItems };
}

describe("applyMissingDefaultTemplate (TC_048b / F-SC-016)", () => {
  test("旧 5 カテゴリ状態に新規 6 カテゴリと不足項目が末尾追加される", () => {
    const { categories, specItems } = buildLegacyData();
    const result = applyMissingDefaultTemplate(categories, specItems, { now: NOW });

    expect(result.addedCategories).toBe(6);
    expect(result.addedItems).toBeGreaterThan(0);
    expect(result.categories).toHaveLength(11);

    // 新規カテゴリ名チェック
    const newCategoryNames = result.categories.slice(5).map((c) => c.name);
    expect(newCategoryNames).toEqual(
      expect.arrayContaining(["コスト", "設計・間取り", "省エネ・環境", "空調・電気", "外装・内装", "会社情報"])
    );
  });

  test("既存カテゴリの id / sortOrder / 既存項目の id・values が保持される", () => {
    const { categories, specItems } = buildLegacyData();
    const result = applyMissingDefaultTemplate(categories, specItems, { now: NOW });

    const insulation = result.categories.find((c) => c.name === "断熱");
    expect(insulation.id).toBe("legacy-cat-0");
    expect(insulation.sortOrder).toBe(0);

    const existingItem = result.specItems.find((i) => i.id === "legacy-item-0-0");
    expect(existingItem.values).toEqual([
      { companyId: "co1", value: "既存値", updatedAt: "2026-02-01T00:00:00.000Z" },
    ]);
  });

  test("「断熱」カテゴリに C値（気密性能）など不足項目が追加される", () => {
    const { categories, specItems } = buildLegacyData();
    const result = applyMissingDefaultTemplate(categories, specItems, { now: NOW });

    const insulation = result.categories.find((c) => c.name === "断熱");
    const itemNames = result.specItems
      .filter((i) => i.categoryId === insulation.id)
      .map((i) => i.name);
    expect(itemNames).toContain("C値（気密性能）");
    expect(itemNames).toContain("壁断熱材");
    expect(itemNames).toContain("天井・屋根断熱材");
    // 既存項目もそのまま残る
    expect(itemNames).toContain("断熱工法");
    expect(itemNames).toContain("断熱材の種類");
  });

  test("「構造」カテゴリにシロアリ保証・制震装置が追加される", () => {
    const { categories, specItems } = buildLegacyData();
    const result = applyMissingDefaultTemplate(categories, specItems, { now: NOW });

    const structure = result.categories.find((c) => c.name === "構造");
    const itemNames = result.specItems
      .filter((i) => i.categoryId === structure.id)
      .map((i) => i.name);
    expect(itemNames).toContain("シロアリ保証");
    expect(itemNames).toContain("制震装置");
  });
});

describe("applyMissingDefaultTemplate 冪等性 (TC_048c)", () => {
  test("初期テンプレート直後に呼ぶと addedCategories=0 / addedItems=0", () => {
    const { categories, specItems } = buildInitialTemplate({ now: NOW });
    const result = applyMissingDefaultTemplate(categories, specItems, { now: NOW });
    expect(result.addedCategories).toBe(0);
    expect(result.addedItems).toBe(0);
    expect(result.categories).toHaveLength(11);
  });

  test("2 回連続で呼んでも結果は変わらない", () => {
    let { categories, specItems } = buildInitialTemplate({ now: NOW });
    const r1 = applyMissingDefaultTemplate(categories, specItems, { now: NOW });
    const r2 = applyMissingDefaultTemplate(r1.categories, r1.specItems, { now: NOW });
    expect(r1.addedCategories).toBe(0);
    expect(r2.addedCategories).toBe(0);
    expect(r1.specItems).toHaveLength(r2.specItems.length);
  });
});

describe("applyMissingDefaultTemplate 削除済みデータの扱い", () => {
  test("deletedAt 付きカテゴリは未存在として扱われ、新規カテゴリが作成される", () => {
    const deletedCategory = {
      id: "deleted-cost",
      name: "コスト",
      normalizedName: "コスト",
      sortOrder: 0,
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-02T00:00:00.000Z",
    };
    const result = applyMissingDefaultTemplate([deletedCategory], [], { now: NOW });

    // 11 カテゴリ全て新規追加されること
    expect(result.addedCategories).toBe(11);

    const activeCost = result.categories.find((c) => c.name === "コスト" && !c.deletedAt);
    expect(activeCost).toBeDefined();
    expect(activeCost.id).not.toBe("deleted-cost");

    // 削除済みカテゴリは残る (復活させない)
    const deletedStill = result.categories.find((c) => c.id === "deleted-cost");
    expect(deletedStill).toBeDefined();
    expect(deletedStill.deletedAt).toBeDefined();
  });

  test("deletedAt 付き仕様項目は未存在として扱われ、新規項目が同名で追加される", () => {
    const { categories } = buildInitialTemplate({ now: NOW });
    const costCat = categories.find((c) => c.name === "コスト");
    const deletedItem = {
      id: "deleted-tsubo",
      categoryId: costCat.id,
      name: "坪単価",
      sortOrder: 0,
      values: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-02T00:00:00.000Z",
    };
    // 「コスト」だけ残し、その下に削除済み「坪単価」だけある状態を作る
    const specItemsBase = [deletedItem];
    const result = applyMissingDefaultTemplate([costCat], specItemsBase, { now: NOW });

    // コスト下の「坪単価」が再作成される
    const items = result.specItems.filter((i) => i.categoryId === costCat.id && !i.deletedAt);
    const tsubo = items.find((i) => i.name === "坪単価");
    expect(tsubo).toBeDefined();
    expect(tsubo.id).not.toBe("deleted-tsubo");
  });
});
