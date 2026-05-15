// =============================================================================
// __tests__/component/CompaniesView.test.jsx
// Sprint 1 コンポーネントテスト - 会社管理ビュー (一覧+CRUD統合)
//
// 対応 UI 挙動 (ユーザー指摘):
//   3. 同名登録で warning Toast (E11)
//   6. 削除ボタン → 確認ダイアログ → カード消滅
//   7. リロード(再mount) してもデータが保持される
//   8. ステータスフィルター・契約済み折りたたみ
// =============================================================================

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";

import { CompaniesView, ToastProvider, ConfirmProvider } from "../../app.jsx";

function renderView(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <CompaniesView saveDisabled={props.saveDisabled ?? false} />
      </ConfirmProvider>
    </ToastProvider>
  );
}

async function addCompany(user, { name, contact, status }) {
  await user.click(screen.getByTestId("add-company-button"));
  const modal = await screen.findByTestId("company-form-modal");
  await user.type(within(modal).getByTestId("company-name-input"), name);
  await user.type(within(modal).getByTestId("company-contact-input"), contact);
  if (status) {
    await user.selectOptions(within(modal).getByTestId("company-status-select"), status);
  }
  await user.click(within(modal).getByTestId("save-company-button"));
  await waitFor(() =>
    expect(screen.queryByTestId("company-form-modal")).not.toBeInTheDocument()
  );
}

describe("CompaniesView: 初期状態 (Empty State)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社0件で Empty State が表示される", async () => {
    renderView();
    expect(await screen.findByTestId("companies-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/検討中の会社を登録してください/)).toBeInTheDocument();
    expect(screen.getByTestId("empty-add-company-button")).toBeInTheDocument();
  });

  test("Empty State の CTA ボタンでフォームが開く", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await user.click(screen.getByTestId("empty-add-company-button"));
    expect(await screen.findByTestId("company-form-modal")).toBeInTheDocument();
  });
});

describe("CompaniesView: 会社登録フロー", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社を登録するとカードが表示される", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "テスト社", contact: "担当A" });

    expect(screen.getByText("テスト社")).toBeInTheDocument();
    expect(screen.getByText("担当A")).toBeInTheDocument();
    expect(screen.queryByTestId("companies-empty-state")).not.toBeInTheDocument();
  });

  test("登録成功時に success Toast が表示される", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "テスト社", contact: "担当A" });
    await waitFor(() => {
      expect(screen.getByTestId("toast-success")).toBeInTheDocument();
    });
    expect(screen.getByTestId("toast-success")).toHaveTextContent(/会社を登録しました/);
  });

  test("初回登録で標準テンプレート Toast (success) ではなく、登録 Toast (success) が出る", async () => {
    // Toast 2件出る可能性があるが、最終的に「会社を登録しました」が見える
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "Aaa", contact: "Bbb" });
    await waitFor(() => {
      const toasts = screen.queryAllByTestId("toast-success");
      const texts = toasts.map((t) => t.textContent).join("|");
      expect(texts).toMatch(/会社を登録しました/);
    });
  });
});

describe("CompaniesView: 項目3 - 同名登録で警告 Toast (E11)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("同じ会社名で2回登録すると warning Toast が出る (登録はブロックしない)", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");

    await addCompany(user, { name: "重複社", contact: "担当A" });
    expect(screen.getByText("重複社")).toBeInTheDocument();

    await addCompany(user, { name: "重複社", contact: "担当B" });

    // warning Toast
    await waitFor(() => {
      expect(screen.getByTestId("toast-warning")).toBeInTheDocument();
    });
    expect(screen.getByTestId("toast-warning"))
      .toHaveTextContent(/同じ名前の会社が既に登録されています/);

    // それでも 2 件登録される (ブロックしない)
    const cards = screen.getAllByTestId("company-card");
    expect(cards).toHaveLength(2);
  });

  test("大文字小文字違いでも warning Toast が出る", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");

    await addCompany(user, { name: "Acme Corp", contact: "担当A" });
    await addCompany(user, { name: "ACME CORP", contact: "担当B" });

    await waitFor(() => {
      expect(screen.getByTestId("toast-warning")).toBeInTheDocument();
    });
  });
});

describe("CompaniesView: 項目6 - 削除確認ダイアログ → カード消滅", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("削除ボタン → 確認ダイアログ → 確定 でカードが消える", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "削除対象社", contact: "担当" });

    // カードが存在することを確認
    expect(screen.getByText("削除対象社")).toBeInTheDocument();
    const cards = screen.getAllByTestId("company-card");
    const card = cards[0];

    // 削除ボタンを押す
    await user.click(within(card).getByText("削除"));

    // 確認ダイアログ表示
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(within(dialog).getByText(/削除対象社/)).toBeInTheDocument();

    // 確定
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    // カードが消える
    await waitFor(() =>
      expect(screen.queryByText("削除対象社")).not.toBeInTheDocument()
    );

    // success Toast
    await waitFor(() => {
      const successToasts = screen.queryAllByTestId("toast-success");
      const texts = successToasts.map((t) => t.textContent).join("|");
      expect(texts).toMatch(/会社を削除しました/);
    });
  });

  test("削除ボタン → 確認ダイアログ → キャンセル でカードが残る", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "残存社", contact: "担当" });

    const card = screen.getAllByTestId("company-card")[0];
    await user.click(within(card).getByText("削除"));

    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-cancel-button"));

    // カードは残る
    expect(screen.getByText("残存社")).toBeInTheDocument();
  });
});

