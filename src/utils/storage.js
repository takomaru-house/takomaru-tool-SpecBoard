// =============================================================================
// src/utils/storage.js
// ストレージユーティリティ (app.jsx の Section 2 に対応するテスト用モジュール)
// 設計参照: docs/Spec.md §2-2
// 対応テストケース: TC_001〜TC_010
// =============================================================================

import {
  STORAGE_KEYS,
  STORAGE_WARNING_BYTES,
  STORAGE_BACKUP_SAVE_COUNT,
  StorageError,
} from "./constants.js";

/**
 * verifyStorageAPI: window.storage の利用可否を確認し、フォールバック先を返す
 *
 * 戻り値: "window.storage" | "localStorage" | "none"
 * 副作用: 検証用キー (__test__, __capacity_test__, __fb_test__) を一時的に書き込み・削除する
 *
 * 対応 TC: TC_001〜TC_004 / IF-SA-001〜004
 */
export async function verifyStorageAPI() {
  try {
    await window.storage.setItem("__test__", JSON.stringify({ ok: true }));
    const result = await window.storage.getItem("__test__");
    const parsed = JSON.parse(result);
    await window.storage.removeItem("__test__");

    if (parsed && parsed.ok) {
      // 100KB 容量テスト
      const dummy = "x".repeat(100_000);
      await window.storage.setItem("__capacity_test__", dummy);
      await window.storage.removeItem("__capacity_test__");
      return "window.storage";
    }
    throw new Error("window.storage 検証失敗");
  } catch (e) {
    try {
      localStorage.setItem("__fb_test__", "1");
      localStorage.removeItem("__fb_test__");
      return "localStorage";
    } catch (e2) {
      return "none";
    }
  }
}

/**
 * storage 抽象化ファクトリ: モードに応じた読み書きインターフェースを返す
 * テスト時はモードを直接指定できる
 */
export function createStorage(mode) {
  return {
    getItem: async (key) => {
      if (mode === "window.storage") return window.storage.getItem(key);
      if (mode === "localStorage")   return localStorage.getItem(key);
      return null;
    },
    setItem: async (key, value) => {
      if (mode === "window.storage") return window.storage.setItem(key, value);
      if (mode === "localStorage")   return localStorage.setItem(key, value);
      throw new Error(StorageError.STORAGE_UNAVAILABLE);
    },
    removeItem: async (key) => {
      if (mode === "window.storage") return window.storage.removeItem(key);
      if (mode === "localStorage")   return localStorage.removeItem(key);
    },
  };
}

/**
 * safeStorageOperation: ストレージ操作を try/catch で囲み、エラー種別に応じた Toast を出す
 */
export async function safeStorageOperation(operation, showToast) {
  try {
    return await operation();
  } catch (e) {
    if (e && e.name === "QuotaExceededError") {
      showToast?.("error", StorageError.QUOTA_EXCEEDED);
    } else if (e && /unavailable/i.test(e.message || "")) {
      showToast?.("error", StorageError.STORAGE_UNAVAILABLE);
    } else {
      showToast?.("error", StorageError.WRITE_FAILED);
    }
    throw e;
  }
}

export async function loadMeta(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.META);
  if (!raw) return { schemaVersion: "0.0.0", saveCount: 0 };
  try {
    return JSON.parse(raw);
  } catch {
    return { schemaVersion: "0.0.0", saveCount: 0 };
  }
}

export async function saveMeta(storage, meta) {
  await storage.setItem(STORAGE_KEYS.META, JSON.stringify(meta));
}

export async function loadEntities(storage, key) {
  const raw = await storage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * saveWithCapacityCheck: 容量警告 + 書き込み + saveCount インクリメント
 * 対応 TC: TC_005, TC_006, TC_007 / F-SE-001, F-SE-002
 */
export async function saveWithCapacityCheck(storage, key, data, showToast) {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  if (str.length > STORAGE_WARNING_BYTES) {
    showToast?.("warning",
      "データ量が多くなっています。JSONエクスポートでバックアップを推奨します。");
  }
  await safeStorageOperation(() => storage.setItem(key, str), showToast);
  await incrementSaveCount(storage, showToast);
}

/**
 * incrementSaveCount: META.saveCount を 1 増やし、50 の倍数で info Toast を出す
 * 対応 TC: TC_008, TC_009, TC_010 / F-SE-006, F-SE-007
 */
export async function incrementSaveCount(storage, showToast) {
  const meta = await loadMeta(storage);
  const count = (meta.saveCount ?? 0) + 1;
  await saveMeta(storage, { ...meta, saveCount: count });
  if (count > 0 && count % STORAGE_BACKUP_SAVE_COUNT === 0) {
    showToast?.("info",
      `${count}回保存しました。JSONエクスポートでバックアップをお勧めします。`);
  }
  return count;
}
