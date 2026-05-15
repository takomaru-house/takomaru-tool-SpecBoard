// =============================================================================
// __tests__/integration/spec.test.js
// Sprint 2 結合テスト - SpecItem / Category / SpecValue ストレージ往復
//
// 対応テストケース:
//   TC_045 (並び替えがリロード後も保持される / F-SC-011)
//   TC_046 補助 (SpecItemNote 永続化)
//   F-BR-003 (Category 論理削除時、SpecItem は影響を受けない)
//   F-BR-004 (SpecItem 論理削除時、SpecValue / ChangeLog 保持)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";
import {
  createCategory, saveCategories, loadCategories, softDeleteCategoryById,
} from "../../src/utils/category.js";
import {
  createSpecItem, saveSpecItems, loadSpecItems, moveSpecItem,
  softDeleteSpecItemById, setSpecValue, replaceSpecItem,
  specItemsByCategory,
} from "../../src/utils/specItem.js";
import {
  upsertSpecItemNote, loadSpecItemNotes,
} from "../../src/utils/specItemNote.js";
import {
  appendChangeLog, buildChangeLog, loadChangeLogs,
} from "../../src/utils/changeLog.js";

describe("Sprint 2 結合: SpecItem 並び替え永続化 (TC_045 / F-SC-011)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_045: moveSpecItem の結果を保存し、再 load しても順序が保持される", async () => {
    const cat = createCategory({ name: "断熱" }, 0);
    await saveCategories(storage, [cat]);
    const items = [
      createSpecItem({ name: "断熱工法", categoryId: cat.id }, 0),
      createSpecItem({ name: "断熱材の種類", categoryId: cat.id }, 1),
      createSpecItem({ name: "UA値", categoryId: cat.id }, 2),
    ];
    await saveSpecItems(storage, items);

    // 2 番目 (断熱材の種類) を上に移動
    const target = items[1];
    const reordered = moveSpecItem(items, target.id, "up");
    await saveSpecItems(storage, reordered);

    // 新しい storage インスタンス (= リロード相当) で読み直す
    const storage2 = createStorage("window.storage");
    const loaded = await loadSpecItems(storage2);
    const sorted = specItemsByCategory(loaded, cat.id);
    expect(sorted.map((i) => i.name)).toEqual(["断熱材の種類", "断熱工法", "UA値"]);
  });

  test("複数回の並び替えが累積される", async () => {
    const cat = createCategory({ name: "C" }, 0);
    await saveCategories(storage, [cat]);
    const items = [
      createSpecItem({ name: "A", categoryId: cat.id }, 0),
      createSpecItem({ name: "B", categoryId: cat.id }, 1),
      createSpecItem({ name: "C", categoryId: cat.id }, 2),
    ];
    await saveSpecItems(storage, items);

    // B を上 → A B C → B A C
    let current = await loadSpecItems(storage);
    let target = current.find((i) => i.name === "B");
    current = moveSpecItem(current, target.id, "up");
    await saveSpecItems(storage, current);

    // C を上 → B A C → B C A
    current = await loadSpecItems(storage);
    target = current.find((i) => i.name === "C");
    current = moveSpecItem(current, target.id, "up");
    await saveSpecItems(storage, current);

    const loaded = await loadSpecItems(storage);
    expect(specItemsByCategory(loaded, cat.id).map((i) => i.name)).toEqual(["B", "C", "A"]);
  });
});

describe("Sprint 2 結合: SpecValue setSpecValue + ストレージ往復", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社の値を保存・再 load で取得できる", async () => {
    const cat = createCategory({ name: "断熱" }, 0);
    const item = createSpecItem({ name: "断熱材", categoryId: cat.id }, 0);
    await saveCategories(storage, [cat]);
    await saveSpecItems(storage, [item]);

    const updated = setSpecValue(item, "co1", "GW 16K", "m1");
    await replaceSpecItem(storage, updated);

    const loaded = await loadSpecItems(storage);
    const reloaded = loaded.find((i) => i.id === item.id);
    expect(reloaded.values).toHaveLength(1);
    expect(reloaded.values[0]).toMatchObject({ companyId: "co1", value: "GW 16K", meetingId: "m1" });
  });

  test("同じ companyId への更新で値が置き換わる (E2 後勝ち)", async () => {
    const item = createSpecItem({ name: "x", categoryId: "c1" }, 0);
    let updated = setSpecValue(item, "co1", "v1");
    await saveSpecItems(storage, [updated]);
    updated = setSpecValue(updated, "co1", "v2");
    await saveSpecItems(storage, [updated]);

    const loaded = await loadSpecItems(storage);
    const v = loaded[0].values.find((v) => v.companyId === "co1");
    expect(v.value).toBe("v2");
    expect(loaded[0].values).toHaveLength(1); // 重複追加されない
  });
});

describe("Sprint 2 結合: 削除ポリシー連鎖 (F-BR-003, F-BR-004)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("Category 論理削除しても SpecItem.categoryId は保持される", async () => {
    const cat = createCategory({ name: "断熱" }, 0);
    const item = createSpecItem({ name: "断熱材", categoryId: cat.id }, 0);
    await saveCategories(storage, [cat]);
    await saveSpecItems(storage, [item]);

    await softDeleteCategoryById(storage, cat.id);

    const items = await loadSpecItems(storage);
    expect(items[0].categoryId).toBe(cat.id); // 参照は維持される
    expect(items[0].deletedAt).toBeUndefined(); // SpecItem 自体は削除されない
  });

  test("SpecItem 論理削除しても SpecValue (item.values) と ChangeLog は保持される", async () => {
    const item = createSpecItem({ name: "x", categoryId: "c1" }, 0);
    const withValue = setSpecValue(item, "co1", "値1");
    await saveSpecItems(storage, [withValue]);
    await appendChangeLog(storage, buildChangeLog({
      specItemId: withValue.id, companyId: "co1",
      previousValue: "", newValue: "値1",
    }));

    await softDeleteSpecItemById(storage, withValue.id);

    const items = await loadSpecItems(storage);
    const target = items.find((i) => i.id === withValue.id);
    expect(target.deletedAt).toBeTruthy();
    expect(target.values).toHaveLength(1); // SpecValue は保持
    const logs = await loadChangeLogs(storage);
    expect(logs).toHaveLength(1); // ChangeLog は保持
  });
});

describe("Sprint 2 結合: SpecItemNote ストレージ往復 (TC_046 補助)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("複数の (specItemId, companyId) 組み合わせを個別に保持できる", async () => {
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co1", note: "A" });
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co2", note: "B" });
    await upsertSpecItemNote(storage, { specItemId: "s2", companyId: "co1", note: "C" });

    const storage2 = createStorage("window.storage");
    const loaded = await loadSpecItemNotes(storage2);
    expect(loaded).toHaveLength(3);
    const notes = loaded.map((n) => `${n.specItemId}-${n.companyId}-${n.note}`).sort();
    expect(notes).toEqual(["s1-co1-A", "s1-co2-B", "s2-co1-C"]);
  });
});

describe("Sprint 2 結合: ChangeLog 改ざん防止 (F-BR-007)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("ChangeLog は appendChangeLog 経由でのみ追加される (削除APIなし)", async () => {
    const log = buildChangeLog({
      specItemId: "s1", companyId: "co1", previousValue: "x", newValue: "y",
    });
    await appendChangeLog(storage, log);
    const loaded = await loadChangeLogs(storage);
    expect(loaded).toHaveLength(1);

    // 「削除関数」が src/utils/changeLog.js に存在しないことは
    // __tests__/unit/changeLog.test.js で検証済み
  });
});
