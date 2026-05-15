// =============================================================================
// src/utils/validation.js
// バリデーションロジック (app.jsx の Section 1〜4 から参照)
// 設計参照: docs/Spec.md §4-1 (VALIDATION)
// 対応テストケース: TC_022〜TC_026, TC_028
// =============================================================================

export const VALIDATION = {
  Company: {
    name:    { required: true,  maxLength: 50 },
    contact: { required: true,  maxLength: 30 },
    phone:   { required: false, maxLength: 15,  pattern: /^[\d\-\+\(\)\s]*$/ },
    email:   { required: false, maxLength: 100, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    note:    { required: false, maxLength: 500 },
    rejectionNote: { required: false, maxLength: 500 },
  },
};

const COMPANY_STATUSES = ["considering", "candidate", "rejected", "contracted"];
const COMPANY_TYPES    = ["maker", "builder", "other"];

/**
 * Company の各フィールドをバリデーションし、エラーオブジェクトを返す
 * エラーがなければ空オブジェクト {} を返す。
 *
 * @param {Object} input Company 候補オブジェクト
 * @returns {Object} { name?: string, contact?: string, phone?: string, ... }
 *
 * 対応 TC:
 *   TC_022 (name 空 → error)
 *   TC_023 (name 50文字OK / 51文字 error - 境界値)
 *   TC_024 (phone アルファベット → error)
 *   TC_025 (phone 各種有効パターン)
 *   TC_026 (email @ なし → error)
 */
export function validateCompany(input) {
  const errors = {};
  const v = VALIDATION.Company;

  // name
  const name = String(input?.name ?? "");
  if (v.name.required && name.trim().length === 0) {
    errors.name = "会社名は必須です";
  } else if (name.length > v.name.maxLength) {
    errors.name = `${v.name.maxLength}文字以内で入力してください`;
  }

  // contact
  const contact = String(input?.contact ?? "");
  if (v.contact.required && contact.trim().length === 0) {
    errors.contact = "担当者は必須です";
  } else if (contact.length > v.contact.maxLength) {
    errors.contact = `${v.contact.maxLength}文字以内で入力してください`;
  }

  // phone (optional)
  if (input?.phone) {
    const phone = String(input.phone);
    if (phone.length > v.phone.maxLength) {
      errors.phone = `${v.phone.maxLength}文字以内で入力してください`;
    } else if (!v.phone.pattern.test(phone)) {
      errors.phone = "電話番号の形式が不正です (数字・ハイフン・括弧のみ)";
    }
  }

  // email (optional)
  if (input?.email) {
    const email = String(input.email);
    if (email.length > v.email.maxLength) {
      errors.email = `${v.email.maxLength}文字以内で入力してください`;
    } else if (!v.email.pattern.test(email)) {
      errors.email = "メールアドレスの形式が不正です";
    }
  }

  // note (optional)
  if (input?.note && String(input.note).length > v.note.maxLength) {
    errors.note = `${v.note.maxLength}文字以内で入力してください`;
  }

  // rejectionNote (optional)
  if (input?.rejectionNote && String(input.rejectionNote).length > v.rejectionNote.maxLength) {
    errors.rejectionNote = `${v.rejectionNote.maxLength}文字以内で入力してください`;
  }

  // status (列挙値検証)
  if (input?.status !== undefined && !COMPANY_STATUSES.includes(input.status)) {
    errors.status = "不正なステータスです";
  }

  // type (列挙値検証)
  if (input?.type !== undefined && !COMPANY_TYPES.includes(input.type)) {
    errors.type = "不正な会社種別です";
  }

  return errors;
}

/**
 * 同一会社名の重複検出 (大小区別なし・前後空白を除去して比較)
 * 削除済みの会社は除外する。E11 (登録ブロックではなく警告表示用) に利用。
 *
 * @param {string} name        新規入力された会社名
 * @param {Array}  companies   既存の会社一覧
 * @param {string} [excludeId] 編集時に自分自身を除外するための id
 * @returns {boolean}
 *
 * 対応 TC: TC_028 (同一会社名の重複登録で警告 Toast)
 */
export function isDuplicateCompanyName(name, companies, excludeId = null) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (normalized.length === 0) return false;
  return companies.some(
    (c) =>
      !c.deletedAt &&
      c.id !== excludeId &&
      String(c.name ?? "").trim().toLowerCase() === normalized
  );
}