describe("CompaniesView: 項目7 - リロード(再mount)後のデータ保持", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("追加した会社が再 mount 後も表示される (ストレージ永続化)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "永続化社", contact: "担当" });

    expect(screen.getByText("永続化社")).toBeInTheDocument();

    // 再 mount (preview.html のリロード相当)
    unmount();
    renderView();

    expect(await screen.findByText("永続化社")).toBeInTheDocument();
  });

  test("削除した会社は再 mount 後も表示されない", async () => {
    const user = userEvent.setup();
    const { unmount } = renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "消失社", contact: "担当" });
    await addCompany(user, { name: "存続社", contact: "担当B" });

    const cards = screen.getAllByTestId("company-card");
    const targetCard = cards.find((c) => within(c).queryByText("消失社"));
    await user.click(within(targetCard).getByText("削除"));
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));
    await waitFor(() =>
      expect(screen.queryByText("消失社")).not.toBeInTheDocument()
    );

    unmount();
    renderView();

    expect(await screen.findByText("存続社")).toBeInTheDocument();
    expect(screen.queryByText("消失社")).not.toBeInTheDocument();
  });
});

describe("CompaniesView: 項目8 - ステータスフィルター", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("フィルターを切り替えると該当ステータスの会社のみ表示される", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "検討中社", contact: "A", status: "considering" });
    await addCompany(user, { name: "候補社",   contact: "B", status: "candidate" });
    await addCompany(user, { name: "落選社",   contact: "C", status: "rejected" });

    expect(screen.getAllByTestId("company-card")).toHaveLength(3);

    // 候補のみフィルター
    await user.click(screen.getByTestId("company-filter-candidate"));
    expect(screen.getAllByTestId("company-card")).toHaveLength(1);
    expect(screen.getByText("候補社")).toBeInTheDocument();
    expect(screen.queryByText("検討中社")).not.toBeInTheDocument();

    // 落選のみフィルター
    await user.click(screen.getByTestId("company-filter-rejected"));
    expect(screen.getByText("落選社")).toBeInTheDocument();
    expect(screen.queryByText("候補社")).not.toBeInTheDocument();

    // すべて
    await user.click(screen.getByTestId("company-filter-all"));
    expect(screen.getAllByTestId("company-card")).toHaveLength(3);
  });

  test("フィルターボタンに件数が表示される", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "A社", contact: "x", status: "considering" });
    await addCompany(user, { name: "B社", contact: "x", status: "considering" });
    await addCompany(user, { name: "C社", contact: "x", status: "candidate" });

    expect(within(screen.getByTestId("company-filter-all")).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByTestId("company-filter-considering")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("company-filter-candidate")).getByText("1")).toBeInTheDocument();
  });
});

describe("CompaniesView: 項目8 - 契約済み折りたたみ", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("契約済み会社は別セクションで初期は折りたたまれている", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "検討中社", contact: "A", status: "considering" });
    await addCompany(user, { name: "契約済社", contact: "B", status: "contracted" });

    // 検討中社のカードは表示される (others セクション)
    expect(screen.getByText("検討中社")).toBeInTheDocument();
    // 契約済社のカードは折りたたまれていて見えない
    expect(screen.queryByText("契約済社")).not.toBeInTheDocument();

    // トグルボタンは存在し、件数も表示される
    const toggle = screen.getByTestId("toggle-contracted-companies");
    expect(toggle).toHaveTextContent(/契約済 \(1\)/);
  });

  test("トグルクリックで契約済みカードが展開される", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "契約済社", contact: "A", status: "contracted" });

    await user.click(screen.getByTestId("toggle-contracted-companies"));
    expect(screen.getByText("契約済社")).toBeInTheDocument();

    // もう一度クリックで折りたたみ
    await user.click(screen.getByTestId("toggle-contracted-companies"));
    expect(screen.queryByText("契約済社")).not.toBeInTheDocument();
  });
});

describe("CompaniesView: 書き込み不能モード (saveDisabled)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("saveDisabled=true で「+ 会社を追加」ボタンが無効化される", async () => {
    renderView({ saveDisabled: true });
    await screen.findByTestId("companies-empty-state");
    expect(screen.getByTestId("add-company-button")).toBeDisabled();
  });
});

describe("CompaniesView: 会社編集フロー", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("編集ボタン → フォーム → 保存 でカードの内容が更新される", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "旧名社", contact: "担当" });

    const card = screen.getAllByTestId("company-card")[0];
    await user.click(within(card).getByText("編集"));

    const modal = await screen.findByTestId("company-form-modal");
    expect(within(modal).getByText(/会社を編集/)).toBeInTheDocument();
    const nameInput = within(modal).getByTestId("company-name-input");
    await user.clear(nameInput);
    await user.type(nameInput, "新名社");
    await user.click(within(modal).getByTestId("save-company-button"));

    await waitFor(() =>
      expect(screen.queryByTestId("company-form-modal")).not.toBeInTheDocument()
    );
    expect(screen.getByText("新名社")).toBeInTheDocument();
    expect(screen.queryByText("旧名社")).not.toBeInTheDocument();
  });

  test("編集モード中に自分の名前のままで保存しても重複警告は出ない (excludeId)", async () => {
    const user = userEvent.setup();
    renderView();
    await screen.findByTestId("companies-empty-state");
    await addCompany(user, { name: "唯一社", contact: "担当" });

    const card = screen.getAllByTestId("company-card")[0];
    await user.click(within(card).getByText("編集"));
    const modal = await screen.findByTestId("company-form-modal");
    // 名前は変更せずに保存
    await user.click(within(modal).getByTestId("save-company-button"));
    await waitFor(() =>
      expect(screen.queryByTestId("company-form-modal")).not.toBeInTheDocument()
    );

    // warning Toast は出ない
    expect(screen.queryByTestId("toast-warning")).not.toBeInTheDocument();
  });
});
