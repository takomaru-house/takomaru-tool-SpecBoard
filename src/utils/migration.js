// =============================================================================
// src/utils/migration.js
// スキーママイグレーション (app.jsx の Section 2 後半に対応するテスト用モジュール)
// 設計参照: docs/Spec.md §3-6
// 対応テストケース: TC_011〜TC_017
// =============================================================================

import { STORAGE_KEYS, SCHEMA_VERSION } from "./constants.js";
import { loadMeta, saveMeta } from "./storage.js";

/**
 * migrateV0toV1
 * - Category に normalizedName を追加 (name.trim().toLowerCase())
 *   既存の normalizedName は上書きしない (?? を使用)
 * - SpecItem に sortOrder を追加 (配列インデックス)
 *   既存の sortOrder は上書きしない
 * - categories / spec_items が undefined でも安全に動作
 *
 * 対応 TC: TC_011〜TC_015 / F-EC-007
 */
export async function migrateV0toV1(data) {
  const categories = (data.categories ?? []).map((c) => ({
    ...c,
    normalizedName: c.normalizedName ?? (c.name ?? "").trim().toLowerCase(),
  }));
  const specItems = (data.spec_items ?? []).map((s, i) => ({
    ...s,
    sortOrder: s.sortOrder ?? i,
  }));
  return { ...data, categories, spec_items: specItems };
}

export const MIGRATIONS = {
  "0.0.0->1.0.0": migrateV0toV1,
};

/** "1.0.0" 形式の semver 比較 (-1/0/1) */
export function compareVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export async function loadAllKnownEntities(storage) {
  const result = {};
  for (const key of Object.values(STORAGE_KEYS)) {
    if (key === STORAGE_KEYS.META) continue;
    const raw = await storage.getItem(key);
    if (raw) {
      try { result[key] = JSON.parse(raw); } catch { /* ignore */ }
    }
  }
  return result;
}

export async function persistAllEntities(storage, data) {
  for (const [key, value] of Object.entries(data)) {
    if (key === STORAGE_KEYS.META) continue;
    if (value !== undefined) {
      await storage.setItem(key, JSON.stringify(value));
    }
  }
}

/**
 * runMigrations
 * - schemaVersion が SCHEMA_VERSION 未満の場合のみ実行
 * - 完了後に schemaVersion と migratedAt を META に保存
 *
 * @param {Object} storage  Storage 抽象 (getItem/setItem/removeItem)
 * @param {Function} [migrateSpy] テスト用フック (各マイグレーション実行時に呼ぶ)
 * @returns {Promise<boolean>} 実際にマイグレーションを実行した場合 true
 *
 * 対応 TC: TC_016, TC_017 / F-BR-017, F-BR-018
 */
export async function runMigrations(storage, migrateSpy = null) {
  const meta = await loadMeta(storage);
  const current = meta.schemaVersion || "0.0.0";
  if (compareVersion(current, SCHEMA_VERSION) >= 0) {
    return false;
  }

  let data = await loadAllKnownEntities(storage);
  for (const [path, fn] of Object.entries(MIGRATIONS)) {
    const [from, to] = path.split("->");
    if (compareVersion(current, from) <= 0 && compareVersion(to, SCHEMA_VERSION) <= 0) {
      migrateSpy?.(path, data);
      data = await fn(data);
    }
  }
  await persistAllEntities(storage, data);
  await saveMeta(storage, {
    ...meta,
    schemaVersion: SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
  });
  return true;
}
