// =============================================================================
// __tests__/integration/meeting.test.js
// Sprint 3 結合テスト - Meeting + Decision ストレージ往復 / カスケード削除
//
// 対応テストケース: TC_067 (Meeting → Decision カスケード)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";
import {
  createMeeting, saveMeetings, loadMeetings,
  softDeleteMeetingCascade, sortMeetingsDesc, lastMeetingOfCompany,
} from "../../src/utils/meeting.js";
import {
  createDecision, saveDecisions, loadDecisions,
  decisionsByMeeting, pendingDecisions, deleteDecision,
  changeDecisionStatus, replaceDecision,
} from "../../src/utils/decision.js";

describe("Sprint 3 結合: Meeting ストレージ往復", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("Meeting を保存 → リロード後も保持される", async () => {
    const m = createMeeting({
      companyId: "co1", companyName: "A社",
      date: "2026-05-13", agenda: "断熱の検討",
      attendees: "田中, 鈴木",
    });
    await saveMeetings(storage, [m]);

    const storage2 = createStorage("window.storage");
    const loaded = await loadMeetings(storage2);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("2026-05-13 A社");
    expect(loaded[0].attendees).toEqual(["田中", "鈴木"]);
  });

  test("複数 Meeting が日付降順で取得できる", async () => {
    const list = [
      createMeeting({ companyId: "co1", companyName: "A社", date: "2026-01-01", agenda: "x" }),
      createMeeting({ companyId: "co1", companyName: "A社", date: "2026-03-01", agenda: "x" }),
      createMeeting({ companyId: "co2", companyName: "B社", date: "2026-02-01", agenda: "x" }),
    ];
    await saveMeetings(storage, list);
    const loaded = await loadMeetings(storage);
    const sorted = sortMeetingsDesc(loaded);
    expect(sorted.map((m) => m.date)).toEqual(["2026-03-01", "2026-02-01", "2026-01-01"]);
  });
});

describe("Sprint 3 結合: Meeting カスケード論理削除 (TC_067 / F-BR-002)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_067: Meeting を softDeleteMeetingCascade で削除すると関連 Decision も論理削除される", async () => {
    const m1 = createMeeting({ companyId: "co1", companyName: "A", date: "2026-05-13", agenda: "x" });
    const m2 = createMeeting({ companyId: "co1", companyName: "A", date: "2026-05-20", agenda: "y" });
    await saveMeetings(storage, [m1, m2]);

    const d1a = createDecision({ meetingId: m1.id, content: "決定1" });
    const d1b = createDecision({ meetingId: m1.id, content: "決定2", status: "confirmed" });
    const d2 = createDecision({ meetingId: m2.id, content: "決定3" });
    await saveDecisions(storage, [d1a, d1b, d2]);

    await softDeleteMeetingCascade(storage, m1.id);

    const meetings = await loadMeetings(storage);
    expect(meetings.find((m) => m.id === m1.id).deletedAt).toBeTruthy();
    expect(meetings.find((m) => m.id === m2.id).deletedAt).toBeUndefined();

    const decisions = await loadDecisions(storage);
    expect(decisions.find((d) => d.id === d1a.id).deletedAt).toBeTruthy();
    expect(decisions.find((d) => d.id === d1b.id).deletedAt).toBeTruthy();
    expect(decisions.find((d) => d.id === d2.id).deletedAt).toBeUndefined();
  });
});

describe("Sprint 3 結合: Decision ステータス変更・物理削除 (TC_068)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_068: pending → confirmed への変更が保存される", async () => {
    const d = createDecision({ meetingId: "m1", content: "x" });
    await saveDecisions(storage, [d]);

    const next = changeDecisionStatus(d, "confirmed");
    await replaceDecision(storage, next);

    const loaded = await loadDecisions(storage);
    expect(loaded[0].status).toBe("confirmed");
  });

  test("deleteDecision で物理削除される (確認ダイアログは UI 側)", async () => {
    const d = createDecision({ meetingId: "m1", content: "x" });
    await saveDecisions(storage, [d]);
    await deleteDecision(storage, d.id);
    expect(await loadDecisions(storage)).toEqual([]);
  });
});

describe("Sprint 3 結合: 補助フィルタの実データ動作", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("lastMeetingOfCompany: 同会社の最新打ち合わせを参照できる", async () => {
    await saveMeetings(storage, [
      createMeeting({ companyId: "co1", companyName: "A", date: "2026-01-01", agenda: "x" }),
      createMeeting({ companyId: "co1", companyName: "A", date: "2026-05-01", agenda: "y" }),
      createMeeting({ companyId: "co2", companyName: "B", date: "2026-06-01", agenda: "z" }),
    ]);
    const meetings = await loadMeetings(storage);
    expect(lastMeetingOfCompany(meetings, "co1").date).toBe("2026-05-01");
    expect(lastMeetingOfCompany(meetings, "co2").date).toBe("2026-06-01");
  });

  test("pendingDecisions: 確定済み・キャンセル・削除済み を除外する", async () => {
    const meetingId = "m1";
    await saveDecisions(storage, [
      createDecision({ meetingId, content: "a", status: "pending" }),
      createDecision({ meetingId, content: "b", status: "confirmed" }),
      createDecision({ meetingId, content: "c", status: "cancelled" }),
      { ...createDecision({ meetingId, content: "d", status: "pending" }), deletedAt: "2026-01-01" },
    ]);
    const all = await loadDecisions(storage);
    expect(pendingDecisions(all)).toHaveLength(1);
    expect(decisionsByMeeting(all, meetingId)).toHaveLength(3); // 削除済み除く
  });
});
