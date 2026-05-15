// =============================================================================
// src/utils/specItem.js
// SpecItem (仕様項目) + SpecValue (各社の値) の CRUD ヘルパー
// 設計参照: docs/Spec.md §3-2 (SpecItem/SpecValue), §4-1 (VALIDATION), §4-2 (並び替え)
// 対応テストケース: TC_041〜TC_044 (moveSpecItem), TC_045 (永続化)
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const SPEC_ITEM_VALIDATION = {
  name:  { required: true,  maxLength: 50 },
  value: { required: false, maxLength: 200 },
};

/** SpecItem を新規作成 */
export function createSpecItem(input, sortOrder = 0) {
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    categoryId: input.categoryId,
    name: String(input.name ?? "").trim(),
    sortOrder,
    values: [],
  };
}

/** SpecItem 更新 (id/createdAt/categoryId/values は維持。name と sortOrder のみ可変) */
export function updateSpecItem(original, input) {
  return {
    ...original,
    name: String(input.name ?? original.name).trim(),
    sortOrder: input.sortOrder ?? original.sortOrder,
    categoryId: input.categoryId ?? original.categoryId,
  };
}

/** 論理削除 */
export function softDeleteSpecItem(specItem) {
  return { ...specItem, deletedAt: new Date().toISOString() };
}

export function validateSpecItem(input) {
  const errors = {};
  const v = SPEC_ITEM_VALIDATION;
  const name = String(input?.name ?? "");
  if (v.name.required && name.trim().length === 0) errors.name = "項目名は必須です";
  else if (name.length > v.name.maxLength) errors.name = `${v.name.maxLength}文字以内で入力してください`;
  if (!input?.categoryId) errors.categoryId = "カテゴリが必要です";
  return errors;
}

export function validateSpecValue(value) {
  const errors = {};
  if (value !== undefined && value !== null) {
    const s = String(value);
    if (s.length > SPEC_ITEM_VALIDATION.value.maxLength) {
      errors.value = `${SPEC_ITEM_VALIDATION.value.maxLength}文字以内で入力してください`;
    }
  }
  return errors;
}

/**
 * moveSpecItem
 * 同一カテゴリ内で SpecItem の sortOrder を交換する。
 * - 不変関数 (引数 items を変更しない)
 * - 異カテゴリの項目はソート対象外
 *
 * 対応 TC:
 *   TC_041 (上へ移動 / sortOrder 入替)
 *   TC_042 (下へ移動)
 *   TC_043 (先頭を上 / 変化なし)
 *   TC_044 (存在しないID / 元配列を返す)
 */
export function moveSpecItem(items, id, direction) {
  const target = items.find((i) => i.id === id);
  if (!target) return items;

  // 同一カテゴリ + 削除済みを除外したサブセットを sortOrder 順に並べる
  const sibling = items
    .filter((i) => i.categoryId === target.categoryId && !i.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const idx = sibling.findIndex((i) => i.id === id);
  if (idx === -1) return items;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sibling.length) return items;

  const a = sibling[idx];
  const b = sibling[swapIdx];
  return items.map((item) => {
    if (item.id === a.id) return { ...item, sortOrder: b.sortOrder ?? 0 };
    if (item.id === b.id) return { ...item, sortOrder: a.sortOrder ?? 0 };
    return item;
  });
}

/** カテゴリ ID に属する有効な SpecItem を sortOrder 昇順で返す */
export function specItemsByCategory(items, categoryId) {
  return items
    .filter((i) => i.categoryId === categoryId && !i.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** SpecItem の中から特定会社の値を取得 (なければ undefined) */
export function getSpecValue(specItem, companyId) {
  if (!specItem || !Array.isArray(specItem.values)) return undefined;
  return specItem.values.find((v) => v.companyId === companyId);
}

/**
 * SpecItem の values に対して特定会社の値を upsert する。
 * 既存があれば置換、なければ新規追加。
 * 不変関数。
 */
export function setSpecValue(specItem, companyId, value, meetingId = undefined) {
  const now = new Date().toISOString();
  const newValue = {
    companyId,
    value: String(value ?? ""),
    meetingId,
    updatedAt: now,
  };
  const existing = (specItem.values || []).filter((v) => v.companyId !== companyId);
  return {
    ...specItem,
    values: [...existing, newValue],
  };
}

/** 末尾の sortOrder を返す (新規追加時に使用) */
export function nextSortOrderForCategory(items, categoryId) {
  const sibling = items.filter((i) => i.categoryId === categoryId);
  if (sibling.length === 0) return 0;
  return Math.max(...sibling.map((i) => i.sortOrder ?? 0)) + 1;
}

// ---- Storage I/O ----

export async function loadSpecItems(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.SPEC_ITEMS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSpecItems(storage, items) {
  await storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(items));
}

export async function appendSpecItem(storage, item) {
  const list = await loadSpecItems(storage);
  await saveSpecItems(storage, [...list, item]);
}

export async function replaceSpecItem(storage, updated) {
  const list = await loadSpecItems(storage);
  await saveSpecItems(storage, list.map((i) => (i.id === updated.id ? updated : i)));
}

export async function softDeleteSpecItemById(storage, id) {
  const list = await loadSpecItems(storage);
  await saveSpecItems(storage, list.map((i) => (i.id === id ? softDeleteSpecItem(i) : i)));
}
