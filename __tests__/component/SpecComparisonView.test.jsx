// =============================================================================
// __tests__/component/SpecComparisonView.test.jsx
// Sprint 2 コンポーネントテスト - 仕様比較ビュー (UI 統合)
//
// 対応 UI 挙動:
//   TC_049 (会社0件 → Empty State / E1)
//   TC_050 (XSS 防止: 仕様値セルの HTML タグはテキストとして表示)
//   TC_046 UI 層 (メモ追加・編集・削除)
//   カテゴリ追加・仕様項目追加・並び替え (▲▼) / 削除確認
//   カテゴリ折りたたみ / 列toggle / 「未入力のみ表示」
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import { SpecComparisonView, ToastProvider, ConfirmProvider } from "../../app.jsx";

// 共通: ToastProvider + ConfirmProvider でラップしてレンダリング
function renderView(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <SpecComparisonView saveDisabled={props.saveDisabled ?? false} />
      </ConfirmProvider>
    </ToastProvider>
  );
}

// テスト用にストレージへ初期データ投入
async function seed({ companies = [], categories = [], specItems = [], notes = [], changeLogs = [] } = {}) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(specItems));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify(notes));
  await window.storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(changeLogs));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

const co = (id, name, status = "considering") => ({
  id, name, contact: "担当", type: "maker", status, createdAt: "2026-01-01T00:00:00Z",
});
const cat = (id, name, sortOrder = 0) => ({
  id, name, normalizedName: name.toLowerCase(),
  sortOrder, isDefault: false, createdAt: "2026-01-01T00:00:00Z",
});
const item = (id, name, categoryId, sortOrder = 0, values = []) => ({
  id, name, categoryId, sortOrder, values, createdAt: "2026-01-01T00:00:00Z",
});

describe("SpecComparisonView: 項目: 会社0件 Empty State (TC_049 / E1)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社が1件もなければ「会社を先に登録してください」Empty State", async () => {
    await seed({ companies: [], categories: [cat("c1", "断熱")], specItems: [item("s1", "断熱材", "c1")] });

    renderView();

    expect(await screen.findByTestId("spec-empty-state-no-companies")).toBeInTheDocument();
    expect(screen.getByText(/比較する会社を先に登録してください/)).toBeInTheDocument();
    // テーブルは表示されない
    expect(screen.queryByTestId("spec-table")).not.toBeInTheDocument();
  });
});

describe("SpecComparisonView: 仕様項目0件 Empty State", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社はあるがカテゴリ・項目が0件なら Empty State", async () => {
    await seed({ companies: [co("a", "A社")], categories: [], specItems: [] });
    renderView();

    expect(await screen.findByTestId("spec-empty-state-no-items")).toBeInTheDocument();
    expect(screen.getByText(/仕様項目がありません/)).toBeInTheDocument();
  });
});

describe("SpecComparisonView: 基本表示", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社・カテゴリ・項目があればテーブルが表示される", async () => {
    await seed({
      companies: [co("a", "A社"), co("b", "B社")],
      categories: [cat("c1", "断熱", 0)],
      specItems: [item("s1", "断熱材", "c1", 0, [{ companyId: "a", value: "GW 16K", updatedAt: "x" }])],
    });
    renderView();

    expect(await screen.findByTestId("spec-table")).toBeInTheDocument();
    // 列ヘッダーで会社名が見える
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent.trim());
    expect(headers).toEqual(expect.arrayContaining(["A社", "B社"]));
    expect(screen.getByTestId("spec-item-name-s1")).toHaveTextContent("断熱材");
    expect(screen.getByTestId("spec-cell-value-s1-a")).toHaveTextContent("GW 16K");
    // B 社は値なし → セルは表示されるが値は無い
    expect(screen.queryByTestId("spec-cell-value-s1-b")).not.toBeInTheDocument();
  });
});

