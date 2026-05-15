// =============================================================================
// src/utils/dashboard.js
// ダッシュボード集計ロジック (4種サマリー + 直近一覧)
// 設計参照: docs/Spec.md §6-2 (ダッシュボード画面), E13 (全社落選 Empty State)
// 対応テストケース: TC_100, TC_102
// =============================================================================

import { filterActiveCompanies } from "./company.js";
import { sortMeetingsDesc } from "./meeting.js";
import { filterActiveDecisions } from "./decision.js";

/**
 * computeSummary: ダッシュボード 4 種サマリーカードの数値を集計
 *   - 検討中 (considering の会社数)
 *   - 候補   (candidate の会社数)
 *   - 打ち合わせ回数 (有効 Meeting 数)
 *   - 未確定事項 (pending Decision 数)
 *
 * @param {Object} input { companies, meetings, decisions }
 * @returns {Object} { considering, candidate, contracted, rejected, meetingCount, pendingCount, activeCompanyCount }
 *
 * 対応 TC: TC_100 (数値が実データと一致)
 */
export function computeSummary({ companies = [], meetings = [], decisions = [] }) {
  const active = filterActiveCompanies(companies);
  const byStatus = (s) => active.filter((c) => c.status === s).length;

  const considering = byStatus("considering");
  const candidate = byStatus("candidate");
  const contracted = byStatus("contracted");
  const rejected = byStatus("rejected");

  const meetingCount = meetings.filter((m) => !m.deletedAt).length;
  const pendingCount = filterActiveDecisions(decisions).filter((d) => d.status === "pending").length;

  return {
    considering,
    candidate,
    contracted,
    rejected,
    meetingCount,
    pendingCount,
    activeCompanyCount: active.length,
  };
}

/**
 * hasActiveCandidates: 検討中 + 候補会社が1件以上あるか
 * 全社が落選/キャンセル/契約済の場合 false (E13 Empty State 判定用)
 *
 * 対応 TC: TC_102 (全社落選 → Empty State 表示)
 */
export function hasActiveCandidates(companies) {
  return filterActiveCompanies(companies).some(
    (c) => c.status === "considering" || c.status === "candidate"
  );
}

/**
 * recentMeetings: 直近 N 件の有効打ち合わせ (日付降順)
 */
export function recentMeetings(meetings, limit = 5) {
  return sortMeetingsDesc(meetings).slice(0, limit);
}

/**
 * recentDecisions: 直近 N 件の有効決定事項 (createdAt 降順)
 */
export function recentDecisions(decisions, limit = 5) {
  return filterActiveDecisions(decisions)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

/**
 * pendingActions: 未確定 (pending) の Decision 一覧 (createdAt 降順)
 */
export function pendingActions(decisions, limit = 50) {
  return filterActiveDecisions(decisions)
    .filter((d) => d.status === "pending")
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}
