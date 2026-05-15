// =============================================================================
// __tests__/unit/storage.test.js
// Sprint 0 単体テスト - ストレージユーティリティ
//
// 対応テストケース: TC_001〜TC_010
// 設計参照:
//   - 02-テスト/04-テストケース.md (test-cases-sprint0-storage.json)
//   - 02-テスト/03-テスト観点.md (IF-SA-001〜010, F-SE-001〜007)
// =============================================================================

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import {
  verifyStorageAPI,
  createStorage,
  saveWithCapacityCheck,
  incrementSaveCount,
  safeStorageOperation,
  loadMeta,
  saveMeta,
} from "../../src/utils/storage.js";
import {
  STORAGE_KEYS,
  STORAGE_WARNING_BYTES,
  STORAGE_BACKUP_SAVE_COUNT,
} from "../../src/utils/constants.js";

// ---------- verifyStorageAPI ----------
describe("verifyStorageAPI (TC_001〜TC_004 / IF-SA-001〜004)", () => {
  let originalGlobals;

  afterEach(() => {
    restoreGlobalStorage(originalGlobals);
  });

  test("TC_001: window.storage が正常動作する場合 'window.storage' を返す", async () => {
    const ws = mockStorage({ available: true });
    originalGlobals = installGlobalStorage({ windowStorage: ws });

    const result = await verifyStorageAPI();
    expect(result).toBe("window.storage");

    // IF-SA-010: テストキーが削除されていることを確認
    expect(await ws.getItem("__test__")).toBeNull();
    expect(await ws.getItem("__capacity_test__")).toBeNull();
  });

  test("TC_002: window.storage 不可で localStorage 利用可能な場合 'localStorage' を返す", async () => {
    const brokenWs = mockStorage({ available: false });
    const ls = mockStorage({ available: true, async: false });
    originalGlobals = installGlobalStorage({ windowStorage: brokenWs, localStorage: ls });

    const result = await verifyStorageAPI();
    expect(result).toBe("localStorage");
    // フォールバック検証キーも削除されている
    expect(ls.getItem("__fb_test__")).toBeNull();
  });

  test("TC_003: window.storage と localStorage 両方不可の場合 'none' を返す (E20)", async () => {
    const brokenWs = mockStorage({ available: false });
    const brokenLs = mockStorage({ available: false, async: false });
    originalGlobals = installGlobalStorage({ windowStorage: brokenWs, localStorage: brokenLs });

    const result = await verifyStorageAPI();
    expect(result).toBe("none");
  });

  test("TC_004: verifyStorageAPI() の 100KB 書き込みテストが成功する", async () => {
    let largestWrite = 0;
    const tracker = mockStorage({ available: true });
    const origSet = tracker.setItem;
    tracker.setItem = async (key, value) => {
      if (key === "__capacity_test__") largestWrite = String(value).length;
      return origSet(key, value);
    };
    originalGlobals = installGlobalStorage({ windowStorage: tracker });

    await expect(verifyStorageAPI()).resolves.toBe("window.storage");
    expect(largestWrite).toBe(100_000);
  });
});

// ---------- saveWithCapacityCheck ----------
describe("saveWithCapacityCheck (TC_005〜TC_007 / F-SE-001, F-SE-002)", () => {
  let storage;
  let showToast;

  beforeEach(async () => {
    storage = createStorage("window.storage");
    showToast = vi.fn();
    const restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    // META 初期化
    await saveMeta(storage, { schemaVersion: "1.0.0", saveCount: 0 });
    return () => restoreGlobalStorage(restored);
  });

  test("TC_005: データ量が 400KB を超えた場合 warning Toast が表示される", async () => {
    const data = "x".repeat(STORAGE_WARNING_BYTES + 1);
    await saveWithCapacityCheck(storage, "test_key", data, showToast);

    expect(showToast).toHaveBeenCalledWith(
      "warning",
      expect.stringContaining("バックアップ")
    );
    // 書き込み自体は成功する
    expect(await storage.getItem("test_key")).toBe(data);
  });

  test("TC_006: データ量が 400KB 以下の場合 warning Toast が表示されない (境界値)", async () => {
    const data = "x".repeat(STORAGE_WARNING_BYTES - 1);
    await saveWithCapacityCheck(storage, "test_key", data, showToast);

    const warningCalls = showToast.mock.calls.filter((c) => c[0] === "warning");
    expect(warningCalls).toHaveLength(0);
  });

  test("TC_007: QuotaExceededError 発生時に error Toast が表示され例外が再スローされる", async () => {
    const restored = installGlobalStorage({
      windowStorage: mockStorage({ available: true, throwOn: "setItem", error: "QuotaExceededError" }),
    });
    const localStorage = createStorage("window.storage");

    await expect(
      saveWithCapacityCheck(localStorage, "test_key", "value", showToast)
    ).rejects.toThrow();

    expect(showToast).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("容量上限")
    );

    restoreGlobalStorage(restored);
  });
});

