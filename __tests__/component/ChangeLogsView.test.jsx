// =============================================================================
// __tests__/component/ChangeLogsView.test.jsx
// Sprint 4 コンポーネントテスト - 変更ログタイムライン
//
// 対応 UI 挙動:
//   TC_083: ChangeLog UI に削除操作が存在しない (改ざん防止)
//   TC_086: 削除済み仕様項目を参照するログに「[削除済み仕様項目]」ラベル
//   TC_087: 変更ログが日付降順で表示される
//   Empty State / フィルター (会社・カテゴリ・期間) / 無限スクロール (Load More)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import { ChangeLogsView, ToastProvider, ConfirmProvider } from "../../app.jsx";

function renderView() {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <ChangeLogsView />
      </ConfirmProvider>
    </ToastProvider>
  );
}

async function seed({
  companies = [], categories = [], specItems = [],
  meetings = [], changeLogs = [],
} = {}) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(specItems));
  await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
  await window.storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(changeLogs));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

const log = (id, opts = {}) => ({
  id, specItemId: opts.specItemId || "s1", companyId: opts.companyId || "co1",
  previousValue: opts.previousValue || "", newValue: opts.newValue || "v",
  meetingId: opts.meetingId, reason: opts.reason,
  changedAt: opts.changedAt || "2026-05-13T10:00:00Z",
  createdAt: opts.createdAt || "2026-05-13T10:00:00Z",
});

describe("ChangeLogsView: 空のとき Empty State", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("変更ログが0件で Empty State", async () => {
    await seed({});
    renderView();
    expect(await screen.findByTestId("change-logs-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/まだ仕様の変更がありません/)).toBeInTheDocument();
  });
});

describe("ChangeLogsView: 日付降順表示 (TC_087)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("changedAt が降順に並ぶ", async () => {
    await seed({
      companies: [{ id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
      categories: [{ id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0, isDefault: false, createdAt: "x" }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" }],
      changeLogs: [
        log("l1", { changedAt: "2026-01-01T00:00:00Z", newValue: "v1" }),
        log("l2", { changedAt: "2026-05-01T00:00:00Z", newValue: "v2" }),
        log("l3", { changedAt: "2026-03-01T00:00:00Z", newValue: "v3" }),
      ],
    });
    renderView();

    const timeline = await screen.findByTestId("change-log-timeline");
    const entries = within(timeline).getAllByTestId(/^change-log-entry-/);
    const ids = entries.map((e) => e.getAttribute("data-testid").replace("change-log-entry-", ""));
    expect(ids).toEqual(["l2", "l3", "l1"]);
  });
});

describe("ChangeLogsView: 削除済み仕様項目ラベル (TC_086 / E14)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("specItem が見つからない場合 '[削除済み仕様項目]' を表示", async () => {
    await seed({
      companies: [{ id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
      specItems: [], // specItem 不在
      changeLogs: [log("l1", { specItemId: "missing-item" })],
    });
    renderView();
    const entry = await screen.findByTestId("change-log-entry-l1");
    expect(within(entry).getByText("[削除済み仕様項目]")).toBeInTheDocument();
  });

  test("company が見つからない場合 '[削除済み会社]' を表示", async () => {
    await seed({
      companies: [], // company 不在
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" }],
      changeLogs: [log("l1", { companyId: "missing-company" })],
    });
    renderView();
    const entry = await screen.findByTestId("change-log-entry-l1");
    expect(within(entry).getByText(/\[削除済み会社\]/)).toBeInTheDocument();
  });
});

describe("ChangeLogsView: 改ざん防止 (TC_083 / F-BR-007)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("ChangeLog エントリに削除ボタンが存在しない", async () => {
    await seed({
      companies: [{ id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" }],
      changeLogs: [log("l1"), log("l2"), log("l3")],
    });
    renderView();

    const timeline = await screen.findByTestId("change-log-timeline");
    const buttons = within(timeline).queryAllByRole("button");
    const deleteButtons = buttons.filter((b) => /削除|delete|remove/i.test(b.textContent || ""));
    expect(deleteButtons).toEqual([]);
  });
});

