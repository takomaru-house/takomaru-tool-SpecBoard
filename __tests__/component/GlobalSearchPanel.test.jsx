// =============================================================================
// __tests__/component/GlobalSearchPanel.test.jsx
// Sprint 5 コンポーネントテスト - グローバル検索パネル
//
// 対応 UI 挙動:
//   TC_103: Meeting/Decision/SpecItem/Company を横断検索
//   TC_105: 0件で空振りメッセージ
//   ハイライト表示 / セクション分割 / クリックでナビゲーション
// =============================================================================

import { describe, test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GlobalSearchPanel } from "../../app.jsx";

const baseData = {
  companies: [
    { id: "c1", name: "A社", contact: "田中", note: "対応丁寧" },
    { id: "c2", name: "B社", contact: "鈴木", note: "" },
  ],
  meetings: [
    { id: "m1", title: "断熱会議", agenda: "断熱の検討", summary: "GW 16K→24K", location: "A社" },
    { id: "m2", title: "サッシ会議", agenda: "サッシ選定", summary: "", location: "B社" },
  ],
  decisions: [
    { id: "d1", content: "断熱を高性能化", note: "確定", specValue: "GW 24K", meetingId: "m1" },
    { id: "d2", content: "サッシ未定", note: "", specValue: "", meetingId: "m2" },
  ],
  specItems: [
    { id: "s1", name: "断熱材" },
    { id: "s2", name: "玄関ドア" },
  ],
};

function renderPanel({ query = "断熱", onNavigate = vi.fn(), onClose = vi.fn(), data = baseData } = {}) {
  render(
    <GlobalSearchPanel data={data} query={query} onNavigate={onNavigate} onClose={onClose} />
  );
  return { onNavigate, onClose };
}

describe("GlobalSearchPanel: 横断検索 (TC_103)", () => {
  test("4 エンティティの一致がそれぞれセクション表示される", () => {
    renderPanel({ query: "断熱" });

    expect(screen.getByTestId("search-meeting-section")).toBeInTheDocument();
    expect(screen.getByTestId("search-decision-section")).toBeInTheDocument();
    expect(screen.getByTestId("search-spec-item-section")).toBeInTheDocument();
    // companies で "断熱" は無いのでセクションは出ない
    expect(screen.queryByTestId("search-company-section")).not.toBeInTheDocument();

    expect(screen.getByTestId("search-meeting-m1")).toBeInTheDocument();
    expect(screen.getByTestId("search-decision-d1")).toBeInTheDocument();
    expect(screen.getByTestId("search-spec-item-s1")).toBeInTheDocument();
  });

  test("会社名でヒット", () => {
    renderPanel({ query: "田中" });
    expect(screen.getByTestId("search-company-c1")).toBeInTheDocument();
  });

  test("結果総数が見出しに表示される", () => {
    renderPanel({ query: "断熱" });
    expect(screen.getByTestId("global-search-panel")).toHaveTextContent("Search results: 3");
  });
});

describe("GlobalSearchPanel: 空振り (TC_105)", () => {
  test("0件で「一致する記録が見つかりません」メッセージ", () => {
    renderPanel({ query: "ぜったい存在しない文字列xyz" });
    expect(screen.getByTestId("global-search-empty")).toBeInTheDocument();
    expect(screen.getByTestId("global-search-empty"))
      .toHaveTextContent(/一致する記録が見つかりません/);
  });

  test("空文字クエリで panel 自体が描画されない", () => {
    const { container } = render(
      <GlobalSearchPanel data={baseData} query="" onNavigate={() => {}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("GlobalSearchPanel: ハイライト", () => {
  test("マッチ文字列が <mark> でラップされる", () => {
    renderPanel({ query: "断熱" });
    const entry = screen.getByTestId("search-meeting-m1");
    const marks = entry.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent).toBe("断熱");
  });

  test("大文字小文字無視でハイライト", () => {
    renderPanel({
      query: "a社",
      data: {
        ...baseData,
        companies: [{ id: "c1", name: "A社", contact: "x", note: "" }],
      },
    });
    const entry = screen.getByTestId("search-company-c1");
    expect(entry.querySelector("mark").textContent).toBe("A社"); // 元のテキストの "A社" がハイライトされる
  });
});

describe("GlobalSearchPanel: クリック挙動", () => {
  test("会社結果クリックで onNavigate('companies') が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderPanel({ query: "田中" });
    await user.click(screen.getByTestId("search-company-c1"));
    expect(onNavigate).toHaveBeenCalledWith("companies");
  });

  test("打ち合わせ結果クリックで onNavigate('meetings', { meetingId })", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderPanel({ query: "断熱" });
    await user.click(screen.getByTestId("search-meeting-m1"));
    expect(onNavigate).toHaveBeenCalledWith("meetings", { meetingId: "m1" });
  });

  test("決定事項クリックは打ち合わせタブへ", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderPanel({ query: "断熱" });
    await user.click(screen.getByTestId("search-decision-d1"));
    expect(onNavigate).toHaveBeenCalledWith("meetings", { meetingId: "m1" });
  });

  test("仕様項目クリックで onNavigate('spec-comparison')", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderPanel({ query: "断熱" });
    await user.click(screen.getByTestId("search-spec-item-s1"));
    expect(onNavigate).toHaveBeenCalledWith("spec-comparison");
  });

  test("✕ ボタンで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel({ query: "断熱" });
    await user.click(screen.getByTestId("global-search-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
