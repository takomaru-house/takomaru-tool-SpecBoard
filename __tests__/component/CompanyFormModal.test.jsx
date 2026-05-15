// =============================================================================
// __tests__/component/CompanyFormModal.test.jsx
// Sprint 1 コンポーネントテスト - 会社登録フォーム
//
// 対応 UI 挙動 (ユーザー指摘):
//   1. 必須項目空のまま「登録」でインラインエラー
//   2. 残り文字数カウンタの数値・色変化
//   4. ステータス「落選」選択で断り連絡メモが展開
// =============================================================================

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CompanyFormModal } from "../../app.jsx";

function renderForm(props = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <CompanyFormModal
      existingCompanies={[]}
      initial={props.initial ?? null}
      onSubmit={onSubmit}
      onClose={onClose}
      saveDisabled={props.saveDisabled ?? false}
    />
  );
  return { onSubmit, onClose };
}

describe("CompanyFormModal: 項目1 - 必須項目空でインラインエラー (TC_022 UI層)", () => {
  test("name と contact 空のまま登録するとエラーが表示され onSubmit が呼ばれない", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByTestId("save-company-button"));

    // インラインエラーの表示
    expect(screen.getByText(/会社名は必須です/)).toBeInTheDocument();
    expect(screen.getByText(/担当者は必須です/)).toBeInTheDocument();

    // フォーム送信は阻止される
    expect(onSubmit).not.toHaveBeenCalled();

    // モーダルは閉じない
    expect(screen.getByTestId("company-form-modal")).toBeInTheDocument();
  });

  test("aria-invalid と aria-describedby がエラー時に付与される", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("save-company-button"));

    const nameInput = screen.getByTestId("company-name-input");
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "cf-name-error");
  });

  test("必須項目を入力すると onSubmit が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByTestId("company-name-input"), "テスト社");
    await user.type(screen.getByTestId("company-contact-input"), "田中");
    await user.click(screen.getByTestId("save-company-button"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "テスト社", contact: "田中" })
    );
  });

  test("メールに @ なしを入力するとエラーが表示される (TC_026 UI層)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByTestId("company-name-input"), "A社");
    await user.type(screen.getByTestId("company-contact-input"), "担当");
    await user.type(screen.getByTestId("company-email-input"), "invalid-email");
    await user.click(screen.getByTestId("save-company-button"));

    expect(screen.getByText(/メールアドレスの形式が不正/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("電話番号にアルファベットを入力するとエラー (TC_024 UI層)", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByTestId("company-name-input"), "A社");
    await user.type(screen.getByTestId("company-contact-input"), "担当");
    await user.type(screen.getByTestId("company-phone-input"), "abc-defg");
    await user.click(screen.getByTestId("save-company-button"));

    expect(screen.getByText(/電話番号の形式が不正/)).toBeInTheDocument();
  });
});

describe("CompanyFormModal: 項目2 - 残り文字数カウンタ", () => {
  test("入力に応じて残り文字数が減る (会社名: 残り 50 → 47)", async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByTestId("company-name-input");
    const field = nameInput.closest("div").parentElement; // Field ラッパー

    // 初期状態: 残り 50
    expect(within(field).getByText(/残り 50/)).toBeInTheDocument();

    await user.type(nameInput, "ABC");

    // 残り 47
    expect(within(field).getByText(/残り 47/)).toBeInTheDocument();
  });

  test("メモ欄: 500 文字制限カウンタが動作する", async () => {
    const user = userEvent.setup();
    renderForm();

    const noteInput = screen.getByTestId("company-note-input");
    const field = noteInput.closest("div").parentElement;
    expect(within(field).getByText(/残り 500/)).toBeInTheDocument();

    await user.type(noteInput, "あいうえお"); // 5 文字
    expect(within(field).getByText(/残り 495/)).toBeInTheDocument();
  });

  test("残り文字数表示の色トーン: 残り 10 未満で wood-deep 色 (警告)", async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByTestId("company-name-input");
    // 41 文字入力 → 残り 9 → text-wood-deep クラス
    await user.type(nameInput, "a".repeat(41));

    const field = nameInput.closest("div").parentElement;
    const counter = within(field).getByText(/残り 9/);
    expect(counter).toHaveClass("text-wood-deep");
  });

  test("残り文字数表示の色トーン: 残り >= 10 で ink-soft 色 (通常)", async () => {
    const user = userEvent.setup();
    renderForm();

    const nameInput = screen.getByTestId("company-name-input");
    await user.type(nameInput, "短い名前");

    const field = nameInput.closest("div").parentElement;
    const counter = within(field).getByText(/残り 46/);
    expect(counter).toHaveClass("text-ink-soft");
  });
});

