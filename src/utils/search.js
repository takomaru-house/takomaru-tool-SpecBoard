// =============================================================================
// src/utils/search.js
// 全文検索 (Meeting / Decision / SpecItem / Company を横断)
// 設計参照: docs/Spec.md §4-5 (全文検索設計)
// 対応テストケース: TC_103, TC_104, TC_105
// =============================================================================

/**
 * SearchTargets: 各エンティティで検索対象とするフィールド
 * Spec.md §4-5 と一致させる
 */
export const SEARCH_TARGETS = {
  Meeting:  ["agenda", "summary", "location"],
  Decision: ["content", "note", "specValue"],
  SpecItem: ["name"],
  Company:  ["name", "contact", "note"],
};

/** 単純な大小無視・全角半角無視 (今は簡易化) substring マッチ */
function normalize(s) {
  return String(s ?? "").toLowerCase();
}

function fieldMatches(entity, fields, q) {
  return fields.some((f) => normalize(entity[f]).includes(q));
}

/**
 * runGlobalSearch
 * @param {Object} input  { meetings, decisions, specItems, companies }
 * @param {string} query  検索文字列
 * @returns {Object} { meetings, decisions, specItems, companies, totalCount }
 *   - 各配列は元の順序を維持する
 *   - 削除済みエンティティは除外
 *
 * 対応 TC: TC_103 (横断検索), TC_105 (空振り総数 0)
 */
export function runGlobalSearch({ meetings = [], decisions = [], specItems = [], companies = [] }, query) {
  const q = normalize(query);
  if (q.length === 0) {
    return { meetings: [], decisions: [], specItems: [], companies: [], totalCount: 0 };
  }

  const matchedMeetings = meetings
    .filter((e) => !e.deletedAt && fieldMatches(e, SEARCH_TARGETS.Meeting, q));
  const matchedDecisions = decisions
    .filter((e) => !e.deletedAt && fieldMatches(e, SEARCH_TARGETS.Decision, q));
  const matchedSpecItems = specItems
    .filter((e) => !e.deletedAt && fieldMatches(e, SEARCH_TARGETS.SpecItem, q));
  const matchedCompanies = companies
    .filter((e) => !e.deletedAt && fieldMatches(e, SEARCH_TARGETS.Company, q));

  return {
    meetings: matchedMeetings,
    decisions: matchedDecisions,
    specItems: matchedSpecItems,
    companies: matchedCompanies,
    totalCount: matchedMeetings.length + matchedDecisions.length + matchedSpecItems.length + matchedCompanies.length,
  };
}

/**
 * splitForHighlight: テキストを検索語の前後に分割し、強調用セグメントを返す。
 * @param {string} text 対象文字列
 * @param {string} query 検索語 (空文字なら元文字列のみを返す)
 * @returns {Array<{text: string, match: boolean}>}
 *
 * 例:
 *   splitForHighlight("断熱材を変更", "断熱")
 *   => [{ text: "断熱", match: true }, { text: "材を変更", match: false }]
 */
export function splitForHighlight(text, query) {
  const s = String(text ?? "");
  const q = String(query ?? "");
  if (q.length === 0 || s.length === 0) return [{ text: s, match: false }];

  const lower = s.toLowerCase();
  const lq = q.toLowerCase();
  const out = [];
  let i = 0;
  while (i < s.length) {
    const idx = lower.indexOf(lq, i);
    if (idx === -1) {
      out.push({ text: s.slice(i), match: false });
      break;
    }
    if (idx > i) out.push({ text: s.slice(i, idx), match: false });
    out.push({ text: s.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return out;
}

/**
 * debounce: シンプルな関数デバウンサ
 * @returns 内部タイマーをキャンセルする関数を持つ wrapper
 */
export function debounce(fn, delay = 300) {
  let timerId = null;
  const wrapped = (...args) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delay);
  };
  wrapped.cancel = () => {
    if (timerId) clearTimeout(timerId);
    timerId = null;
  };
  return wrapped;
}
