// =============================================================================
// __tests__/component/CompanyDetailPage.test.jsx
// Sprint 1 コンポーネントテスト - 会社詳細ページ
//
// 対応 UI 挙動 (ユーザー指摘):
//   5. カードクリック → 詳細ページ → 3タブ切り替え → 戻る
// =============================================================================

import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CompanyDetailPage } from "../../app.jsx";

const fullCompany = {
  id: "c1",
  createdAt: "2026-05-13T10:00:00Z",
  name: "テストハウスメーカー",
  type: "maker",
  contact: "田中太郎",
  phone: "090-1234-5678",
  email: "tanaka@test.co.jp",
  status: "candidate",
  note: "展示場で名刺をもらった会社\n対応が丁寧",
};

function renderPage(props = {}) {
  const onClose = vi.fn();
  const onEdit = vi.fn();
  render(
    <CompanyDetailPage
      company={props.company ?? fullCompany}
      onClose={onClose}
      onEdit={onEdit}
    />
  );
  return { onClose, onEdit };
}

describe("CompanyDetailPage: 基本情報タブ (初期表示)", () => {
  test("会社名と種別がヘッダーに表示される", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /テストハウスメーカー/ })).toBeInTheDocument();
    expect(screen.getByText("ハウスメーカー")).toBeInTheDocument();
  });

  test("ステータスバッジが表示される", () => {
    renderPage();
    expect(screen.getByText("候補")).toBeInTheDocument();
  });

  test("初期表示で基本情報タブがアクティブ", () => {
    renderPage();
    expect(screen.getByTestId("company-detail-tab-info")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("company-detail-tab-meetings")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("company-detail-tab-specs")).toHaveAttribute("aria-selected", "false");
  });

  test("基本情報タブに全フィールドが表示される", () => {
    renderPage();
    expect(screen.getByText("田中太郎")).toBeInTheDocument();
    expect(screen.getByText("090-1234-5678")).toBeInTheDocument();
    expect(screen.getByText("tanaka@test.co.jp")).toBeInTheDocument();
    expect(screen.getByText("2026-05-13")).toBeInTheDocument(); // createdAt の日付部分
    expect(screen.getByText(/展示場で名刺をもらった会社/)).toBeInTheDocument();
  });

  test("phone / email 未設定時は — が表示される", () => {
    renderPage({
      company: { ...fullCompany, phone: undefined, email: undefined },
    });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  test("rejected ステータス時に断り連絡メモが表示される", () => {
    renderPage({
      company: {
        ...fullCompany,
        status: "rejected",
        rejectionNote: "金額が予算オーバーのため",
      },
    });
    expect(screen.getByText(/断り連絡メモ/)).toBeInTheDocument();
    expect(screen.getByText(/金額が予算オーバーのため/)).toBeInTheDocument();
  });

  test("rejected 以外では断り連絡メモが表示されない", () => {
    renderPage({
      company: { ...fullCompany, status: "considering", rejectionNote: "メモ" },
    });
    expect(screen.queryByText(/断り連絡メモ/)).not.toBeInTheDocument();
  });
});

describe("CompanyDetailPage: タブ切り替え (項目5)", () => {
  test("打ち合わせタブをクリックすると Empty State (Sprint 3 待ち) が表示される", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("company-detail-tab-meetings"));
    expect(screen.getByTestId("company-detail-tab-meetings")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/打ち合わせは Sprint 3 で表示されます/)).toBeInTheDocument();
    // 基本情報の田中太郎が見えない
    expect(screen.queryByText("田中太郎")).not.toBeInTheDocument();
  });

  test("仕様値タブをクリックすると Empty State (Sprint 2 待ち) が表示される", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("company-detail-tab-specs"));
    expect(screen.getByTestId("company-detail-tab-specs")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/仕様値は Sprint 2 で表示されます/)).toBeInTheDocument();
  });

  test("info → meetings → specs → info と切り替えできる", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("company-detail-tab-meetings"));
    expect(screen.getByTestId("company-detail-tab-meetings")).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByTestId("company-detail-tab-specs"));
    expect(screen.getByTestId("company-detail-tab-specs")).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByTestId("company-detail-tab-info"));
    expect(screen.getByTestId("company-detail-tab-info")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("田中太郎")).toBeInTheDocument();
  });
});

describe("CompanyDetailPage: ナビゲーション", () => {
  test("← 会社一覧 で onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPage();
    await user.click(screen.getByTestId("company-detail-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("編集ボタンで onEdit が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onEdit } = renderPage();
    await user.click(screen.getByTestId("company-detail-edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe("CompanyDetailPage: アクセシビリティ", () => {
  test("role=dialog / aria-modal=true / aria-label が設定されている", () => {
    renderPage();
    const dialog = screen.getByTestId("company-detail-page");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label");
  });

  test("タブが role=tab で aria-selected を持つ", () => {
    renderPage();
    ["info", "meetings", "specs"].forEach((id) => {
      const tab = screen.getByTestId(`company-detail-tab-${id}`);
      expect(tab).toHaveAttribute("role", "tab");
      expect(tab).toHaveAttribute("aria-selected");
    });
  });
});

describe("CompanyDetailPage: 未指定 company", () => {
  test("company が null の場合は何も描画しない", () => {
    const { container } = render(
      <CompanyDetailPage company={null} onClose={vi.fn()} onEdit={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});
