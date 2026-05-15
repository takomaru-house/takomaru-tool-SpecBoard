// =============================================================================
// __tests__/unit/migration.test.js
// Sprint 0 単体テスト - スキーママイグレーション
//
// 対応テストケース: TC_011〜TC_017
// 設計参照:
//   - 02-テスト/04-テストケース.md (test-cases-sprint0-migration.json)
//   - 02-テスト/03-テスト観点.md (F-EC-007, F-BR-017, F-BR-018)
// =============================================================================

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import {
  migrateV0toV1,
  runMigrations,
  compareVersion,
} from "../../src/utils/migration.js";
import { createStorage, loadMeta, saveMeta } from "../../src/utils/storage.js";
import { STORAGE_KEYS, SCHEMA_VERSION } from "../../src/utils/constants.js";

// ---------- migrateV0toV1 ----------
describe("migrateV0toV1 (TC_011〜TC_015 / F-EC-007)", () => {

  test("TC_011: normalizedName が存在しない Category に name.trim().toLowerCase() の値が追加される", async () => {
    const v0Data = {
      categories: [{ id: "c1", name: "  断熱  " }],
      spec_items: [],
    };
    const result = await migrateV0toV1(v0Data);
    expect(result.categories[0].normalizedName).toBe("断熱");
  });

  test("TC_012: 既存の normalizedName は上書きされない", async () => {
    const v0Data = {
      categories: [{ id: "c1", name: "断熱", normalizedName: "existing" }],
      spec_items: [],
    };
    const result = await migrateV0toV1(v0Data);
    expect(result.categories[0].normalizedName).toBe("existing");
  });

  test("TC_013: sortOrder が存在しない SpecItem にインデックス番号が付与される", async () => {
    const v0Data = {
      categories: [],
      spec_items: [
        { id: "s1", name: "項目A" },
        { id: "s2", name: "項目B" },
        { id: "s3", name: "項目C" },
      ],
    };
    const result = await migrateV0toV1(v0Data);
    expect(result.spec_items[0].sortOrder).toBe(0);
    expect(result.spec_items[1].sortOrder).toBe(1);
    expect(result.spec_items[2].sortOrder).toBe(2);
  });

  test("TC_013 補助: 既存の sortOrder は上書きされない", async () => {
    const v0Data = {
      categories: [],
      spec_items: [
        { id: "s1", name: "項目A", sortOrder: 99 },
        { id: "s2", name: "項目B" },
      ],
    };
    const result = await migrateV0toV1(v0Data);
    expect(result.spec_items[0].sortOrder).toBe(99);
    expect(result.spec_items[1].sortOrder).toBe(1);
  });

  test("TC_014: categories が空配列でもエラーにならない", async () => {
    const v0Data = { categories: [], spec_items: [] };
    await expect(migrateV0toV1(v0Data)).resolves.not.toThrow();
    const result = await migrateV0toV1(v0Data);
    expect(result.categories).toEqual([]);
    expect(result.spec_items).toEqual([]);
  });

  test("TC_015: spec_items が undefined でもエラーにならない (Nullish coalescing)", async () => {
    const v0Data = { categories: [] }; // spec_items 欠落
    await expect(migrateV0toV1(v0Data)).resolves.not.toThrow();
    const result = await migrateV0toV1(v0Data);
    expect(result.spec_items).toEqual([]);
  });

  test("補助: categories と spec_items 両方が undefined でもエラーにならない", async () => {
    const v0Data = {};
    await expect(migrateV0toV1(v0Data)).resolves.not.toThrow();
    const result = await migrateV0toV1(v0Data);
    expect(result.categories).toEqual([]);
    expect(result.spec_items).toEqual([]);
  });

  test("補助: Category の name が undefined でも例外にならず空文字で正規化される", async () => {
    const v0Data = { categories: [{ id: "c1" }], spec_items: [] };
    const result = await migrateV0toV1(v0Data);
    expect(result.categories[0].normalizedName).toBe("");
  });

  test("補助: 大文字小文字混在の name が小文字に正規化される (E6)", async () => {
    const v0Data = {
      categories: [{ id: "c1", name: "Heat Insulation" }],
      spec_items: [],
    };
    const result = await migrateV0toV1(v0Data);
    expect(result.categories[0].normalizedName).toBe("heat insulation");
  });
});

// ---------- compareVersion ----------
describe("compareVersion (補助ユーティリティ)", () => {
  test("同一バージョンで 0 を返す", () => {
    expect(compareVersion("1.0.0", "1.0.0")).toBe(0);
  });
  test("小さい方が負の値を返す", () => {
    expect(compareVersion("0.0.0", "1.0.0")).toBeLessThan(0);
    expect(compareVersion("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersion("1.0.0", "1.1.0")).toBeLessThan(0);
  });
  test("大きい方が正の値を返す", () => {
    expect(compareVersion("2.0.0", "1.0.0")).toBeGreaterThan(0);
  });
});

// ---------- runMigrations ----------
describe("runMigrations (TC_016, TC_017 / F-BR-017, F-BR-018)", () => {
  let storage;
  let restored;

  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });

  afterEach(() => {
    restoreGlobalStorage(restored);
  });

  test("TC_016: schemaVersion が一致している場合マイグレーションをスキップする", async () => {
    await saveMeta(storage, { schemaVersion: SCHEMA_VERSION, saveCount: 0 });
    const migrateSpy = vi.fn();

    const ran = await runMigrations(storage, migrateSpy);

    expect(ran).toBe(false);
    expect(migrateSpy).not.toHaveBeenCalled();
  });

  test("TC_017: マイグレーション完了後に schemaVersion と migratedAt が META に保存される", async () => {
    await saveMeta(storage, { schemaVersion: "0.0.0", saveCount: 0 });
    // v0 形式の Category データを投入
    await storage.setItem(
      STORAGE_KEYS.CATEGORIES,
      JSON.stringify([{ id: "c1", name: "断熱" }])
    );

    const ran = await runMigrations(storage);
    expect(ran).toBe(true);

    const meta = await loadMeta(storage);
    expect(meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(meta.migratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // データが実際にマイグレーションされていることを確認
    const cats = JSON.parse(await storage.getItem(STORAGE_KEYS.CATEGORIES));
    expect(cats[0].normalizedName).toBe("断熱");
  });

  test("補助: 起動時 meta なしでも例外にならず初期マイグレーションが動く", async () => {
    // meta 未保存の状態 (新規ユーザー)
    const ran = await runMigrations(storage);
    expect(ran).toBe(true);

    const meta = await loadMeta(storage);
    expect(meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  test("補助: マイグレーション中に Spy が path 名と data を受け取る", async () => {
    await saveMeta(storage, { schemaVersion: "0.0.0", saveCount: 0 });
    const migrateSpy = vi.fn();

    await runMigrations(storage, migrateSpy);

    expect(migrateSpy).toHaveBeenCalledWith("0.0.0->1.0.0", expect.any(Object));
  });
});
