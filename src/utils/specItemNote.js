// =============================================================================
// src/utils/specItemNote.js
// SpecItemNote (仕様項目評価メモ) の CRUD ヘルパー
// 設計参照: docs/Spec.md §3-2 (SpecItemNote), §4-3 (評価メモ仕様)
// 対応テストケース: TC_046 (CRUD), TC_047 (200/201 文字境界)
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const SPEC_ITEM_NOTE_VALIDATION = {
  note: { required: true, maxLength: 200 },
};

export function validateSpecItemNote(input) {
  const errors = {};
  const v = SPEC_ITEM_NOTE_VALIDATION;
  const note = String(input?.note ?? "");
  if (v.note.required && note.trim().length === 0) {
    errors.note = "メモは必須です";
  } else if (note.length > v.note.maxLength) {
    errors.note = `${v.note.maxLength}文字以内で入力してください`;
  }
  if (!input?.specItemId) errors.specItemId = "specItemId が必要です";
  if (!input?.companyId) errors.companyId = "companyId が必要です";
  return errors;
}

export function createSpecItemNote(input) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    specItemId: input.specItemId,
    companyId: input.companyId,
    note: String(input.note ?? "").trim(),
  };
}

export function updateSpecItemNote(original, input) {
  return {
    ...original,
    note: String(input.note ?? original.note).trim(),
    updatedAt: new Date().toISOString(),
  };
}

/** 同一 specItemId + companyId の組み合わせのメモを返す (なければ undefined) */
export function findNote(notes, specItemId, companyId) {
  return notes.find((n) => n.specItemId === specItemId && n.companyId === companyId);
}

// ---- Storage I/O ----
// SpecItemNote は物理削除 (deletedAt フィールド無し)。確認ダイアログ必須 (UI 側)

export async function loadSpecItemNotes(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.SPEC_ITEM_NOTES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSpecItemNotes(storage, notes) {
  await storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify(notes));
}

/**
 * upsertSpecItemNote
 * 同じ (specItemId, companyId) の組み合わせがあれば updateSpecItemNote、
 * なければ createSpecItemNote で追加する。
 */
export async function upsertSpecItemNote(storage, { specItemId, companyId, note }) {
  const list = await loadSpecItemNotes(storage);
  const existing = findNote(list, specItemId, companyId);
  let next;
  if (existing) {
    const updated = updateSpecItemNote(existing, { note });
    next = list.map((n) => (n.id === existing.id ? updated : n));
  } else {
    const created = createSpecItemNote({ specItemId, companyId, note });
    next = [...list, created];
  }
  await saveSpecItemNotes(storage, next);
  return findNote(next, specItemId, companyId);
}

/** 物理削除 (確認ダイアログは UI 側で必須) */
export async function deleteSpecItemNote(storage, id) {
  const list = await loadSpecItemNotes(storage);
  await saveSpecItemNotes(storage, list.filter((n) => n.id !== id));
}
