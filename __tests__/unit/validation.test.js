// =============================================================================
// __tests__/unit/validation.test.js
// Sprint 1 単体テスト - Company バリデーション
//
// 対応テストケース: TC_022, TC_023, TC_024, TC_025, TC_026, TC_028
// 設計参照:
//   - 02-テスト/04-テストケース.md (test-cases-sprint1-company.json)
//   - 02-テスト/03-テスト観点.md (F-VL-001〜007, F-EC-010, DT-BV-001, DT-BV-015)
//   - docs/Spec.md §4-1 (VALIDATION)
// =============================================================================

import { describe, test, expect } from "vitest";
import {
  validateCompany,
  isDuplicateCompanyName,
  VALIDATION,
} from "../../src/utils/validation.js";

// ---------- validateCompany: name ----------
describe("validateCompany - name (TC_022, TC_023 / F-VL-001, F-VL-002, DT-BV-001)", () => {
  test("TC_022: name が空文字の場合エラーを返す", () => {
    const errors = validateCompany({ name: "", contact: "担当" });
    expect(errors).toHaveProperty("name");
    expect(errors.name).toMatch(/必須/);
  });

  test("TC_022 補助: name が空白のみの場合もエラーを返す", () => {
    const errors = validateCompany({ name: "   ", contact: "担当" });
    expect(errors).toHaveProperty("name");
  });

  test("TC_023: name が 50 文字ちょうどは OK (境界値)", () => {
    const name = "あ".repeat(50);
    const errors = validateCompany({ name, contact: "担当" });
    expect(errors).not.toHaveProperty("name");
  });

  test("TC_023: name が 51 文字の場合エラー (境界値)", () => {
    const name = "あ".repeat(51);
    const errors = validateCompany({ name, contact: "担当" });
    expect(errors).toHaveProperty("name");
    expect(errors.name).toMatch(/50/);
  });

  test("TC_023 補助: name が 1 文字 OK (最小値)", () => {
    const errors = validateCompany({ name: "A", contact: "担当" });
    expect(errors).not.toHaveProperty("name");
  });
});

// ---------- validateCompany: contact ----------
describe("validateCompany - contact (F-VL-003, F-VL-004)", () => {
  test("contact が空文字の場合エラー", () => {
    const errors = validateCompany({ name: "A社", contact: "" });
    expect(errors).toHaveProperty("contact");
  });

  test("contact 30 文字 OK / 31 文字 NG (境界値)", () => {
    const okErrors = validateCompany({ name: "A社", contact: "あ".repeat(30) });
    const ngErrors = validateCompany({ name: "A社", contact: "あ".repeat(31) });
    expect(okErrors).not.toHaveProperty("contact");
    expect(ngErrors).toHaveProperty("contact");
  });
});

// ---------- validateCompany: phone ----------
describe("validateCompany - phone (TC_024, TC_025 / F-VL-005, DT-BV-015)", () => {
  test("TC_024: アルファベットを含む電話番号でエラー", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", phone: "invalid-phone" });
    expect(errors).toHaveProperty("phone");
  });

  test("TC_025: 各種有効な電話番号パターンを許可する", () => {
    const validPhones = ["090-1234-5678", "+81-3-1234-5678", "(03) 1234-5678", "0120-000-000"];
    validPhones.forEach((phone) => {
      const errors = validateCompany({ name: "A社", contact: "担当", phone });
      expect(errors, `phone=${phone}`).not.toHaveProperty("phone");
    });
  });

  test("phone が未入力ならエラーにならない (optional)", () => {
    const errors = validateCompany({ name: "A社", contact: "担当" });
    expect(errors).not.toHaveProperty("phone");
  });

  test("phone が 15 文字超でエラー", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", phone: "1".repeat(16) });
    expect(errors).toHaveProperty("phone");
  });
});

// ---------- validateCompany: email ----------
describe("validateCompany - email (TC_026 / F-VL-006)", () => {
  test("TC_026: @ を含まないメールでエラー", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", email: "invalid-email" });
    expect(errors).toHaveProperty("email");
  });

  test("正常なメールアドレスを許可する", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", email: "test@example.com" });
    expect(errors).not.toHaveProperty("email");
  });

  test("ドメインに . が含まないメールでエラー", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", email: "test@example" });
    expect(errors).toHaveProperty("email");
  });
});

