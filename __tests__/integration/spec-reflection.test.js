// =============================================================================
// __tests__/integration/spec-reflection.test.js
// Sprint 4 結合テスト - reflectToSpec アトミック処理
//
// 対応テストケース: TC_080 (正常系), TC_081 (失敗時ロールバック), TC_082 (後勝ち)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";
import { reflectToSpec } from "../../src/utils/specReflection.js";
import {
  createSpecItem, saveSpecItems, loadSpecItems, setSpecValue,
} from "../../src/utils/specItem.js";
import { loadChangeLogs, saveChangeLogs } from "../../src/utils/changeLog.js";

describe("reflectToSpec - 正常系 (TC_080)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_080: SpecItem と ChangeLog が同時に保存される", async () => {
    const item = createSpecItem({ name: "断熱材", categoryId: "c1" }, 0);
    await saveSpecItems(storage, [item]);

    const decision = {
      specItemId: item.id,
      specCompanyId: "co1",
      specValue: "GW 24K",
      meetingId: "m1",
    };

    const { specItem, changeLog } = await reflectToSpec(storage, decision, "確定");

    // 戻り値の検証
    expect(specItem.values).toHaveLength(1);
    expect(specItem.values[0]).toMatchObject({
      companyId: "co1", value: "GW 24K", meetingId: "m1",
    });
    expect(changeLog).toMatchObject({
      specItemId: item.id, companyId: "co1",
      previousValue: "", newValue: "GW 24K",
      meetingId: "m1", reason: "確定",
    });

    // ストレージから読み直しても反映されている
    const itemsAfter = await loadSpecItems(storage);
    expect(itemsAfter[0].values).toHaveLength(1);
    expect(itemsAfter[0].values[0].value).toBe("GW 24K");

    const logsAfter = await loadChangeLogs(storage);
    expect(logsAfter).toHaveLength(1);
    expect(logsAfter[0].newValue).toBe("GW 24K");
  });

  test("既存値がある場合は previousValue に旧値が記録される", async () => {
    const item = setSpecValue(
      createSpecItem({ name: "x", categoryId: "c1" }, 0),
      "co1", "旧値"
    );
    await saveSpecItems(storage, [item]);
    const { changeLog } = await reflectToSpec(storage, {
      specItemId: item.id, specCompanyId: "co1", specValue: "新値",
    });
    expect(changeLog.previousValue).toBe("旧値");
    expect(changeLog.newValue).toBe("新値");
  });

  test("reason 省略時は ChangeLog.reason が undefined", async () => {
    const item = createSpecItem({ name: "x", categoryId: "c1" }, 0);
    await saveSpecItems(storage, [item]);
    const { changeLog } = await reflectToSpec(storage, {
      specItemId: item.id, specCompanyId: "co1", specValue: "v",
    });
    expect(changeLog.reason).toBeUndefined();
  });

  test("specItemId が存在しないとエラー", async () => {
    await saveSpecItems(storage, []);
    await expect(reflectToSpec(storage, {
      specItemId: "nonexistent", specCompanyId: "co1", specValue: "x",
    })).rejects.toThrow(/SpecItem not found/);
  });

  test("specItemId / specCompanyId 未指定でエラー", async () => {
    await expect(reflectToSpec(storage, { specCompanyId: "co1", specValue: "x" }))
      .rejects.toThrow(/specItemId/);
    await expect(reflectToSpec(storage, { specItemId: "s1", specValue: "x" }))
      .rejects.toThrow(/specCompanyId/);
  });
});

