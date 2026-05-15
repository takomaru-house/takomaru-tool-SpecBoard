// =============================================================================
// __tests__/component/SpecReflectionFlow.test.jsx
// Sprint 4 コンポーネントテスト - 仕様反映フロー (MeetingsView + ダイアログ)
//
// 対応 UI 挙動:
//   - 仕様反映ボタン (Decision に specItemId + specCompanyId + specValue がある時のみ)
//   - SpecReflectionDialog: 変更前/変更後表示・変更理由入力
//   - 確定後: SpecItem & ChangeLog 同時保存 (TC_080 経由 UI)
//   - TC_086 削除済み仕様項目 → 反映ボタン非表示 / ラベル表示 (E14)
//   - 反映完了で Decision ステータスが自動的に "confirmed" に変わる
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import { MeetingsView, ToastProvider, ConfirmProvider } from "../../app.jsx";

function renderView() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MeetingsView saveDisabled={false} />
      </ConfirmProvider>
    </ToastProvider>
  );
}

async function seed({ companies = [], categories = [], specItems = [], meetings = [], decisions = [], changeLogs = [] } = {}) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(specItems));
  await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
  await window.storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(decisions));
  await window.storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(changeLogs));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

const baseSeed = {
  companies: [{ id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
  categories: [{ id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0, isDefault: false, createdAt: "x" }],
  specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" }],
  meetings: [{
    id: "m1", companyId: "co1", date: "2026-05-13",
    title: "M1", agenda: "断熱の検討", attendees: [], createdAt: "x",
  }],
};

describe("仕様反映フロー: 「仕様に反映」ボタンの表示制御", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("specItemId/specCompanyId/specValue が揃っているとボタン表示", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      decisions: [{
        id: "d1", meetingId: "m1", content: "断熱材確定", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: "GW 24K", createdAt: "x",
      }],
    });
    renderView();
    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    expect(within(detail).getByTestId("decision-reflect-d1")).toBeInTheDocument();
  });

  test("specValue が空ならボタン非表示", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      decisions: [{
        id: "d1", meetingId: "m1", content: "x", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: undefined, createdAt: "x",
      }],
    });
    renderView();
    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    expect(within(detail).queryByTestId("decision-reflect-d1")).not.toBeInTheDocument();
  });

  test("specItem が削除済みならボタン非表示 + 「[削除済み仕様項目]」ラベル表示 (TC_086)", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      specItems: [
        { id: "s1", name: "削除対象", categoryId: "c1", sortOrder: 0, values: [],
          createdAt: "x", deletedAt: "2026-04-01T00:00:00Z" }
      ],
      decisions: [{
        id: "d1", meetingId: "m1", content: "x", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: "v", createdAt: "x",
      }],
    });
    renderView();
    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    expect(within(detail).queryByTestId("decision-reflect-d1")).not.toBeInTheDocument();
    expect(within(detail).getByTestId("decision-deleted-spec-item-d1")).toHaveTextContent("[削除済み仕様項目]");
  });

  test("specItemId が完全に存在しない場合もラベル表示", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      specItems: [], // 仕様項目 全削除
      decisions: [{
        id: "d1", meetingId: "m1", content: "x", status: "pending",
        specItemId: "nonexistent", specCompanyId: "co1", specValue: "v", createdAt: "x",
      }],
    });
    renderView();
    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    expect(within(detail).getByTestId("decision-deleted-spec-item-d1")).toBeInTheDocument();
  });
});