// ---------- validateCompany: note / rejectionNote ----------
describe("validateCompany - note (F-VL-007)", () => {
  test("note 500 文字 OK / 501 文字 NG", () => {
    const ok = validateCompany({ name: "A社", contact: "担当", note: "a".repeat(500) });
    const ng = validateCompany({ name: "A社", contact: "担当", note: "a".repeat(501) });
    expect(ok).not.toHaveProperty("note");
    expect(ng).toHaveProperty("note");
  });

  test("rejectionNote 501 文字 NG", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", rejectionNote: "a".repeat(501) });
    expect(errors).toHaveProperty("rejectionNote");
  });
});

// ---------- validateCompany: 全体 ----------
describe("validateCompany - 統合", () => {
  test("最小入力 (name + contact) で errors なし", () => {
    const errors = validateCompany({ name: "A社", contact: "担当" });
    expect(errors).toEqual({});
  });

  test("複数フィールドのエラーを同時に検出する", () => {
    const errors = validateCompany({ name: "", contact: "", phone: "abc", email: "no-at" });
    expect(errors).toHaveProperty("name");
    expect(errors).toHaveProperty("contact");
    expect(errors).toHaveProperty("phone");
    expect(errors).toHaveProperty("email");
  });

  test("不正な status を弾く", () => {
    const errors = validateCompany({ name: "A社", contact: "担当", status: "unknown" });
    expect(errors).toHaveProperty("status");
  });

  test("有効な status を許可する", () => {
    const valid = ["considering", "candidate", "rejected", "contracted"];
    valid.forEach((s) => {
      const errors = validateCompany({ name: "A社", contact: "担当", status: s });
      expect(errors, `status=${s}`).not.toHaveProperty("status");
    });
  });
});

// ---------- isDuplicateCompanyName ----------
describe("isDuplicateCompanyName (TC_028 / F-EC-010)", () => {
  const sample = [
    { id: "c1", name: "A社",  status: "considering" },
    { id: "c2", name: "B社",  status: "candidate" },
    { id: "c3", name: "削除済み社", status: "considering", deletedAt: "2026-01-01T00:00:00Z" },
  ];

  test("既存名と完全一致で true", () => {
    expect(isDuplicateCompanyName("A社", sample)).toBe(true);
  });

  test("前後空白を除去して判定する", () => {
    expect(isDuplicateCompanyName("  A社  ", sample)).toBe(true);
  });

  test("大文字小文字を無視する", () => {
    const list = [{ id: "c1", name: "Acme Corp", status: "considering" }];
    expect(isDuplicateCompanyName("acme corp", list)).toBe(true);
    expect(isDuplicateCompanyName("ACME CORP", list)).toBe(true);
  });

  test("論理削除済みは重複扱いしない", () => {
    expect(isDuplicateCompanyName("削除済み社", sample)).toBe(false);
  });

  test("異なる名前なら false", () => {
    expect(isDuplicateCompanyName("C社", sample)).toBe(false);
  });

  test("excludeId 指定時は自分自身を重複扱いしない (編集ケース)", () => {
    expect(isDuplicateCompanyName("A社", sample, "c1")).toBe(false);
    expect(isDuplicateCompanyName("A社", sample, "c2")).toBe(true);
  });

  test("空文字入力では false (重複判定対象外)", () => {
    expect(isDuplicateCompanyName("", sample)).toBe(false);
    expect(isDuplicateCompanyName("   ", sample)).toBe(false);
  });
});

// ---------- VALIDATION 定数 ----------
describe("VALIDATION.Company 定数", () => {
  test("仕様書 §4-1 の各上限値が反映されている", () => {
    expect(VALIDATION.Company.name.maxLength).toBe(50);
    expect(VALIDATION.Company.contact.maxLength).toBe(30);
    expect(VALIDATION.Company.phone.maxLength).toBe(15);
    expect(VALIDATION.Company.email.maxLength).toBe(100);
    expect(VALIDATION.Company.note.maxLength).toBe(500);
  });
});
