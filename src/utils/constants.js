// =============================================================================
// src/utils/constants.js
// 定数定義 (app.jsx の Section 1 に対応するテスト用モジュール)
// 設計参照: docs/Spec.md §2-2, §3
// =============================================================================

export const APP_VERSION = "0.1.0-sprint0";
export const SCHEMA_VERSION = "1.0.0";
export const EXPORT_FORMAT_VERSION = "1.0";

export const STORAGE_KEYS = {
  META:            "meta",
  COMPANIES:       "companies",
  CATEGORIES:      "categories",
  SPEC_ITEMS:      "spec_items",
  SPEC_ITEM_NOTES: "spec_item_notes",
  MEETINGS:        "meetings",
  DECISIONS:       "decisions",
  CHANGE_LOGS:     "change_logs",
};

export const STORAGE_WARNING_BYTES = 400_000;
export const STORAGE_BACKUP_SAVE_COUNT = 50;

export const StorageError = {
  QUOTA_EXCEEDED:      "容量上限に達しました。JSONエクスポートで容量を確保してください",
  READ_FAILED:         "データの読み込みに失敗しました。ページを再読み込みしてください",
  WRITE_FAILED:        "保存に失敗しました。しばらく待ってから再試行してください",
  PARSE_ERROR:         "データ形式が不正です。インポートファイルを確認してください",
  STORAGE_UNAVAILABLE: "ストレージが利用できません。データは保存されません",
};
