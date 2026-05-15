// =============================================================================
// src/utils/changeLog.js
// ChangeLog (仕様値変更履歴) - 改ざん防止のため削除APIなし
// 本Sprint (Sprint 2) では基本I/Oのみ。アトミック反映フロー (reflectToSpec) は Sprint 4 で実装。
// 設計参照: docs/Spec.md §3-2 (ChangeLog), §3-4 (削除ポリシー: 削除不可), §4-6 (アトミック処理)
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * buildChangeLog: previousValue → newValue の ChangeLog を生成
 * deletedAt フィールドは存在しない (削除不可)
 */
export function buildChangeLog({ specItemId, companyId, previousValue, newValue, meetingId, reason }) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    specItemId,
    companyId,
    previousValue: String(previousValue ?? ""),
    newValue: String(newValue ?? ""),
    meetingId: meetingId || undefined,
    reason: reason || undefined,
    changedAt: now,
    createdAt: now,
  };
}

// ---- Storage I/O ----
// 削除APIは意図的に提供しない (Spec.md §3-4 削除ポリシー: ChangeLog は削除不可)

export async function loadChangeLogs(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.CHANGE_LOGS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveChangeLogs(storage, logs) {
  await storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(logs));
}

/** 末尾追記。同一 specItemId + companyId への複数回更新は「後勝ち」で複数件記録する (E2) */
export async function appendChangeLog(storage, log) {
  const list = await loadChangeLogs(storage);
  await saveChangeLogs(storage, [...list, log]);
  return log;
}

/** changedAt 降順で取得 (タイムライン表示用) */
export function sortChangeLogsDesc(logs) {
  return [...logs].sort((a, b) => {
    const ax = a.changedAt || "";
    const bx = b.changedAt || "";
    if (ax === bx) return 0;
    return ax > bx ? -1 : 1;
  });
}

/** 特定 specItem + company の最新変更ログ (なければ undefined) */
export function latestChangeLog(logs, specItemId, companyId) {
  const filtered = logs.filter((l) => l.specItemId === specItemId && l.companyId === companyId);
  return sortChangeLogsDesc(filtered)[0];
}
