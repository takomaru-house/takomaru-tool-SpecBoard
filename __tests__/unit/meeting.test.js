// =============================================================================
// __tests__/unit/meeting.test.js
// Sprint 3 単体テスト - Meeting + タイトル自動生成 + attendees パース + 未来日付判定
//
// 対応テストケース: TC_060, TC_061, TC_062, TC_063, TC_064, TC_065, TC_066, TC_067
// =============================================================================

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";
import {
  generateMeetingTitle,
  parseAttendees,
  formatAttendees,
  isFutureDate,
  validateMeeting,
  createMeeting,
  updateMeeting,
  softDeleteMeeting,
  sortMeetingsDesc,
  siblingTitles,
  lastMeetingOfCompany,
  softDeleteMeetingCascade,
  loadMeetings,
  saveMeetings,
  MEETING_VALIDATION,
} from "../../src/utils/meeting.js";

// ---------- generateMeetingTitle ----------
describe("generateMeetingTitle (TC_060, TC_061, TC_062)", () => {
  test("TC_060: 既存タイトル無しなら 'YYYY-MM-DD 会社名' 形式", () => {
    expect(generateMeetingTitle("2026-05-13", "A社", [])).toBe("2026-05-13 A社");
  });

  test("TC_061: 同一会社・同一日付の2件目は末尾に (2)", () => {
    expect(generateMeetingTitle("2026-05-13", "A社", ["2026-05-13 A社"]))
      .toBe("2026-05-13 A社 (2)");
  });

  test("TC_062: 3件目は (3)", () => {
    expect(generateMeetingTitle("2026-05-13", "A社",
      ["2026-05-13 A社", "2026-05-13 A社 (2)"]))
      .toBe("2026-05-13 A社 (3)");
  });

  test("異なる会社名の既存タイトルは無視", () => {
    expect(generateMeetingTitle("2026-05-13", "A社",
      ["2026-05-13 B社", "2026-05-12 A社"]))
      .toBe("2026-05-13 A社");
  });

  test("会社名に特殊文字 (.,()) が含まれても正常動作", () => {
    expect(generateMeetingTitle("2026-05-13", "(株) A.House (East)", []))
      .toBe("2026-05-13 (株) A.House (East)");
    expect(generateMeetingTitle("2026-05-13", "(株) A.House (East)",
      ["2026-05-13 (株) A.House (East)"]))
      .toBe("2026-05-13 (株) A.House (East) (2)");
  });
});

// ---------- parseAttendees ----------
describe("parseAttendees (TC_063 / E16, UT-04-15〜18)", () => {
  test("カンマ区切り → 配列", () => {
    expect(parseAttendees("田中, 鈴木,佐藤")).toEqual(["田中", "鈴木", "佐藤"]);
  });

  test("前後空白をトリム", () => {
    expect(parseAttendees("  田中  ,  鈴木  ")).toEqual(["田中", "鈴木"]);
  });

  test("空要素を除去", () => {
    expect(parseAttendees("田中,,鈴木,")).toEqual(["田中", "鈴木"]);
  });

  test("空文字列で空配列", () => {
    expect(parseAttendees("")).toEqual([]);
    expect(parseAttendees(null)).toEqual([]);
    expect(parseAttendees(undefined)).toEqual([]);
  });

  test("全角カンマ (，) も区切り扱い", () => {
    expect(parseAttendees("田中，鈴木")).toEqual(["田中", "鈴木"]);
  });

  test("混在カンマ", () => {
    expect(parseAttendees("田中, 鈴木，佐藤")).toEqual(["田中", "鈴木", "佐藤"]);
  });
});

describe("formatAttendees", () => {
  test("配列 → カンマスペース区切り", () => {
    expect(formatAttendees(["田中", "鈴木"])).toBe("田中, 鈴木");
  });
  test("空配列 → 空文字", () => {
    expect(formatAttendees([])).toBe("");
  });
  test("配列以外 → 空文字", () => {
    expect(formatAttendees(null)).toBe("");
    expect(formatAttendees("田中")).toBe("");
  });
});

// ---------- isFutureDate ----------
describe("isFutureDate (TC_066 / E15)", () => {
  test("明日の日付は true", () => {
    const now = new Date("2026-05-13T15:00:00");
    expect(isFutureDate("2026-05-14", now)).toBe(true);
  });

  test("今日の日付は false", () => {
    const now = new Date("2026-05-13T15:00:00");
    expect(isFutureDate("2026-05-13", now)).toBe(false);
  });

  test("過去の日付は false", () => {
    const now = new Date("2026-05-13T15:00:00");
    expect(isFutureDate("2026-05-12", now)).toBe(false);
  });

  test("不正な日付形式は false", () => {
    expect(isFutureDate("2026/05/14")).toBe(false);
    expect(isFutureDate("not-a-date")).toBe(false);
    expect(isFutureDate("")).toBe(false);
    expect(isFutureDate(null)).toBe(false);
  });
});

