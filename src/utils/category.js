// =============================================================================
// src/utils/category.js
// Category エンティティの CRUD ヘルパー + バリデーション
// 設計参照: docs/Spec.md §3-2 (Category), §4-1 (VALIDATION.Category), E6
// 対応テストケース: TC_040 (重複検出), F-EC-007 (normalizedName)
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const CATEGORY_VALIDATION = {
  name: { required: true, maxLength: 30 },
};

/** name を正規化 (trim + toLowerCase) */
export function normalizeCategoryName(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * validateCategory
 * - 名称必須・30文字以内・既存と重複しないこと
 * @returns {Object} errors
 *
 * 対応 TC: TC_040 (重複・大小区別なし)
 */
export function validateCategory(input, existingCategories = [], excludeId = null) {
  const errors = {};
  const name = String(input?.name ?? "");
  const trimmed = name.trim();
  const v = CATEGORY_VALIDATION;

  if (v.name.required && trimmed.length === 0) {
    errors.name = "カテゴリ名は必須です";
    return errors;
  }
  if (name.length > v.name.maxLength) {
    errors.name = `${v.name.maxLength}文字以内で入力してください`;
    return errors;
  }
  const normalized = normalizeCategoryName(name);
  const duplicate = existingCategories.some(
    (c) => !c.deletedAt && c.id !== excludeId && c.normalizedName === normalized
  );
  if (duplicate) errors.name = "同じ名前のカテゴリが既に存在します";
  return errors;
}

/** 重複チェック単独 (Toast 警告等で利用) */
export function isDuplicateCategoryName(name, categories, excludeId = null) {
  const normalized = normalizeCategoryName(name);
  if (normalized.length === 0) return false;
  return categories.some(
    (c) => !c.deletedAt && c.id !== excludeId && c.normalizedName === normalized
  );
}

/** Category を新規作成 (sortOrder は呼び出し側で指定または末尾) */
export function createCategory(input, sortOrder = 0) {
  const name = String(input.name ?? "").trim();
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    name,
    normalizedName: normalizeCategoryName(name),
    sortOrder,
    isDefault: false,
  };
}

/** 既存 Category 更新 (id / createdAt / isDefault は維持) */
export function updateCategory(original, input) {
  const name = String(input.name ?? "").trim();
  return {
    ...original,
    name,
    normalizedName: normalizeCategoryName(name),
    sortOrder: input.sortOrder ?? original.sortOrder,
  };
}

/** 論理削除 */
export function softDeleteCategory(category) {
  return { ...category, deletedAt: new Date().toISOString() };
}

/** 有効 (削除されていない) のみ抽出して sortOrder 昇順でソート */
export function filterActiveCategories(categories) {
  return categories
    .filter((c) => !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** 末尾の sortOrder (新規追加用に max + 1) */
export function nextSortOrder(categories) {
  const orders = categories.map((c) => c.sortOrder ?? 0);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

// ---- Storage I/O ----

export async function loadCategories(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.CATEGORIES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCategories(storage, categories) {
  await storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
}

export async function appendCategory(storage, category) {
  const list = await loadCategories(storage);
  await saveCategories(storage, [...list, category]);
  return category;
}

export async function replaceCategory(storage, updated) {
  const list = await loadCategories(storage);
  await saveCategories(storage, list.map((c) => (c.id === updated.id ? updated : c)));
}

export async function softDeleteCategoryById(storage, id) {
  const list = await loadCategories(storage);
  await saveCategories(storage, list.map((c) => (c.id === id ? softDeleteCategory(c) : c)));
}
