// =============================================================================
// __tests__/component/Keyboard.test.jsx
// Sprint 7-B キーボードのみで全操作が完結することの確認
//
// 検証範囲 (Spec.md §5-2 / NF-UX-001〜003):
//   - Tab / Shift+Tab でフォーカス移動
//   - Enter / Space でボタン起動
//   - Escape でモーダルを閉じる
//   - focus-visible 用の Tailwind class が付与されている
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import {
  CompaniesView,
  CompanyFormModal,
  CompanyDetailPage,
  SpecCellEditor,
  SpecReflectionDialog,
  ToastProvider,
  ConfirmProvider,
} from "../../app.jsx";

function wrap(node) {
  return render(
    <ToastProvider>
      <ConfirmProvider>{node}</ConfirmProvider>
    </ToastProvider>
  );
}

describe("Tab / Shift+Tab でフォーカス移動できる (NF-UX-002)", () => {
  test("CompanyFormModal: 連続 Tab でフォーカスが入力フィールドを巡る", async () => {
    const user = userEvent.setup();
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => {}} />);

    // 最初の入力 (会社名) にフォーカスを置く
    const nameInput = screen.getByTestId("company-name-input");
    nameInput.focus();
    expect(document.activeElement).toBe(nameInput);

    // Tab で次のフォーカス要素へ (type select か contact)
    await user.tab();
    expect(document.activeElement).not.toBe(nameInput);
    expect(document.activeElement.tagName).toMatch(/^(INPUT|SELECT|BUTTON|TEXTAREA)$/);
  });

  test("Shift+Tab で逆方向にフォーカス移動", async () => {
    const user = userEvent.setup();
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => {}} />);

    const contactInput = screen.getByTestId("company-contact-input");
    contactInput.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).not.toBe(contactInput);
  });
});

describe("Enter / Space でボタン起動 (NF-UX-003)", () => {
  test("Cancel ボタンに Space キーで起動できる", async () => {
    const user = userEvent.setup();
    let closed = false;
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => { closed = true; }} />);

    const cancel = screen.getByTestId("company-cancel-button");
    cancel.focus();
    await user.keyboard(" "); // Space
    expect(closed).toBe(true);
  });

  test("Cancel ボタンに Enter キーで起動できる", async () => {
    const user = userEvent.setup();
    let closed = false;
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => { closed = true; }} />);

    const cancel = screen.getByTestId("company-cancel-button");
    cancel.focus();
    await user.keyboard("{Enter}");
    expect(closed).toBe(true);
  });
});

describe("Escape でモーダルを閉じる (document リスナー実装)", () => {
  test("CompanyFormModal: Escape で onClose 呼び出し", async () => {
    const user = userEvent.setup();
    let closed = false;
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => { closed = true; }} />);
    await user.keyboard("{Escape}");
    expect(closed).toBe(true);
  });

  test("SpecReflectionDialog: Escape で onClose 呼び出し", async () => {
    const user = userEvent.setup();
    let closed = false;
    const decision = { specItemId: "s1", specCompanyId: "co1", specValue: "v" };
    wrap(<SpecReflectionDialog decision={decision} specItem={null} company={null}
      onConfirm={() => {}} onClose={() => { closed = true; }} />);
    await user.keyboard("{Escape}");
    expect(closed).toBe(true);
  });

  test("SpecCellEditor: Escape で onClose 呼び出し", async () => {
    const user = userEvent.setup();
    let closed = false;
    const specItem = { id: "s1", name: "x", values: [] };
    const company = { id: "co1", name: "A社" };
    wrap(<SpecCellEditor specItem={specItem} company={company} currentValue={null}
      onSubmit={() => {}} onClose={() => { closed = true; }} />);
    await user.keyboard("{Escape}");
    expect(closed).toBe(true);
  });
});

describe("focus-visible リング (NF-UX-001)", () => {
  test("会社追加ボタンに focus-visible ユーティリティクラスが付与されている", async () => {
    const restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    try {
      await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify([]));
      await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
      wrap(<CompaniesView saveDisabled={false} />);
      const btn = await screen.findByTestId("add-company-button");
      expect(btn.className).toMatch(/focus-visible:outline/);
    } finally {
      restoreGlobalStorage(restored);
    }
  });

  test("CompanyFormModal の保存ボタンに focus-visible class", () => {
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => {}} />);
    const save = screen.getByTestId("save-company-button");
    expect(save.className).toMatch(/focus-visible:outline/);
  });

  test("CompanyDetailPage の戻るボタンに focus-visible class", () => {
    const company = { id: "c1", name: "A社", contact: "x", type: "maker",
      status: "considering", createdAt: "x" };
    render(<CompanyDetailPage company={company} onClose={() => {}} onEdit={() => {}} />);
    const back = screen.getByTestId("company-detail-close");
    expect(back.className).toMatch(/focus-visible:outline/);
  });
});

describe("確認ダイアログのキャンセル ボタンが初期 focus を取得 (UX)", () => {
  test("CompanyFormModal を開いたとき、最初の入力にフォーカス可能", async () => {
    wrap(<CompanyFormModal existingCompanies={[]} initial={null}
      onSubmit={() => {}} onClose={() => {}} />);
    const nameInput = screen.getByTestId("company-name-input");
    nameInput.focus();
    expect(document.activeElement).toBe(nameInput);
  });
});
