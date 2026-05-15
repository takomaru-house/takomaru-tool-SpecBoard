// =============================================================================
// src/utils/decision.js
// Decision (決定事項) の CRUD ヘルパー
// 設計参照: docs/Spec.md §3-2 (Decision), §4-1 (VALIDATION.Decision), §3-4 (物理削除)
// 対応テストケース: TC_068 (ステータス変更)
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DECISION_VALIDATION = {
  content:   { required: true,  maxLength: 1000 },
  specValue: { required: false, maxLength: 200 },
  note:      { required: false, maxLength: 500 },
};

export const DECISION_STATUSES = ["confirmed", "pending", "cancelled"];

export function validateDecision(input) {
  const errors = {};
  const v = DECISION_VALIDATION;
  const content = String(input?.content ?? "");
  if (v.content.required && content.trim().length === 0) {
    errors.content = "決定内容は必須です";
  } else if (content.length > v.content.maxLength) {
    errors.content = `${v.content.maxLength}文字以内で入力してください`;
  }
  if (input?.specValue && String(input.specValue).length > v.specValue.maxLength) {
    errors.specValue = `${v.specValue.maxLength}文字以内で入力してください`;
  }
  if (input?.note && String(input.note).length > v.note.maxLength) {
    errors.note = `${v.note.maxLength}文字以内で入力してください`;
  }
  if (input?.status !== undefined && !DECISION_STATUSES.includes(input.status)) {
    errors.status = "不正なステータスです";
  }
  if (!input?.meetingId) errors.meetingId = "打ち合わせIDが必要です";
  return errors;
}

export function createDecision(input) {
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    meetingId: input.meetingId,
    content: String(input.content ?? "").trim(),
    status: input.status || "pending",
    specItemId: input.specItemId || undefined,
    specCompanyId: input.specCompanyId || undefined,
    specValue: input.specValue ? String(input.specValue).trim() : undefined,
    note: input.note ? String(input.note).trim() : undefined,
  };
}

export function updateDecision(original, input) {
  return {
    ...original,
    content: input.content !== undefined ? String(input.content).trim() : original.content,
    status: input.status || original.status,
    specItemId: input.specItemId !== undefined ? input.specItemId || undefined : original.specItemId,
    specCompanyId: input.specCompanyId !== undefined ? input.specCompanyId || undefined : original.specCompanyId,
    specValue: input.specValue !== undefined ? (input.specValue ? String(input.specValue).trim() : undefined) : original.specValue,
    note: input.note !== undefined ? (input.note ? String(input.note).trim() : undefined) : original.note,
  };
}

/** ステータス変更ヘルパー (TC_068) */
export function changeDecisionStatus(decision, newStatus) {
  if (!DECISION_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  return { ...decision, status: newStatus };
}

/** 物理削除前提だが、Meeting からのカスケード論理削除でも使うため deletedAt をセット可能にする */
export function softDeleteDecision(decision) {
  return { ...decision, deletedAt: new Date().toISOString() };
}

/** 有効な Decision (deletedAt が無いもの) を抽出 */
export function filterActiveDecisions(decisions) {
  return decisions.filter((d) => !d.deletedAt);
}

/** Meeting ID で絞り込み (削除されていないもの) */
export function decisionsByMeeting(decisions, meetingId) {
  return decisions.filter((d) => d.meetingId === meetingId && !d.deletedAt);
}

/** ステータス pending の有効 Decision のみ */
export function pendingDecisions(decisions) {
  return filterActiveDecisions(decisions).filter((d) => d.status === "pending");
}

// ---- Storage I/O ----

export async function loadDecisions(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.DECISIONS);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

export async function saveDecisions(storage, decisions) {
  await storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(decisions));
}

export async function appendDecision(storage, decision) {
  const list = await loadDecisions(storage);
  await saveDecisions(storage, [...list, decision]);
  return decision;
}

export async function appendDecisions(storage, newOnes) {
  const list = await loadDecisions(storage);
  await saveDecisions(storage, [...list, ...newOnes]);
}

export async function replaceDecision(storage, updated) {
  const list = await loadDecisions(storage);
  await saveDecisions(storage, list.map((d) => (d.id === updated.id ? updated : d)));
}

/** Decision の物理削除 (確認ダイアログは UI 側で必須) */
export async function deleteDecision(storage, id) {
  const list = await loadDecisions(storage);
  await saveDecisions(storage, list.filter((d) => d.id !== id));
}
