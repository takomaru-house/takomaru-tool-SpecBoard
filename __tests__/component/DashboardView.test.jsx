// =============================================================================
// __tests__/component/DashboardView.test.jsx
// Sprint 5 コンポーネントテスト - ダッシュボード
//
// 対応 UI 挙動:
//   TC_100: 4種サマリーカードの数値が実データと一致 (UI 層)
//   TC_101: サマリーカードクリックで対応タブへ遷移
//   TC_102: 全社落選で Empty State (E13)
//   会社0件 / Pending Actions / 直近5件 / 直近決定事項
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import { DashboardView, ToastProvider, ConfirmProvider } from "../../app.jsx";

function renderView({ onNavigate = vi.fn() } = {}) {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <DashboardView onNavigate={onNavigate} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onNavigate };
}

async function seed({ companies = [], meetings = [], decisions = [] } = {}) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
  await window.storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(decisions));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

const co = (id, status, opts = {}) => ({
  id, name: `${id}社`, status,
  contact: "x", type: "maker", createdAt: opts.createdAt || "x",
  ...(opts.deletedAt && { deletedAt: opts.deletedAt }),
});

describe("DashboardView: 会社0件 CTA Empty State", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社が0件で CTA Empty State を表示", async () => {
    await seed({});
    renderView();
    expect(await screen.findByTestId("dashboard-empty-no-companies")).toBeInTheDocument();
    expect(screen.getByText(/まず会社を登録してはじめましょう/)).toBeInTheDocument();
  });

  test("CTA「会社を登録する」で companies タブへ遷移", async () => {
    const user = userEvent.setup();
    await seed({});
    const { onNavigate } = renderView();
    await screen.findByTestId("dashboard-empty-no-companies");
    await user.click(screen.getByTestId("dashboard-cta-add-company"));
    expect(onNavigate).toHaveBeenCalledWith("companies");
  });
});

describe("DashboardView: 全社落選 E13 (TC_102)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("候補/検討中が0件で「現在候補会社がありません」を表示", async () => {
    await seed({
      companies: [
        co("a", "rejected"),
        co("b", "contracted"),
        co("c", "rejected"),
      ],
    });
    renderView();
    expect(await screen.findByTestId("dashboard-no-active-candidates")).toBeInTheDocument();
    expect(screen.getByText(/現在候補会社がありません/)).toBeInTheDocument();
  });

  test("検討中が1件でもあれば E13 にならない", async () => {
    await seed({
      companies: [
        co("a", "rejected"),
        co("b", "considering"),
      ],
    });
    renderView();
    expect(await screen.findByTestId("dashboard-view")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-no-active-candidates")).not.toBeInTheDocument();
  });
});

describe("DashboardView: サマリーカード (TC_100, TC_101)", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_100: 4種サマリーの数値が実データと一致", async () => {
    await seed({
      companies: [
        co("a", "considering"),
        co("b", "considering"),
        co("c", "candidate"),
      ],
      meetings: [
        { id: "m1", date: "2026-05-01", createdAt: "1" },
        { id: "m2", date: "2026-05-02", createdAt: "2" },
        { id: "m3", date: "2026-05-03", createdAt: "3" },
      ],
      decisions: [
        { id: "d1", status: "pending", createdAt: "1" },
        { id: "d2", status: "pending", createdAt: "2" },
        { id: "d3", status: "confirmed", createdAt: "3" },
      ],
    });
    renderView();
    await screen.findByTestId("dashboard-view");

    expect(screen.getByTestId("summary-value-considering")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-value-candidate")).toHaveTextContent("1");
    expect(screen.getByTestId("summary-value-meetingCount")).toHaveTextContent("3");
    expect(screen.getByTestId("summary-value-pendingCount")).toHaveTextContent("2");
  });

  test("TC_101: サマリーカードクリックでタブ遷移", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "considering"), co("b", "candidate")],
    });
    const { onNavigate } = renderView();
    await screen.findByTestId("dashboard-view");

    await user.click(screen.getByTestId("summary-card-considering"));
    expect(onNavigate).toHaveBeenCalledWith("companies", expect.objectContaining({ statusFilter: "considering" }));

    await user.click(screen.getByTestId("summary-card-meetingCount"));
    expect(onNavigate).toHaveBeenCalledWith("meetings", expect.anything());

    await user.click(screen.getByTestId("summary-card-pendingCount"));
    expect(onNavigate).toHaveBeenCalledWith("meetings", expect.anything());
  });
});

describe("DashboardView: Pending Actions", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("pending Decision が一覧に表示される", async () => {
    await seed({
      companies: [co("a", "considering")],
      meetings: [{ id: "m1", date: "2026-05-13", title: "M1", companyId: "a", agenda: "x", createdAt: "x" }],
      decisions: [
        { id: "d1", status: "pending", meetingId: "m1", content: "確認待ちA", createdAt: "1" },
        { id: "d2", status: "pending", meetingId: "m1", content: "確認待ちB", createdAt: "2" },
        { id: "d3", status: "confirmed", meetingId: "m1", content: "確定済", createdAt: "3" },
      ],
    });
    renderView();
    await screen.findByTestId("dashboard-view");

    expect(screen.getByTestId("pending-item-d1")).toBeInTheDocument();
    expect(screen.getByTestId("pending-item-d2")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-item-d3")).not.toBeInTheDocument();
  });

  test("pending 0件で「未確定の決定事項はありません」表示", async () => {
    await seed({
      companies: [co("a", "considering")],
    });
    renderView();
    await screen.findByTestId("dashboard-view");
    expect(screen.getByText(/未確定の決定事項はありません/)).toBeInTheDocument();
  });
});

describe("DashboardView: 直近5件リスト", () => {
  let restored;
  beforeEach(() => { restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) }); });
  afterEach(() => restoreGlobalStorage(restored));

  test("直近の打ち合わせが日付降順で表示される", async () => {
    await seed({
      companies: [co("a", "considering")],
      meetings: [
        { id: "m1", date: "2026-01-01", title: "古い", companyId: "a", agenda: "x", createdAt: "1" },
        { id: "m2", date: "2026-05-01", title: "新しい", companyId: "a", agenda: "x", createdAt: "2" },
      ],
    });
    renderView();
    await screen.findByTestId("dashboard-view");
    const list = screen.getByTestId("recent-meetings-list");
    const items = within(list).getAllByTestId(/^recent-meeting-/);
    expect(items[0]).toHaveAttribute("data-testid", "recent-meeting-m2");
  });

  test("「全件を見る→」リンクが対応タブに遷移", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "considering")],
      meetings: [{ id: "m1", date: "2026-05-01", title: "x", companyId: "a", agenda: "x", createdAt: "1" }],
    });
    const { onNavigate } = renderView();
    await screen.findByTestId("dashboard-view");

    await user.click(screen.getByTestId("recent-meetings-see-all"));
    expect(onNavigate).toHaveBeenCalledWith("meetings");

    await user.click(screen.getByTestId("recent-decisions-see-all"));
    expect(onNavigate).toHaveBeenCalledWith("change-logs");
  });
});
