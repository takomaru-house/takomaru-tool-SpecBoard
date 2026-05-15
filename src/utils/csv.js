// =============================================================================
// src/utils/csv.js
// CSV エクスポート (RFC 4180 準拠)
// 設計参照: docs/Spec.md §4-10 (CSV エクスポート), E17 (CSV エスケープ)
// 対応テストケース: TC_115, TC_116, TC_117
// =============================================================================

/**
 * escapeCsvValue: RFC 4180 準拠の CSV エスケープ
 *  - カンマ / ダブルクォート / 改行 (LF / CR) のいずれかを含む場合、
 *    ダブルクォートで囲み、内部のダブルクォートは "" にエスケープする。
 *  - 特殊文字を含まない値はそのまま返す。
 *  - undefined / null は空文字とみなす。
 *
 * 対応 TC: TC_115 (カンマ), TC_116 (ダブルクォート), TC_117 (改行)
 */
export function escapeCsvValue(value) {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 1行をCSV文字列にする (区切り: ,) */
export function rowToCsv(row) {
  return row.map(escapeCsvValue).join(",");
}

/**
 * buildCsv: 2D 配列を CSV テキストに変換 (改行: CRLF, RFC 4180 推奨)
 * @param {Array<Array<any>>} rows 1 行目はヘッダーを想定
 */
export function buildCsv(rows) {
  return rows.map(rowToCsv).join("\r\n");
}

/**
 * buildSpecComparisonCsv: 仕様比較表 CSV を生成
 * @param {Object} input
 *   - companies: Company[] (有効のみを呼び出し側でフィルタ済み想定 / 表示順)
 *   - categories: Category[]
 *   - specItems: SpecItem[] (deletedAt 除外済み想定)
 *   - mode: "confirmed" | "all"  確定済み(値あり)のみ or 全件
 *
 * CSV 構造:
 *   カテゴリ, 仕様項目, 会社1, 会社2, ...
 *   断熱,     断熱材,   GW16K,  -,
 */
export function buildSpecComparisonCsv({ companies = [], categories = [], specItems = [], mode = "all" }) {
  const visibleCompanies = companies;
  const header = ["カテゴリ", "仕様項目", ...visibleCompanies.map((c) => c.name)];
  const rows = [header];

  const activeCategories = categories
    .filter((c) => !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const cat of activeCategories) {
    const items = specItems
      .filter((i) => !i.deletedAt && i.categoryId === cat.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const item of items) {
      const values = visibleCompanies.map((co) => {
        const v = (item.values || []).find((sv) => sv.companyId === co.id);
        return v?.value ?? "";
      });
      // confirmed モード: 値が1つも入っていない行はスキップ
      if (mode === "confirmed" && values.every((v) => !v)) continue;
      rows.push([cat.name, item.name, ...values]);
    }
  }

  return buildCsv(rows);
}
