// =============================================================================
// src/utils/exportImport.js
// JSON エクスポート / インポート (アトミック + ID 衝突解決 + プロトタイプ汚染防御)
// 設計参照: docs/Spec.md §4-10, E4 (ID衝突), E9 (バージョン不一致)
// 対応テストケース: TC_110〜TC_114, TC_118, TC_119
// =============================================================================

import { STORAGE_KEYS, EXPORT_FORMAT_VERSION } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Export 用エンティティキーマップ
 *   ストレージキー → JSON 出力フィールド名
 *   (Spec.md §4-10 のフォーマットに合わせる)
 */
const EXPORT_KEY_MAP = {
  companies:       "companies",
  categories:      "categories",
  spec_items:      "specItems",
  spec_item_notes: "specItemNotes",
  meetings:        "meetings",
  decisions:       "decisions",
  change_logs:     "changeLogs",
};

const IMPORT_KEY_MAP = Object.fromEntries(
  Object.entries(EXPORT_KEY_MAP).map(([storage, json]) => [json, storage])
);

/**
 * exportAllJSON: 全エンティティを JSON 形式で取り出す
 *  - version / exportedAt を付与
 *  - 論理削除済みエンティティも含める (Spec.md §4-10 / TC_111)
 *
 * @param {Object} storage ストレージ抽象
 * @returns {Promise<Object>}
 */