describe("SpecComparisonView: XSS 防止 (TC_050 / NF-SC-002)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("仕様値に HTML タグを入力してもテキストとして表示される", async () => {
    const malicious = '<img src=x onerror="window.__xssExecuted=true">';
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "断熱材", "c1", 0, [
        { companyId: "a", value: malicious, updatedAt: "x" },
      ])],
    });

    renderView();

    const cellValue = await screen.findByTestId("spec-cell-value-s1-a");
    // textContent としては元の文字列が見える
    expect(cellValue.textContent).toContain(malicious);
    // 内部に <img> 要素は作成されていない (React のエスケープが効いている)
    expect(cellValue.querySelector("img")).toBeNull();
    // window 経由でも実行されていない
    expect(window.__xssExecuted).toBeUndefined();
  });

  test("会社名・仕様項目名にスクリプトタグを含めても実行されない", async () => {
    await seed({
      companies: [co("a", '<script>window.__xss2=true</script>邪悪社')],
      categories: [cat("c1", "<script>邪悪</script>カテゴリ")],
      specItems: [item("s1", "<b>太字</b>項目", "c1")],
    });

    renderView();

    await waitFor(() => {
      expect(screen.getByTestId("spec-table")).toBeInTheDocument();
    });
    // 内部に script 要素は無い
    expect(document.querySelector("[data-testid='spec-table'] script")).toBeNull();
    expect(window.__xss2).toBeUndefined();
  });
});

describe("SpecComparisonView: カテゴリ折りたたみ", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("カテゴリトグルで配下の仕様行が表示/非表示になる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱"), cat("c2", "構造", 1)],
      specItems: [
        item("s1", "断熱材", "c1"),
        item("s2", "工法", "c2"),
      ],
    });
    renderView();

    expect(await screen.findByTestId("spec-row-s1")).toBeInTheDocument();
    expect(screen.getByTestId("spec-row-s2")).toBeInTheDocument();

    await user.click(screen.getByTestId("category-toggle-c1"));
    expect(screen.queryByTestId("spec-row-s1")).not.toBeInTheDocument();
    expect(screen.getByTestId("spec-row-s2")).toBeInTheDocument();

    await user.click(screen.getByTestId("category-toggle-c1"));
    expect(screen.getByTestId("spec-row-s1")).toBeInTheDocument();
  });
});

describe("SpecComparisonView: 列トグル / 未入力フィルター", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("列トグルで会社列を非表示にできる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社"), co("b", "B社"), co("c", "C社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "断熱材", "c1")],
    });
    renderView();

    expect(await screen.findByTestId("spec-table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent.trim())).toEqual(
      expect.arrayContaining(["項目", "A社", "B社", "C社"])
    );

    await user.click(screen.getByTestId("column-toggle-b"));
    // B 社のセルが消える
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent.trim());
    expect(headers).not.toContain("B社");
    expect(headers).toContain("A社");
    expect(headers).toContain("C社");
  });

  test("「未入力のみ表示」で全社空の行のみが残る", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社"), co("b", "B社")],
      categories: [cat("c1", "断熱")],
      specItems: [
        item("s1", "値あり項目", "c1", 0, [{ companyId: "a", value: "GW", updatedAt: "x" }]),
        item("s2", "全社空項目", "c1", 1),
      ],
    });
    renderView();

    expect(await screen.findByTestId("spec-row-s1")).toBeInTheDocument();
    expect(screen.getByTestId("spec-row-s2")).toBeInTheDocument();

    await user.click(screen.getByTestId("filter-empty-only"));
    expect(screen.queryByTestId("spec-row-s1")).not.toBeInTheDocument();
    expect(screen.getByTestId("spec-row-s2")).toBeInTheDocument();
  });
});