describe("仕様反映フロー: SpecReflectionDialog の動作", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("ダイアログに変更前・変更後の値が表示される", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      specItems: [{
        id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, createdAt: "x",
        values: [{ companyId: "co1", value: "GW 16K", updatedAt: "x" }],
      }],
      decisions: [{
        id: "d1", meetingId: "m1", content: "ハイグレード化", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: "高性能GW 24K", createdAt: "x",
      }],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    await user.click(within(detail).getByTestId("decision-reflect-d1"));

    const dialog = await screen.findByTestId("spec-reflection-dialog");
    expect(within(dialog).getByTestId("spec-reflection-item-name")).toHaveTextContent("断熱材");
    expect(within(dialog).getByTestId("spec-reflection-company-name")).toHaveTextContent("A社");
    expect(within(dialog).getByTestId("spec-reflection-previous")).toHaveTextContent("GW 16K");
    expect(within(dialog).getByTestId("spec-reflection-new")).toHaveTextContent("高性能GW 24K");
  });

  test("確定すると SpecItem と ChangeLog が同時保存される (TC_080 UI層)", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      decisions: [{
        id: "d1", meetingId: "m1", content: "確定", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: "高性能GW 24K", createdAt: "x",
      }],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    await user.click(within(detail).getByTestId("decision-reflect-d1"));

    const dialog = await screen.findByTestId("spec-reflection-dialog");
    await user.type(within(dialog).getByTestId("spec-reflection-reason-input"), "打ち合わせで合意");
    await user.click(within(dialog).getByTestId("spec-reflection-confirm"));

    await waitFor(() => {
      expect(screen.queryByTestId("spec-reflection-dialog")).not.toBeInTheDocument();
    });

    // SpecItem に値が入っている
    const items = JSON.parse(await window.storage.getItem(STORAGE_KEYS.SPEC_ITEMS));
    const target = items.find((i) => i.id === "s1");
    expect(target.values).toHaveLength(1);
    expect(target.values[0]).toMatchObject({
      companyId: "co1", value: "高性能GW 24K",
    });

    // ChangeLog が記録されている
    const logs = JSON.parse(await window.storage.getItem(STORAGE_KEYS.CHANGE_LOGS));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      specItemId: "s1", companyId: "co1",
      previousValue: "", newValue: "高性能GW 24K",
      reason: "打ち合わせで合意",
    });

    // Decision のステータスが confirmed に
    const decisions = JSON.parse(await window.storage.getItem(STORAGE_KEYS.DECISIONS));
    expect(decisions.find((d) => d.id === "d1").status).toBe("confirmed");
  });

  test("ESC キーでダイアログを閉じられる", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      decisions: [{
        id: "d1", meetingId: "m1", content: "x", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: "v", createdAt: "x",
      }],
    });
    renderView();
    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    await user.click(within(detail).getByTestId("decision-reflect-d1"));

    await screen.findByTestId("spec-reflection-dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("spec-reflection-dialog")).not.toBeInTheDocument();
    });
  });

  test("キャンセルボタンでダイアログを閉じる (SpecItem には影響なし)", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      decisions: [{
        id: "d1", meetingId: "m1", content: "x", status: "pending",
        specItemId: "s1", specCompanyId: "co1", specValue: "v", createdAt: "x",
      }],
    });
    renderView();
    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    await user.click(within(detail).getByTestId("decision-reflect-d1"));
    const dialog = await screen.findByTestId("spec-reflection-dialog");
    await user.click(within(dialog).getByTestId("spec-reflection-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("spec-reflection-dialog")).not.toBeInTheDocument();
    });
    // SpecItem には何も書き込まれていない
    const items = JSON.parse(await window.storage.getItem(STORAGE_KEYS.SPEC_ITEMS));
    expect(items[0].values).toEqual([]);
  });
});

describe("仕様反映フロー: 後勝ち (TC_082 UI層)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("同一 Decision を複数回反映すると ChangeLog が累積記録される", async () => {
    const user = userEvent.setup();
    await seed({
      ...baseSeed,
      decisions: [
        { id: "d1", meetingId: "m1", content: "1回目", status: "pending",
          specItemId: "s1", specCompanyId: "co1", specValue: "v1", createdAt: "x" },
        { id: "d2", meetingId: "m1", content: "2回目", status: "pending",
          specItemId: "s1", specCompanyId: "co1", specValue: "v2", createdAt: "y" },
      ],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");

    // 1 回目反映
    await user.click(within(detail).getByTestId("decision-reflect-d1"));
    let dialog = await screen.findByTestId("spec-reflection-dialog");
    await user.click(within(dialog).getByTestId("spec-reflection-confirm"));
    await waitFor(() => {
      expect(screen.queryByTestId("spec-reflection-dialog")).not.toBeInTheDocument();
    });

    // 2 回目反映
    await user.click(within(detail).getByTestId("decision-reflect-d2"));
    dialog = await screen.findByTestId("spec-reflection-dialog");
    await user.click(within(dialog).getByTestId("spec-reflection-confirm"));
    await waitFor(() => {
      expect(screen.queryByTestId("spec-reflection-dialog")).not.toBeInTheDocument();
    });

    const logs = JSON.parse(await window.storage.getItem(STORAGE_KEYS.CHANGE_LOGS));
    expect(logs).toHaveLength(2);
    expect(logs[0].newValue).toBe("v1");
    expect(logs[1].previousValue).toBe("v1");
    expect(logs[1].newValue).toBe("v2");

    // SpecItem は最終値 (後勝ち)
    const items = JSON.parse(await window.storage.getItem(STORAGE_KEYS.SPEC_ITEMS));
    expect(items[0].values).toHaveLength(1);
    expect(items[0].values[0].value).toBe("v2");
  });
});