export async function exportAllJSON(storage) {
  const out = {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  for (const [storageKey, jsonField] of Object.entries(EXPORT_KEY_MAP)) {
    const raw = await storage.getItem(storageKey);
    out[jsonField] = parseArraySafe(raw);
  }
  return out;
}

function parseArraySafe(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * validateImportFile: 入力 JSON が想定形式かを検証
 *  - null / 配列 → エラー文字列
 *  - version 不一致 → 警告文字列 (E9: 警告後に続行可)
 *  - 期待形式 (object + version === "1.0") → null
 *
 * 対応 TC: TC_119
 */
export function validateImportFile(json) {
  if (json === null || json === undefined) return "JSONの形式が不正です";
  if (typeof json !== "object" || Array.isArray(json)) return "JSONの形式が不正です";
  if (json.version === undefined) return "JSONの形式が不正です (version フィールドがありません)";
  if (json.version !== EXPORT_FORMAT_VERSION) {
    return `バージョン不一致: インポートファイル(${json.version}) / 現在(${EXPORT_FORMAT_VERSION})。互換性のないデータは無視されます。`;
  }
  return null;
}

const FORBIDDEN_PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * sanitizeEntity: プロトタイプ汚染防御
 *  - __proto__ / constructor / prototype キーを除去
 *  - シャローコピーで返す
 *
 * 対応 TC: TC_118 (NF-SC-005)
 */
export function sanitizeEntity(entity) {
  if (!entity || typeof entity !== "object") return entity;
  const out = {};
  for (const key of Object.keys(entity)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) continue;
    out[key] = entity[key];
  }
  return out;
}

/**
 * resolveIdConflict: 既存ID集合と衝突したら新UUIDを発行
 *  - id 以外のフィールドは維持
 *
 * 対応 TC: TC_113 / E4
 */
export function resolveIdConflict(item, existingIds) {
  if (!item || typeof item !== "object" || !item.id) return item;
  if (existingIds.has(item.id)) {
    return { ...item, id: newId() };
  }
  return item;
}

/**
 * resolveAllIdConflicts: 全エンティティをサニタイズし、ID 衝突時は新 ID を発行。
 * 旧 ID → 新 ID の対応マップを作り、参照フィールド (companyId / specItemId / categoryId / meetingId) を書き換える。
 *
 * @param {Object} importJson  validateImportFile 通過後の JSON
 * @param {Object} existing    { [storageKey]: Entity[] } (既存データ)
 * @param {"merge"|"overwrite"} mode
 * @returns {Object} { [storageKey]: Entity[] }  保存対象の最終形
 */
export function resolveAllIdConflicts(importJson, existing, mode) {
  const baseLists = {};
  for (const storageKey of Object.values(IMPORT_KEY_MAP)) {
    baseLists[storageKey] = mode === "merge" ? [...(existing[storageKey] || [])] : [];
  }

  // 既存 ID 集合を構築 (merge 時のみ意味あり)
  const existingIds = {};
  for (const k of Object.keys(baseLists)) {
    existingIds[k] = new Set(baseLists[k].map((e) => e?.id).filter(Boolean));
  }

  // 各エンティティ配列の処理
  const newCollections = {};
  const remap = {}; // { categories: { oldId: newId }, ... }

  for (const [jsonField, list] of Object.entries(importJson)) {
    if (jsonField === "version" || jsonField === "exportedAt") continue;
    const storageKey = IMPORT_KEY_MAP[jsonField];
    if (!storageKey) continue;
    if (!Array.isArray(list)) continue;

    const resolved = [];
    const fieldRemap = {};
    for (const rawItem of list) {
      const sanitized = sanitizeEntity(rawItem);
      if (!sanitized || !sanitized.id) continue;
      const updated = resolveIdConflict(sanitized, existingIds[storageKey]);
      if (updated.id !== sanitized.id) {
        fieldRemap[sanitized.id] = updated.id;
      }
      existingIds[storageKey].add(updated.id);
      resolved.push(updated);
    }
    newCollections[storageKey] = resolved;
    remap[storageKey] = fieldRemap;
  }

  // 参照フィールドの ID 書き換え
  const FK_MAPPING = {
    // 関連フィールド → 参照先 storage key
    spec_items:      { categoryId: "categories" },
    spec_item_notes: { specItemId: "spec_items", companyId: "companies" },
    meetings:        { companyId: "companies" },
    decisions:       { meetingId: "meetings", specItemId: "spec_items", specCompanyId: "companies" },
    change_logs:     { specItemId: "spec_items", companyId: "companies", meetingId: "meetings" },
  };

  for (const [storageKey, fields] of Object.entries(FK_MAPPING)) {
    const collection = newCollections[storageKey];
    if (!collection) continue;
    for (const item of collection) {
      for (const [field, refKey] of Object.entries(fields)) {
        const mapping = remap[refKey];
        if (mapping && item[field] && mapping[item[field]]) {
          item[field] = mapping[item[field]];
        }
      }
    }
    // SpecItem.values の companyId / meetingId 内参照
    if (storageKey === "spec_items") {
      for (const item of collection) {
        if (!Array.isArray(item.values)) continue;
        item.values = item.values.map((v) => ({
          ...v,
          companyId: remap.companies?.[v.companyId] || v.companyId,
          meetingId: v.meetingId && remap.meetings?.[v.meetingId]
            ? remap.meetings[v.meetingId] : v.meetingId,
        }));
      }
    }
  }

  // 最終: baseLists にマージ
  const result = { ...baseLists };
  for (const [storageKey, collection] of Object.entries(newCollections)) {
    if (mode === "merge") {
      result[storageKey] = [...(result[storageKey] || []), ...collection];
    } else {
      result[storageKey] = collection;
    }
  }
  return result;
}

/**
 * importAll: アトミックインポート
 *  - validateImportFile でバリデーション
 *  - メモリ上で ID 衝突解決 → 一括書き込み (Promise.all)
 *  - 既存データのスナップショットを取り、書き込み中に例外が出たら復元
 *
 * 対応 TC: TC_113 (ID衝突), TC_114 (アトミック), TC_118 (プロトタイプ汚染), TC_119 (検証)
 */
export async function importAll(storage, json, mode = "merge", { allowVersionMismatch = false } = {}) {
  const err = validateImportFile(json);
  if (err) {
    if (!allowVersionMismatch || !/バージョン不一致/.test(err)) {
      throw new Error(err);
    }
    // バージョン不一致は警告として処理し続行
  }

  // 既存データのスナップショット (アトミックロールバック用)
  const existingByStorage = {};
  const snapshotByStorage = {};
  for (const storageKey of Object.values(IMPORT_KEY_MAP)) {
    const raw = await storage.getItem(storageKey);
    existingByStorage[storageKey] = parseArraySafe(raw);
    snapshotByStorage[storageKey] = raw;
  }

  const resolved = resolveAllIdConflicts(json, existingByStorage, mode);

  // 一括保存 (途中失敗時は snapshot で復元)
  const writtenKeys = [];
  try {
    for (const [storageKey, list] of Object.entries(resolved)) {
      await storage.setItem(storageKey, JSON.stringify(list));
      writtenKeys.push(storageKey);
    }
    return { resolved };
  } catch (e) {
    // ロールバック
    for (const storageKey of writtenKeys) {
      try {
        if (snapshotByStorage[storageKey] === null || snapshotByStorage[storageKey] === undefined) {
          await storage.removeItem(storageKey);
        } else {
          await storage.setItem(storageKey, snapshotByStorage[storageKey]);
        }
      } catch { /* 個別のロールバックエラーは握り潰す */ }
    }
    e.atomicImportRolledBack = true;
    throw e;
  }
}

/**
 * ストレージ使用量 (バイト) を集計
 * @returns { keys: { [storageKey]: bytes }, total: number }
 */
export async function computeStorageUsage(storage, keys = Object.values(STORAGE_KEYS)) {
  const result = { keys: {}, total: 0 };
  for (const key of keys) {
    const raw = await storage.getItem(key);
    const bytes = raw ? new TextEncoder().encode(raw).length : 0;
    result.keys[key] = bytes;
    result.total += bytes;
  }
  return result;
}