describe("CompanyFormModal: 項目4 - rejected 時に rejectionNote 展開", () => {
  test("初期状態 (considering) では断り連絡メモは表示されない", () => {
    renderForm();
    expect(screen.queryByTestId("company-rejection-note-input")).not.toBeInTheDocument();
  });

  test("ステータスを 'rejected' に変更すると断り連絡メモが表示される", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByTestId("company-status-select"), "rejected");

    expect(screen.getByTestId("company-rejection-note-input")).toBeInTheDocument();
    expect(screen.getByText(/断り連絡メモ/)).toBeInTheDocument();
  });

  test("rejected から別ステータスに戻すと断り連絡メモが消える", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByTestId("company-status-select"), "rejected");
    expect(screen.getByTestId("company-rejection-note-input")).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("company-status-select"), "considering");
    expect(screen.queryByTestId("company-rejection-note-input")).not.toBeInTheDocument();
  });

  test("rejected で rejectionNote 付き保存できる", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByTestId("company-name-input"), "落選社");
    await user.type(screen.getByTestId("company-contact-input"), "担当");
    await user.selectOptions(screen.getByTestId("company-status-select"), "rejected");
    await user.type(screen.getByTestId("company-rejection-note-input"), "金額が予算オーバー");
    await user.click(screen.getByTestId("save-company-button"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        rejectionNote: "金額が予算オーバー",
      })
    );
  });
});

describe("CompanyFormModal: 編集モード (initial 指定)", () => {
  const existing = {
    id: "c1", createdAt: "2026-01-01T00:00:00Z",
    name: "編集対象社", type: "builder", contact: "鈴木",
    status: "candidate", phone: "090-1234-5678", email: "test@example.com",
    note: "初期メモ",
  };

  test("初期値がフォームに反映される", () => {
    renderForm({ initial: existing });
    expect(screen.getByTestId("company-name-input")).toHaveValue("編集対象社");
    expect(screen.getByTestId("company-contact-input")).toHaveValue("鈴木");
    expect(screen.getByTestId("company-type-select")).toHaveValue("builder");
    expect(screen.getByTestId("company-status-select")).toHaveValue("candidate");
    expect(screen.getByTestId("company-phone-input")).toHaveValue("090-1234-5678");
    expect(screen.getByTestId("company-email-input")).toHaveValue("test@example.com");
    expect(screen.getByTestId("company-note-input")).toHaveValue("初期メモ");
  });

  test("見出しが '会社を編集' になる", () => {
    renderForm({ initial: existing });
    expect(screen.getByText("会社を編集")).toBeInTheDocument();
  });

  test("ボタンラベルが '更新' になる", () => {
    renderForm({ initial: existing });
    expect(screen.getByTestId("save-company-button")).toHaveTextContent("更新");
  });
});

describe("CompanyFormModal: 書き込み不能モード (saveDisabled)", () => {
  test("saveDisabled=true で保存ボタンが無効化される (E20)", () => {
    renderForm({ saveDisabled: true });
    expect(screen.getByTestId("save-company-button")).toBeDisabled();
  });

  test("saveDisabled=false で保存ボタンが有効", () => {
    renderForm({ saveDisabled: false });
    expect(screen.getByTestId("save-company-button")).toBeEnabled();
  });
});

describe("CompanyFormModal: モーダルアクセシビリティ", () => {
  test("role=dialog / aria-modal=true / aria-labelledby が付与されている", () => {
    renderForm();
    const modal = screen.getByTestId("company-form-modal");
    expect(modal).toHaveAttribute("role", "dialog");
    expect(modal).toHaveAttribute("aria-modal", "true");
    expect(modal).toHaveAttribute("aria-labelledby");
  });

  test("Escape キーで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  test("キャンセルボタンで onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();
    await user.click(screen.getByTestId("company-cancel-button"));
    expect(onClose).toHaveBeenCalled();
  });
});