// ---------- incrementSaveCount ----------
describe("incrementSaveCount (TC_008〜TC_010 / F-SE-006, F-SE-007)", () => {
  let storage;
  let showToast;
  let restored;

  beforeEach(() => {
    storage = createStorage("window.storage");
    showToast = vi.fn();
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });

  afterEach(() => {
    restoreGlobalStorage(restored);
  });

  test("TC_008: 50 回保存時にバックアップ推奨 info Toast が表示される", async () => {
    await saveMeta(storage, { schemaVersion: "1.0.0", saveCount: 49 });

    const newCount = await incrementSaveCount(storage, showToast);

    expect(newCount).toBe(50);
    expect(showToast).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("50回保存")
    );
    const meta = await loadMeta(storage);
    expect(meta.saveCount).toBe(50);
  });

  test("TC_009: 49 回目では Toast が表示されない (境界値)", async () => {
    await saveMeta(storage, { schemaVersion: "1.0.0", saveCount: 48 });

    const newCount = await incrementSaveCount(storage, showToast);

    expect(newCount).toBe(49);
    const infoCalls = showToast.mock.calls.filter((c) => c[0] === "info");
    expect(infoCalls).toHaveLength(0);
    const meta = await loadMeta(storage);
    expect(meta.saveCount).toBe(49);
  });

  test("TC_010: 100 回保存時にも Toast が表示される (50 の倍数)", async () => {
    await saveMeta(storage, { schemaVersion: "1.0.0", saveCount: 99 });

    await incrementSaveCount(storage, showToast);

    expect(showToast).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("100回保存")
    );
  });

  test("補助: saveCount が undefined でも 1 にインクリメントされる", async () => {
    await saveMeta(storage, { schemaVersion: "1.0.0" }); // saveCount 欠落

    const newCount = await incrementSaveCount(storage, showToast);

    expect(newCount).toBe(1);
    const infoCalls = showToast.mock.calls.filter((c) => c[0] === "info");
    expect(infoCalls).toHaveLength(0);
  });
});

// ---------- safeStorageOperation ----------
describe("safeStorageOperation (IF-SA-008)", () => {
  test("成功時は戻り値をそのまま返す", async () => {
    const showToast = vi.fn();
    const result = await safeStorageOperation(async () => "ok", showToast);
    expect(result).toBe("ok");
    expect(showToast).not.toHaveBeenCalled();
  });

  test("QuotaExceededError を error Toast に変換して再スロー", async () => {
    const showToast = vi.fn();
    const operation = async () => {
      const err = new Error("Quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    };
    await expect(safeStorageOperation(operation, showToast)).rejects.toThrow();
    expect(showToast).toHaveBeenCalledWith("error", expect.stringContaining("容量上限"));
  });

  test("汎用エラーは WRITE_FAILED Toast を出して再スロー", async () => {
    const showToast = vi.fn();
    const operation = async () => { throw new Error("Disk full"); };
    await expect(safeStorageOperation(operation, showToast)).rejects.toThrow();
    expect(showToast).toHaveBeenCalledWith("error", expect.stringContaining("保存に失敗"));
  });
});

// ---------- STORAGE_KEYS / 定数 ----------
describe("ストレージキー定義 (IF-SA-005)", () => {
  test("全 STORAGE_KEYS 定数が定義されている (SPEC_ITEM_NOTES を含む)", () => {
    expect(STORAGE_KEYS).toMatchObject({
      META:            "meta",
      COMPANIES:       "companies",
      CATEGORIES:      "categories",
      SPEC_ITEMS:      "spec_items",
      SPEC_ITEM_NOTES: "spec_item_notes",
      MEETINGS:        "meetings",
      DECISIONS:       "decisions",
      CHANGE_LOGS:     "change_logs",
    });
    expect(STORAGE_WARNING_BYTES).toBe(400_000);
    expect(STORAGE_BACKUP_SAVE_COUNT).toBe(50);
  });
});
