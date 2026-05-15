// =============================================================================
// __tests__/unit/csv.test.js
// Sprint 6 単体テスト - CSV エスケープ + 仕様比較 CSV 生成
//
// 対応テストケース: TC_115 (カンマ), TC_116 (ダブルクォート), TC_117 (改行)
// =============================================================================

import { describe, test, expect } from "vitest";
import { escapeCsvValue, rowToCsv, buildCsv, buildSpecComparisonCsv } from "../../src/utils/csv.js";

describe("escapeCsvValue (TC_115, TC_116, TC_117 / E17 / IF-EX-005〜009)", () => {
  test("TC_115: カンマを含む値をダブルクォートで囲む", () => {
    expect(escapeCsvValue("A,B")).toBe('"A,B"');
  });

  test("TC_116: ダブルクォートを '\"\"' にエスケープしダブルクォートで囲む", () => {
    expect(escapeCsvValue('He said "hello"')).toBe('"He said ""hello"""');
  });

  test("TC_117: LF を含む値をダブルクォートで囲む", () => {
    expect(escapeCsvValue("A\nB")).toBe('"A\nB"');
  });

  test("CRLF を含む値もダブルクォートで囲む", () => {
    expect(escapeCsvValue("A\r\nB")).toBe('"A\r\nB"');
  });

  test("特殊文字を含まない値はそのまま返す", () => {
    expect(escapeCsvValue("普通の値")).toBe("普通の値");
    expect(escapeCsvValue("hello")).toBe("hello");
  });

  test("空文字はそのまま", () => {
    expect(escapeCsvValue("")).toBe("");
  });

  test("undefined / null は空文字", () => {
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue(null)).toBe("");
  });

  test("数値も文字列として扱う", () => {
    expect(escapeCsvValue(123)).toBe("123");
    expect(escapeCsvValue(0)).toBe("0");
  });

  test("複数の特殊文字を含むケース", () => {
    expect(escapeCsvValue('a,b"c\nd')).toBe('"a,b""c\nd"');
  });
});

describe("rowToCsv", () => {
  test("各要素をエスケープしてカンマで結合する", () => {
    expect(rowToCsv(["A", "B,C", 'D"E'])).toBe('A,"B,C","D""E"');
  });
});

describe("buildCsv", () => {
  test("行を CRLF で連結する", () => {
    const csv = buildCsv([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(csv).toBe("a,b\r\nc,d");
  });

  test("空 2D 配列で空文字", () => {
    expect(buildCsv([])).toBe("");
  });
});

describe("buildSpecComparisonCsv", () => {
  const companies = [
    { id: "co1", name: "A社" },
    { id: "co2", name: "B社" },
  ];
  const categories = [
    { id: "c1", name: "断熱", sortOrder: 0 },
    { id: "c2", name: "構造", sortOrder: 1, deletedAt: "x" },  // 削除済みは除外
  ];
  const specItems = [
    {
      id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0,
      values: [
        { companyId: "co1", value: "GW 24K", updatedAt: "x" },
        { companyId: "co2", value: "PIR 40mm", updatedAt: "x" },
      ],
    },
    {
      id: "s2", name: "UA値", categoryId: "c1", sortOrder: 1,
      values: [{ companyId: "co1", value: "0.46", updatedAt: "x" }],
    },
    {
      id: "s3", name: "値なし", categoryId: "c1", sortOrder: 2, values: [],
    },
    {
      id: "s4", name: "削除済み項目", categoryId: "c1", sortOrder: 3, values: [], deletedAt: "x",
    },
  ];

  test("ヘッダー + 各行が生成される (mode=all)", () => {
    const csv = buildSpecComparisonCsv({ companies, categories, specItems, mode: "all" });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("カテゴリ,仕様項目,A社,B社");
    expect(lines[1]).toBe("断熱,断熱材,GW 24K,PIR 40mm");
    expect(lines[2]).toBe("断熱,UA値,0.46,");
    expect(lines[3]).toBe("断熱,値なし,,");
    expect(lines).toHaveLength(4); // 削除済みカテゴリ・項目は除外
  });

  test("mode=confirmed では全社空の行を除外する", () => {
    const csv = buildSpecComparisonCsv({ companies, categories, specItems, mode: "confirmed" });
    const lines = csv.split("\r\n");
    expect(lines).toEqual([
      "カテゴリ,仕様項目,A社,B社",
      "断熱,断熱材,GW 24K,PIR 40mm",
      "断熱,UA値,0.46,",
    ]);
  });

  test("会社名にカンマがあれば適切にエスケープ", () => {
    const csv = buildSpecComparisonCsv({
      companies: [{ id: "co1", name: "A,株式会社" }],
      categories: [{ id: "c1", name: "断熱", sortOrder: 0 }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [{ companyId: "co1", value: "x" }] }],
    });
    expect(csv.split("\r\n")[0]).toBe('カテゴリ,仕様項目,"A,株式会社"');
  });
});
