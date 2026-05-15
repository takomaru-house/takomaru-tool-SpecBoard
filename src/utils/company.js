// =============================================================================
// src/utils/company.js
// Company エンティティの CRUD ヘルパー
// 設計参照: docs/Spec.md §3-2 (Company), §3-4 (削除ポリシー)
// 対応テストケース: TC_020, TC_021, TC_027, TC_031
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Company を新規作成。validation 通過後の input を渡す想定 */
export function createCompany(input) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    createdAt: now,
    name: String(input.name ?? "").trim(),
    type: input.type || "maker",
    contact: String(input.contact ?? "").trim(),
    phone: input.phone ? String(input.phone).trim() : undefined,
    email: input.email ? String(input.email).trim() : undefined,
    status: input.status || "considering",
    note: input.note ? String(input.note) : undefined,
    rejectionNote: input.rejectionNote ? String(input.rejectionNote) : undefined,
  };
}

/** 既存 Company を更新 (id/createdAt は維持) */
export function updateCompany(original, input) {
  return {
    ...original,
    name: String(input.name ?? "").trim(),
    type: input.type || original.type,
    contact: String(input.contact ?? "").trim(),
    phone: input.phone ? String(input.phone).trim() : undefined,
    email: input.email ? String(input.email).trim() : undefined,
    status: input.status || original.status,
    note: input.note ? String(input.note) : undefined,
    rejectionNote: input.rejectionNote ? String(input.rejectionNote) : undefined,
  };
}

/** 論理削除 (deletedAt を ISO 文字列でセット) */
export function softDeleteCompany(company) {
  return { ...company, deletedAt: new Date().toISOString() };
}

/** 削除済みフラグの無い会社のみ抽出 */
export function filterActiveCompanies(companies) {
  return companies.filter((c) => !c.deletedAt);
}

/** ステータスで絞り込み (null/undefined/'all' は無視) */
export function filterByStatus(companies, status) {
  if (!status || status === "all") return companies;
  return companies.filter((c) => c.status === status);
}

/** createdAt の昇順でソート (古い順) */
export function sortCompaniesByCreatedAt(companies, direction = "asc") {
  const dir = direction === "desc" ? -1 : 1;
  return [...companies].sort((a, b) => {
    const ax = a.createdAt || "";
    const bx = b.createdAt || "";
    if (ax === bx) return 0;
    return ax < bx ? -1 * dir : 1 * dir;
  });
}

/** 契約済 / 未契約 で分離。UI 上で「契約済」グループを折りたたむために利用 */
export function partitionByContracted(companies) {
  const contracted = [];
  const others = [];
  companies.forEach((c) => {
    if (c.status === "contracted") contracted.push(c);
    else others.push(c);
  });
  return { contracted, others };
}

// ---- Storage I/O ヘルパー (ストレージ抽象に依存) ----

export async function loadCompanies(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.COMPANIES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCompanies(storage, companies) {
  await storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
}

/** 1社追加 (バリデーション・重複チェックは呼び出し側で実施) */
export async function appendCompany(storage, company) {
  const list = await loadCompanies(storage);
  await saveCompanies(storage, [...list, company]);
  return company;
}

/** 1社更新 (id一致) */
export async function replaceCompany(storage, updated) {
  const list = await loadCompanies(storage);
  const next = list.map((c) => (c.id === updated.id ? updated : c));
  await saveCompanies(storage, next);
  return updated;
}

/** 1社論理削除 (id一致) */
export async function softDeleteCompanyById(storage, id) {
  const list = await loadCompanies(storage);
  const next = list.map((c) => (c.id === id ? softDeleteCompany(c) : c));
  await saveCompanies(storage, next);
}