describe("SpecComparisonView: 仕様項目の並び替え", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("▲ボタンで上に移動し、再mount後も順序が保持される (TC_045 UI層)", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [
        item("s1", "A", "c1", 0),
        item("s2", "B", "c1", 1),
        item("s3", "C", "c1", 2),
      ],
    });
    const { unmount } = renderView();

    await screen.findByTestId("spec-table");
    // B の ▲ をクリック → A B C → B A C
    await user.click(screen.getByTestId("spec-item-move-up-s2"));

    await waitFor(() => {
      const rows = screen.getAllByTestId(/^spec-row-/);
      const names = rows.map((r) => within(r).queryByTestId(/^spec-item-name-/)?.textContent);
      expect(names).toEqual(["B", "A", "C"]);
    });

    // 再 mount でも順序保持
    unmount();
    renderView();
    await screen.findByTestId("spec-table");
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^spec-row-/);
      const names = rows.map((r) => within(r).queryByTestId(/^spec-item-name-/)?.textContent);
      expect(names).toEqual(["B", "A", "C"]);
    });
  });

  test("先頭項目の ▲ は disabled", async () => {
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "A", "c1", 0), item("s2", "B", "c1", 1)],
    });
    renderView();
    expect(await screen.findByTestId("spec-item-move-up-s1")).toBeDisabled();
    expect(screen.getByTestId("spec-item-move-down-s1")).toBeEnabled();
    expect(screen.getByTestId("spec-item-move-up-s2")).toBeEnabled();
    expect(screen.getByTestId("spec-item-move-down-s2")).toBeDisabled();
  });
});

describe("SpecComparisonView: 仕様項目の追加・編集・削除", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("仕様項目を追加できる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [],
    });
    renderView();

    await screen.findByTestId("spec-comparison-view");
    await user.click(screen.getByTestId("add-spec-item-button"));
    const modal = await screen.findByTestId("item-add-modal");
    await user.type(within(modal).getByTestId("spec-item-name-input"), "新規項目");
    await user.click(within(modal).getByTestId("save-spec-item-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("item-add-modal")).not.toBeInTheDocument();
    });
    expect(screen.getByText("新規項目")).toBeInTheDocument();
  });

  test("「+ 新規カテゴリを作成」で同時にカテゴリも追加できる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "既存")],
      specItems: [],
    });
    renderView();

    await screen.findByTestId("spec-comparison-view");
    await user.click(screen.getByTestId("add-spec-item-button"));
    const modal = await screen.findByTestId("item-add-modal");
    await user.type(within(modal).getByTestId("spec-item-name-input"), "新項目");
    await user.selectOptions(within(modal).getByTestId("spec-item-category-select"), "__new_category__");
    await user.type(within(modal).getByTestId("new-category-name-input"), "新カテゴリ");
    await user.click(within(modal).getByTestId("save-spec-item-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("item-add-modal")).not.toBeInTheDocument();
    });
    expect(screen.getByText("新項目")).toBeInTheDocument();
    expect(screen.getByText("新カテゴリ")).toBeInTheDocument();
  });

  test("仕様項目を削除できる (確認ダイアログ経由)", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "削除対象", "c1")],
    });
    renderView();

    await screen.findByTestId("spec-row-s1");
    await user.click(screen.getByTestId("spec-item-delete-s1"));
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("spec-row-s1")).not.toBeInTheDocument();
    });
  });
});

describe("SpecComparisonView: セル編集 → ChangeLog 記録", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("セル編集で値が保存され ChangeLog に記録される", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "断熱材", "c1")],
    });
    renderView();

    await screen.findByTestId("spec-table");
    await user.click(screen.getByTestId("spec-cell-edit-button-s1-a"));

    const modal = await screen.findByTestId("spec-cell-editor-modal");
    await user.type(within(modal).getByTestId("spec-cell-value-input"), "GW 24K");
    await user.type(within(modal).getByTestId("spec-cell-reason-input"), "確定");
    await user.click(within(modal).getByTestId("save-spec-cell-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("spec-cell-editor-modal")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("spec-cell-value-s1-a")).toHaveTextContent("GW 24K");

    // ChangeLog が書き込まれている
    const logsRaw = await window.storage.getItem(STORAGE_KEYS.CHANGE_LOGS);
    const logs = JSON.parse(logsRaw);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      specItemId: "s1", companyId: "a",
      previousValue: "", newValue: "GW 24K", reason: "確定",
    });
  });

  test("同一セル2回更新で ChangeLog が2件記録される (E2 後勝ち)", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "断熱材", "c1")],
    });
    renderView();

    await screen.findByTestId("spec-table");

    // 1 回目
    await user.click(screen.getByTestId("spec-cell-edit-button-s1-a"));
    let modal = await screen.findByTestId("spec-cell-editor-modal");
    await user.type(within(modal).getByTestId("spec-cell-value-input"), "v1");
    await user.click(within(modal).getByTestId("save-spec-cell-button"));
    await waitFor(() => {
      expect(screen.queryByTestId("spec-cell-editor-modal")).not.toBeInTheDocument();
    });

    // 2 回目
    await user.click(screen.getByTestId("spec-cell-edit-button-s1-a"));
    modal = await screen.findByTestId("spec-cell-editor-modal");
    await user.clear(within(modal).getByTestId("spec-cell-value-input"));
    await user.type(within(modal).getByTestId("spec-cell-value-input"), "v2");
    await user.click(within(modal).getByTestId("save-spec-cell-button"));
    await waitFor(() => {
      expect(screen.queryByTestId("spec-cell-editor-modal")).not.toBeInTheDocument();
    });

    const logs = JSON.parse(await window.storage.getItem(STORAGE_KEYS.CHANGE_LOGS));
    expect(logs).toHaveLength(2);
    expect(logs[0].newValue).toBe("v1");
    expect(logs[1].previousValue).toBe("v1");
    expect(logs[1].newValue).toBe("v2");
  });
});