// ---------- validateMeeting ----------
describe("validateMeeting (TC_064, TC_065 / F-VL-008〜014)", () => {
  const base = { companyId: "co1", date: "2026-05-13", agenda: "議題" };

  test("TC_064: date 空でエラー", () => {
    expect(validateMeeting({ ...base, date: "" })).toHaveProperty("date");
  });

  test("date が YYYY-MM-DD 以外でエラー", () => {
    expect(validateMeeting({ ...base, date: "2026/05/13" })).toHaveProperty("date");
    expect(validateMeeting({ ...base, date: "20260513" })).toHaveProperty("date");
  });

  test("agenda 空でエラー", () => {
    expect(validateMeeting({ ...base, agenda: "" })).toHaveProperty("agenda");
    expect(validateMeeting({ ...base, agenda: "  " })).toHaveProperty("agenda");
  });

  test("agenda 1000 文字 OK / 1001 文字 NG (境界値)", () => {
    expect(validateMeeting({ ...base, agenda: "a".repeat(1000) })).not.toHaveProperty("agenda");
    expect(validateMeeting({ ...base, agenda: "a".repeat(1001) })).toHaveProperty("agenda");
  });

  test("summary 2000 文字 OK / 2001 文字 NG", () => {
    expect(validateMeeting({ ...base, summary: "a".repeat(2000) })).not.toHaveProperty("summary");
    expect(validateMeeting({ ...base, summary: "a".repeat(2001) })).toHaveProperty("summary");
  });

  test("TC_065: attendees 20 件 OK / 21 件 NG (境界値)", () => {
    expect(validateMeeting({
      ...base, attendees: Array(20).fill("人")
    })).not.toHaveProperty("attendees");
    expect(validateMeeting({
      ...base, attendees: Array(21).fill("人")
    })).toHaveProperty("attendees");
  });

  test("attendees 1人が 30 文字 OK / 31 文字 NG", () => {
    expect(validateMeeting({
      ...base, attendees: ["a".repeat(30)]
    })).not.toHaveProperty("attendees");
    expect(validateMeeting({
      ...base, attendees: ["a".repeat(31)]
    })).toHaveProperty("attendees");
  });

  test("attendees 文字列でも parseAttendees 経由でバリデート", () => {
    const tooMany = Array(21).fill("人").join(",");
    expect(validateMeeting({ ...base, attendees: tooMany })).toHaveProperty("attendees");
  });

  test("location 100 文字 OK / 101 文字 NG", () => {
    expect(validateMeeting({ ...base, location: "a".repeat(100) })).not.toHaveProperty("location");
    expect(validateMeeting({ ...base, location: "a".repeat(101) })).toHaveProperty("location");
  });

  test("companyId 未指定でエラー", () => {
    expect(validateMeeting({ date: "2026-05-13", agenda: "x" })).toHaveProperty("companyId");
  });

  test("最小入力 (companyId+date+agenda) で errors なし", () => {
    expect(validateMeeting(base)).toEqual({});
  });
});

// ---------- createMeeting / updateMeeting ----------
describe("createMeeting / updateMeeting", () => {
  test("createMeeting: タイトル未指定なら自動生成", () => {
    const m = createMeeting({
      companyId: "co1", companyName: "A社",
      date: "2026-05-13", agenda: "議題",
    });
    expect(m.title).toBe("2026-05-13 A社");
    expect(m.id).toBeTruthy();
    expect(m.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(m.attendees).toEqual([]);
  });

  test("createMeeting: タイトル明示時はそのまま使う", () => {
    const m = createMeeting({
      companyId: "co1", companyName: "A社",
      date: "2026-05-13", agenda: "議題",
      title: "特別な打ち合わせ",
    });
    expect(m.title).toBe("特別な打ち合わせ");
  });

  test("createMeeting: attendees 文字列 → 配列パース", () => {
    const m = createMeeting({
      companyId: "co1", companyName: "A社",
      date: "2026-05-13", agenda: "x",
      attendees: " 田中 , 鈴木 ",
    });
    expect(m.attendees).toEqual(["田中", "鈴木"]);
  });

  test("createMeeting: 同一 (date, company) で連番付与", () => {
    const existing = ["2026-05-13 A社"];
    const m = createMeeting({
      companyId: "co1", companyName: "A社",
      date: "2026-05-13", agenda: "x",
    }, existing);
    expect(m.title).toBe("2026-05-13 A社 (2)");
  });

  test("updateMeeting: id / createdAt / companyId 維持", () => {
    const original = createMeeting({
      companyId: "co1", companyName: "A社",
      date: "2026-05-13", agenda: "旧",
    });
    const updated = updateMeeting(original, {
      date: "2026-06-01",
      agenda: "新",
      attendees: "田中",
    });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.companyId).toBe("co1");
    expect(updated.date).toBe("2026-06-01");
    expect(updated.agenda).toBe("新");
    expect(updated.attendees).toEqual(["田中"]);
  });
});