describe("reflectToSpec - 失敗時ロールバック (TC_081 / E12)", () => {
  let storage;
  let realWindowStorage;
  let restored;

  beforeEach(() => {
    realWindowStorage = mockStorage({ available: true });
    restored = installGlobalStorage({ windowStorage: realWindowStorage });
    storage = createStorage("window.storage");
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_081: SpecItem 保存失敗時 → SpecItem は変更されず ChangeLog も保存されない", async () => {
    const item = createSpecItem({ name: "x", categoryId: "c1" }, 0);
    await saveSpecItems(storage, [item]);
    const itemsBefore = await loadSpecItems(storage);
    const logsBefore = await loadChangeLogs(storage);

    // SpecItem 保存だけを失敗させるストレージ
    const failStorage = {
      getItem: async (key) => realWindowStorage.getItem(key),
      setItem: async (key, value) => {
        if (key === STORAGE_KEYS.SPEC_ITEMS) throw new Error("simulated SPEC_ITEMS failure");
        return realWindowStorage.setItem(key, value);
      },
      removeItem: async (key) => realWindowStorage.removeItem(key),
    };

    await expect(reflectToSpec(failStorage, {
      specItemId: item.id, specCompanyId: "co1", specValue: "x",
    })).rejects.toThrow(/SPEC_ITEMS failure/);

    // SpecItem は元のまま (まだ updated されていない)
    expect(await loadSpecItems(storage)).toEqual(itemsBefore);
    // ChangeLog も保存されていない
    expect(await loadChangeLogs(storage)).toEqual(logsBefore);
  });

  test("ChangeLog 保存失敗時 → SpecItem がロールバックされ ChangeLog も保存されない", async () => {
    const item = createSpecItem({ name: "x", categoryId: "c1" }, 0);
    await saveSpecItems(storage, [item]);
    const itemsBefore = await loadSpecItems(storage);

    // ChangeLog 保存だけ失敗させる
    const failStorage = {
      getItem: async (key) => realWindowStorage.getItem(key),
      setItem: async (key, value) => {
        if (key === STORAGE_KEYS.CHANGE_LOGS) throw new Error("simulated CHANGE_LOGS failure");
        return realWindowStorage.setItem(key, value);
      },
      removeItem: async (key) => realWindowStorage.removeItem(key),
    };

    await expect(reflectToSpec(failStorage, {
      specItemId: item.id, specCompanyId: "co1", specValue: "x",
    })).rejects.toThrow(/CHANGE_LOGS failure/);

    // SpecItem がロールバックされている
    expect(await loadSpecItems(storage)).toEqual(itemsBefore);
    // ChangeLog も保存されていない
    expect(await loadChangeLogs(storage)).toEqual([]);
  });

  test("失敗時に specReflectionPhase が例外に付与される", async () => {
    const item = createSpecItem({ name: "x", categoryId: "c1" }, 0);
    await saveSpecItems(storage, [item]);

    const failStorage = {
      getItem: async (key) => realWindowStorage.getItem(key),
      setItem: async (key, value) => {
        if (key === STORAGE_KEYS.CHANGE_LOGS) throw new Error("fail");
        return realWindowStorage.setItem(key, value);
      },
      removeItem: async (key) => realWindowStorage.removeItem(key),
    };

    try {
      await reflectToSpec(failStorage, {
        specItemId: item.id, specCompanyId: "co1", specValue: "x",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.specReflectionPhase).toBe("changeLog");
    }
  });
});

describe("reflectToSpec - 後勝ちルール (TC_082 / E2)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_082: 同一打ち合わせ・同一 SpecItem を2回更新すると ChangeLog が 2 件記録される", async () => {
    const item = createSpecItem({ name: "断熱材", categoryId: "c1" }, 0);
    await saveSpecItems(storage, [item]);

    await reflectToSpec(storage, {
      specItemId: item.id, specCompanyId: "co1", specValue: "v1", meetingId: "m1",
    }, "1回目");
    await reflectToSpec(storage, {
      specItemId: item.id, specCompanyId: "co1", specValue: "v2", meetingId: "m1",
    }, "2回目");

    const logs = await loadChangeLogs(storage);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ previousValue: "", newValue: "v1", reason: "1回目" });
    expect(logs[1]).toMatchObject({ previousValue: "v1", newValue: "v2", reason: "2回目" });

    // SpecItem 側は最終値 (後勝ち)
    const items = await loadSpecItems(storage);
    expect(items[0].values.find((v) => v.companyId === "co1").value).toBe("v2");
    // 同一 companyId の値が重複追加されていない
    expect(items[0].values).toHaveLength(1);
  });
});