describe("SpecComparisonView: SpecItemNote CRUD (TC_046 UI 層)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("セルにメモを追加 → 表示 → 削除確認 → 削除", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "断熱材", "c1")],
    });
    renderView();

    await screen.findByTestId("spec-table");

    // 📝 ボタンでポップオーバー表示
    await user.click(screen.getByTestId("spec-cell-note-button-s1-a"));
    const popover = await screen.findByTestId("spec-item-note-popover");
    await user.type(within(popover).getByTestId("spec-item-note-input"), "A社が優れている");
    await user.click(within(popover).getByTestId("save-spec-note-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("spec-item-note-popover")).not.toBeInTheDocument();
    });
    // 保存されたら 📝 マーク (メモあり) が表示されている (title属性)
    const cell = screen.getByTestId("spec-cell-s1-a");
    expect(within(cell).getByTitle("メモあり")).toBeInTheDocument();

    // 再度 📝 を開く → 既存メモが表示される
    await user.click(screen.getByTestId("spec-cell-note-button-s1-a"));
    const popover2 = await screen.findByTestId("spec-item-note-popover");
    expect(within(popover2).getByTestId("spec-item-note-input")).toHaveValue("A社が優れている");

    // 削除
    await user.click(within(popover2).getByTestId("delete-spec-note-button"));
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("spec-item-note-popover")).not.toBeInTheDocument();
    });
    // メモあり 📝 表示が消える
    const cellAfter = screen.getByTestId("spec-cell-s1-a");
    expect(within(cellAfter).queryByTitle("メモあり")).not.toBeInTheDocument();
  });
});

describe("SpecComparisonView: カテゴリ管理モーダル", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("カテゴリ追加が機能する", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "x", "c1")],
    });
    renderView();

    await screen.findByTestId("spec-comparison-view");
    await user.click(screen.getByTestId("manage-categories-button"));
    const modal = await screen.findByTestId("category-manager-modal");
    await user.type(within(modal).getByTestId("category-name-input"), "構造");
    await user.click(within(modal).getByTestId("save-category-button"));

    await waitFor(() => {
      expect(within(screen.getByTestId("category-list")).getByText("構造")).toBeInTheDocument();
    });
  });

  test("重複カテゴリ名でエラー表示 (登録不可)", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [cat("c1", "断熱")],
      specItems: [item("s1", "x", "c1")],
    });
    renderView();

    await screen.findByTestId("spec-comparison-view");
    await user.click(screen.getByTestId("manage-categories-button"));
    const modal = await screen.findByTestId("category-manager-modal");
    await user.type(within(modal).getByTestId("category-name-input"), "断熱");
    await user.click(within(modal).getByTestId("save-category-button"));

    expect(within(modal).getByText(/同じ名前のカテゴリ/)).toBeInTheDocument();
  });
});
