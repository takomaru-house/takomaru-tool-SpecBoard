// =============================================================================
// src/utils/meeting.js
// Meeting (打ち合わせ) の CRUD ヘルパー + タイトル自動生成 + attendees パース
// 設計参照: docs/Spec.md §3-2 (Meeting), §4-1 (VALIDATION.Meeting), §4-8 (タイトル自動生成), E15, E16
// 対応テストケース: TC_060〜TC_067
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const MEETING_VALIDATION = {
  date:      { required: true,  format: "YYYY-MM-DD" },
  agenda:    { required: true,  maxLength: 1000 },
  summary:   { required: false, maxLength: 2000 },
  attendees: { required: false, maxItems: 20, itemMaxLength: 30 },
  location:  { required: false, maxLength: 100 },
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * generateMeetingTitle: 「YYYY-MM-DD 会社名」形式でタイトル生成。
 * 同一 (会社, 日付) で既存タイトルが N 件あれば「YYYY-MM-DD 会社名 (N+1)」を返す。
 *
 * @param {string} date           "YYYY-MM-DD"
 * @param {string} companyName    会社名
 * @param {string[]} existingTitles 同一 (date, companyName) の既存タイトル群 (省略時は連番なし)
 *
 * 対応 TC: TC_060 (基本形式), TC_061 (2件目→(2)), TC_062 (3件目→(3))
 */
export function generateMeetingTitle(date, companyName, existingTitles = []) {
  const base = `${date} ${companyName}`;
  // 既存タイトルの中で base または "base (N)" 形式にマッチする件数を数える
  const re = new RegExp(`^${escapeRegExp(base)}(?:\\s+\\(\\d+\\))?$`);
  const matches = existingTitles.filter((t) => re.test(t));
  if (matches.length === 0) return base;
  return `${base} (${matches.length + 1})`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * parseAttendees: カンマ区切り文字列 → 配列 (trim + 空要素除去)
 * 全角カンマ (，) も区切り文字として扱う。
 *
 * 対応 TC: TC_063, E16, UT-04-15〜18
 */
export function parseAttendees(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 配列 → カンマ区切り文字列 (UI で再表示する用) */
export function formatAttendees(attendees) {
  if (!Array.isArray(attendees)) return "";
  return attendees.join(", ");
}

/** ISO 日付文字列 (YYYY-MM-DD) が未来日かを判定 (時刻部分は無視) */
export function isFutureDate(dateStr, now = new Date()) {
  if (!dateStr || !DATE_PATTERN.test(dateStr)) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return target.getTime() > today.getTime();
}

export function validateMeeting(input) {
  const errors = {};
  const v = MEETING_VALIDATION;

  // date
  const date = String(input?.date ?? "");
  if (v.date.required && date.length === 0) {
    errors.date = "日付は必須です";
  } else if (date.length > 0 && !DATE_PATTERN.test(date)) {
    errors.date = "日付の形式が不正です (YYYY-MM-DD)";
  }

  // agenda
  const agenda = String(input?.agenda ?? "");
  if (v.agenda.required && agenda.trim().length === 0) {
    errors.agenda = "議題は必須です";
  } else if (agenda.length > v.agenda.maxLength) {
    errors.agenda = `${v.agenda.maxLength}文字以内で入力してください`;
  }

  // summary
  if (input?.summary && String(input.summary).length > v.summary.maxLength) {
    errors.summary = `${v.summary.maxLength}文字以内で入力してください`;
  }

  // location
  if (input?.location && String(input.location).length > v.location.maxLength) {
    errors.location = `${v.location.maxLength}文字以内で入力してください`;
  }

  // attendees (array or string)
  let arr = input?.attendees;
  if (typeof arr === "string") arr = parseAttendees(arr);
  if (Array.isArray(arr)) {
    if (arr.length > v.attendees.maxItems) {
      errors.attendees = `参加者は${v.attendees.maxItems}人以内で入力してください`;
    } else if (arr.some((a) => String(a).length > v.attendees.itemMaxLength)) {
      errors.attendees = `参加者1人の名前は${v.attendees.itemMaxLength}文字以内です`;
    }
  }

  // companyId
  if (!input?.companyId) errors.companyId = "会社は必須です";

  return errors;
}

/** Meeting を新規作成 (タイトル未指定なら自動生成) */
export function createMeeting(input, existingTitlesForSameDateCompany = []) {
  const date = String(input.date ?? "");
  const title = input.title && String(input.title).trim().length > 0
    ? String(input.title).trim()
    : generateMeetingTitle(date, input.companyName ?? "", existingTitlesForSameDateCompany);
  const attendees = Array.isArray(input.attendees)
    ? input.attendees
    : parseAttendees(input.attendees);
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    companyId: input.companyId,
    date,
    title,
    location: input.location ? String(input.location).trim() : undefined,
    attendees,
    agenda: String(input.agenda ?? "").trim(),
    summary: input.summary ? String(input.summary).trim() : undefined,
  };
}

/** Meeting 更新 (id / createdAt / companyId 維持。タイトル明示時のみ更新) */
export function updateMeeting(original, input) {
  const attendees = Array.isArray(input.attendees)
    ? input.attendees
    : parseAttendees(input.attendees);
  return {
    ...original,
    date: String(input.date ?? original.date),
    title: input.title !== undefined ? String(input.title).trim() : original.title,
    location: input.location ? String(input.location).trim() : undefined,
    attendees,
    agenda: String(input.agenda ?? original.agenda).trim(),
    summary: input.summary ? String(input.summary).trim() : undefined,
  };
}

export function softDeleteMeeting(meeting) {
  return { ...meeting, deletedAt: new Date().toISOString() };
}

/** 有効 Meeting を日付降順で並べる */
export function sortMeetingsDesc(meetings) {
  return [...meetings]
    .filter((m) => !m.deletedAt)
    .sort((a, b) => {
      const ax = a.date || "";
      const bx = b.date || "";
      if (ax === bx) {
        // 同日付なら createdAt 降順
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
      return bx.localeCompare(ax);
    });
}

/** 同一 (date, companyId) の既存タイトル一覧を抽出 */
export function siblingTitles(meetings, date, companyId) {
  return meetings
    .filter((m) => !m.deletedAt && m.date === date && m.companyId === companyId)
    .map((m) => m.title)
    .filter(Boolean);
}

/** 指定会社の最後 (最新) の打ち合わせを返す (なければ undefined) */
export function lastMeetingOfCompany(meetings, companyId, excludeId = null) {
  const filtered = meetings.filter(
    (m) => !m.deletedAt && m.companyId === companyId && m.id !== excludeId
  );
  if (filtered.length === 0) return undefined;
  return sortMeetingsDesc(filtered)[0];
}

// ---- Storage I/O ----

export async function loadMeetings(storage) {
  const raw = await storage.getItem(STORAGE_KEYS.MEETINGS);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

export async function saveMeetings(storage, meetings) {
  await storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
}

export async function appendMeeting(storage, meeting) {
  const list = await loadMeetings(storage);
  await saveMeetings(storage, [...list, meeting]);
  return meeting;
}

export async function replaceMeeting(storage, updated) {
  const list = await loadMeetings(storage);
  await saveMeetings(storage, list.map((m) => (m.id === updated.id ? updated : m)));
}

/**
 * Meeting 論理削除と同時に、関連する Decision も論理削除する (カスケード)
 * 対応 TC: TC_067, F-BR-002
 */
export async function softDeleteMeetingCascade(storage, meetingId) {
  // Meeting 側
  const meetings = await loadMeetings(storage);
  const now = new Date().toISOString();
  const nextMeetings = meetings.map((m) =>
    m.id === meetingId ? { ...m, deletedAt: now } : m
  );
  await saveMeetings(storage, nextMeetings);

  // Decision 側 (関連を論理削除)
  const decisionsRaw = await storage.getItem(STORAGE_KEYS.DECISIONS);
  if (!decisionsRaw) return;
  try {
    const decisions = JSON.parse(decisionsRaw);
    if (!Array.isArray(decisions)) return;
    const nextDecisions = decisions.map((d) =>
      d.meetingId === meetingId && !d.deletedAt ? { ...d, deletedAt: now } : d
    );
    await storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(nextDecisions));
  } catch {
    // 失敗時は無視 (Meeting は既に削除済み)
  }
}