// ---------- softDelete / sort / sibling / last ----------
describe("補助ユーティリティ", () => {
  test("softDeleteMeeting で deletedAt 付与", () => {
    const m = createMeeting({ companyId: "co1", companyName: "A", date: "2026-01-01", agenda: "x" });
    const deleted = softDeleteMeeting(m);
    expect(deleted.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("sortMeetingsDesc: 日付降順 + 削除済み除外", () => {
    const list = [
      { id: "a", date: "2026-01-01" },
      { id: "b", date: "2026-03-01" },
      { id: "c", date: "2026-02-01", deletedAt: "2026-04-01" },
      { id: "d", date: "2026-04-01" },
    ];
    expect(sortMeetingsDesc(list).map((m) => m.id)).toEqual(["d", "b", "a"]);
  });

  test("siblingTitles: 同一 (date, companyId) のタイトル抽出", () => {
    const list = [
      { id: "a", date: "2026-05-13", companyId: "co1", title: "2026-05-13 A社" },
      { id: "b", date: "2026-05-13", companyId: "co1", title: "2026-05-13 A社 (2)" },
      { id: "c", date: "2026-05-13", companyId: "co2", title: "別会社" },
      { id: "d", date: "2026-05-14", companyId: "co1", title: "翌日" },
    ];
    expect(siblingTitles(list, "2026-05-13", "co1"))
      .toEqual(["2026-05-13 A社", "2026-05-13 A社 (2)"]);
  });

  test("lastMeetingOfCompany: 指定会社の最新打ち合わせ", () => {
    const list = [
      { id: "a", companyId: "co1", date: "2026-01-01", createdAt: "1" },
      { id: "b", companyId: "co1", date: "2026-05-01", createdAt: "2" },
      { id: "c", companyId: "co2", date: "2026-06-01", createdAt: "3" },
    ];
    expect(lastMeetingOfCompany(list, "co1").id).toBe("b");
    expect(lastMeetingOfCompany(list, "co2").id).toBe("c");
    expect(lastMeetingOfCompany(list, "co3")).toBeUndefined();
  });

  test("lastMeetingOfCompany: excludeId で自身を除外できる", () => {
    const list = [
      { id: "a", companyId: "co1", date: "2026-01-01", createdAt: "1" },
      { id: "b", companyId: "co1", date: "2026-05-01", createdAt: "2" },
    ];
    expect(lastMeetingOfCompany(list, "co1", "b").id).toBe("a");
  });
});

// ---------- softDeleteMeetingCascade (TC_067) ----------
describe("softDeleteMeetingCascade (TC_067 / F-BR-002)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("Meeting 論理削除と同時に関連 Decision も論理削除される", async () => {
    const meeting = createMeeting({ companyId: "co1", companyName: "A", date: "2026-05-13", agenda: "x" });
    await saveMeetings(storage, [meeting]);
    await storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify([
      { id: "d1", meetingId: meeting.id, content: "a", status: "pending", createdAt: "x" },
      { id: "d2", meetingId: meeting.id, content: "b", status: "confirmed", createdAt: "y" },
      { id: "d3", meetingId: "other-meeting", content: "c", status: "pending", createdAt: "z" },
    ]));

    await softDeleteMeetingCascade(storage, meeting.id);

    const meetings = await loadMeetings(storage);
    expect(meetings.find((m) => m.id === meeting.id).deletedAt).toBeTruthy();

    const decisions = JSON.parse(await storage.getItem(STORAGE_KEYS.DECISIONS));
    expect(decisions.find((d) => d.id === "d1").deletedAt).toBeTruthy();
    expect(decisions.find((d) => d.id === "d2").deletedAt).toBeTruthy();
    expect(decisions.find((d) => d.id === "d3").deletedAt).toBeUndefined(); // 他Meeting は影響なし
  });

  test("関連 Decision が無くてもエラーにならない", async () => {
    const meeting = createMeeting({ companyId: "co1", companyName: "A", date: "2026-05-13", agenda: "x" });
    await saveMeetings(storage, [meeting]);
    await expect(softDeleteMeetingCascade(storage, meeting.id)).resolves.not.toThrow();
  });
});

describe("MEETING_VALIDATION 定数", () => {
  test("Spec.md §4-1 の上限値が反映されている", () => {
    expect(MEETING_VALIDATION.agenda.maxLength).toBe(1000);
    expect(MEETING_VALIDATION.summary.maxLength).toBe(2000);
    expect(MEETING_VALIDATION.attendees.maxItems).toBe(20);
    expect(MEETING_VALIDATION.attendees.itemMaxLength).toBe(30);
    expect(MEETING_VALIDATION.location.maxLength).toBe(100);
  });
});