describe("ChangeLogsView: フィルター", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  const setup = () => seed({
    companies: [
      { id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" },
      { id: "co2", name: "B社", contact: "x", type: "maker", status: "considering", createdAt: "x" },
    ],
    categories: [
      { id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0, isDefault: false, createdAt: "x" },
      { id: "c2", name: "構造", normalizedName: "構造", sortOrder: 1, isDefault: false, createdAt: "x" },
    ],
    specItems: [
      { id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" },
      { id: "s2", name: "工法", categoryId: "c2", sortOrder: 0, values: [], createdAt: "x" },
    ],
    changeLogs: [
      log("l1", { specItemId: "s1", companyId: "co1", changedAt: "2026-01-01T00:00:00Z" }),
      log("l2", { specItemId: "s1", companyId: "co2", changedAt: "2026-03-01T00:00:00Z" }),
      log("l3", { specItemId: "s2", companyId: "co1", changedAt: "2026-05-01T00:00:00Z" }),
    ],
  });

  test("会社フィルター", async () => {
    const user = userEvent.setup();
    await setup();
    renderView();
    await screen.findByTestId("change-log-timeline");
    expect(screen.getAllByTestId(/^change-log-entry-/)).toHaveLength(3);

    await user.selectOptions(screen.getByTestId("change-log-filter-company"), "co1");
    const remaining = screen.getAllByTestId(/^change-log-entry-/).map((e) => e.getAttribute("data-testid"));
    expect(remaining.sort()).toEqual(["change-log-entry-l1", "change-log-entry-l3"]);
  });

  test("カテゴリフィルター (specItem.categoryId で絞り込み)", async () => {
    const user = userEvent.setup();
    await setup();
    renderView();
    await screen.findByTestId("change-log-timeline");

    await user.selectOptions(screen.getByTestId("change-log-filter-category"), "c2");
    expect(screen.getAllByTestId(/^change-log-entry-/)).toHaveLength(1);
    expect(screen.getByTestId("change-log-entry-l3")).toBeInTheDocument();
  });

  test("期間フィルター (from-to)", async () => {
    const user = userEvent.setup();
    await setup();
    renderView();
    await screen.findByTestId("change-log-timeline");

    await user.type(screen.getByTestId("change-log-filter-from"), "2026-02-01");
    await user.type(screen.getByTestId("change-log-filter-to"), "2026-04-30");
    expect(screen.getAllByTestId(/^change-log-entry-/)).toHaveLength(1);
    expect(screen.getByTestId("change-log-entry-l2")).toBeInTheDocument();
  });

  test("フィルター条件にマッチなしで Empty State", async () => {
    const user = userEvent.setup();
    await setup();
    renderView();
    await screen.findByTestId("change-log-timeline");

    await user.selectOptions(screen.getByTestId("change-log-filter-category"), "c1");
    await user.type(screen.getByTestId("change-log-filter-from"), "2027-01-01");

    expect(screen.getByTestId("change-logs-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/条件に一致する変更ログがありません/)).toBeInTheDocument();
  });
});

describe("ChangeLogsView: Load More (無限スクロール代替)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("31 件以上で「さらに表示」ボタンが表示され、押すと追加表示される", async () => {
    const user = userEvent.setup();
    const logs = [];
    for (let i = 0; i < 35; i++) {
      const dateNum = String(i + 1).padStart(2, "0");
      logs.push(log(`l${i}`, { changedAt: `2026-01-${dateNum}T00:00:00Z` }));
    }
    await seed({
      companies: [{ id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" }],
      changeLogs: logs,
    });
    renderView();

    await screen.findByTestId("change-log-timeline");
    // 初期 30 件
    expect(screen.getAllByTestId(/^change-log-entry-/)).toHaveLength(30);
    expect(screen.getByTestId("change-log-load-more")).toBeInTheDocument();

    await user.click(screen.getByTestId("change-log-load-more"));
    // +20 件で 35 件 (上限)
    expect(screen.getAllByTestId(/^change-log-entry-/)).toHaveLength(35);
    expect(screen.queryByTestId("change-log-load-more")).not.toBeInTheDocument();
  });
});

describe("ChangeLogsView: 打ち合わせリンク", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("meetingId を持つログには打ち合わせリンクが表示される", async () => {
    await seed({
      companies: [{ id: "co1", name: "A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2026-05-13", title: "初回", agenda: "x", createdAt: "x" }],
      changeLogs: [log("l1", { meetingId: "m1" })],
    });
    renderView();
    const entry = await screen.findByTestId("change-log-entry-l1");
    expect(within(entry).getByText(/初回/)).toBeInTheDocument();
  });
});
