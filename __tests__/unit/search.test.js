// =============================================================================
// __tests__/unit/search.test.js
// Sprint 5 単体テスト - 全文検索 + デバウンス + ハイライト分割
//
// 対応テストケース: TC_103 (横断検索), TC_104 (debounce), TC_105 (空振り)
// =============================================================================

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SEARCH_TARGETS,
  runGlobalSearch,
  splitForHighlight,
  debounce,
} from "../../src/utils/search.js";

describe("SEARCH_TARGETS 定数 (Spec.md §4-5)", () => {
  test("4 エンティティすべてのフィールドが定義されている", () => {
    expect(SEARCH_TARGETS.Meeting).toEqual(["agenda", "summary", "location"]);
    expect(SEARCH_TARGETS.Decision).toEqual(["content", "note", "specValue"]);
    expect(SEARCH_TARGETS.SpecItem).toEqual(["name"]);
    expect(SEARCH_TARGETS.Company).toEqual(["name", "contact", "note"]);
  });
});

describe("runGlobalSearch (TC_103, TC_105)", () => {
  const data = {
    meetings: [
      { id: "m1", agenda: "断熱の検討", summary: "GW 16K → 24K", location: "A社展示場" },
      { id: "m2", agenda: "窓の選定", summary: "トリプル", location: "B社" },
    ],
    decisions: [
      { id: "d1", content: "断熱を高性能化", note: "確定", specValue: "GW 24K" },
      { id: "d2", content: "玄関ドア未定", note: "", specValue: "" },
    ],
    specItems: [
      { id: "s1", name: "断熱材" },
      { id: "s2", name: "サッシ" },
    ],
    companies: [
      { id: "c1", name: "A社", contact: "田中", note: "対応丁寧" },
      { id: "c2", name: "B社", contact: "鈴木", note: "" },
    ],
  };

  test("TC_103: 全エンティティを横断検索する", () => {
    const result = runGlobalSearch(data, "断熱");
    expect(result.meetings.map((m) => m.id)).toEqual(["m1"]);
    expect(result.decisions.map((d) => d.id)).toEqual(["d1"]);
    expect(result.specItems.map((s) => s.id)).toEqual(["s1"]);
    expect(result.companies).toEqual([]);
    expect(result.totalCount).toBe(3);
  });

  test("Company 名称・担当者・メモを検索する", () => {
    expect(runGlobalSearch(data, "田中").companies.map((c) => c.id)).toEqual(["c1"]);
    expect(runGlobalSearch(data, "対応").companies.map((c) => c.id)).toEqual(["c1"]);
    expect(runGlobalSearch(data, "A社").companies.map((c) => c.id)).toEqual(["c1"]);
  });

  test("Meeting summary / location も対象", () => {
    expect(runGlobalSearch(data, "展示場").meetings.map((m) => m.id)).toEqual(["m1"]);
    expect(runGlobalSearch(data, "トリプル").meetings.map((m) => m.id)).toEqual(["m2"]);
  });

  test("Decision content / note / specValue も対象", () => {
    expect(runGlobalSearch(data, "GW 24K").decisions.map((d) => d.id)).toEqual(["d1"]);
    expect(runGlobalSearch(data, "玄関").decisions.map((d) => d.id)).toEqual(["d2"]);
  });

  test("TC_105: 該当無しで totalCount 0", () => {
    const result = runGlobalSearch(data, "存在しないキーワード");
    expect(result.totalCount).toBe(0);
    expect(result.meetings).toEqual([]);
    expect(result.decisions).toEqual([]);
    expect(result.specItems).toEqual([]);
    expect(result.companies).toEqual([]);
  });

  test("空文字検索で totalCount 0 (検索開始前扱い)", () => {
    expect(runGlobalSearch(data, "").totalCount).toBe(0);
    expect(runGlobalSearch(data, "   ").meetings).toEqual([]); // 空白のみは substring 検索 (実装上ヒット多数になる可能性) ← 正規化しないが Trim はしない仕様で OK
  });

  test("大文字小文字を無視する", () => {
    expect(runGlobalSearch(data, "a社").companies.map((c) => c.id)).toEqual(["c1"]);
    expect(runGlobalSearch(data, "A社").companies.map((c) => c.id)).toEqual(["c1"]);
  });

  test("削除済みエンティティは除外", () => {
    const withDeleted = {
      meetings: [
        { id: "m1", agenda: "断熱", deletedAt: "x" },
        { id: "m2", agenda: "断熱の検討" },
      ],
      decisions: [], specItems: [], companies: [],
    };
    const result = runGlobalSearch(withDeleted, "断熱");
    expect(result.meetings.map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("splitForHighlight", () => {
  test("マッチ箇所を切り出してフラグを返す", () => {
    expect(splitForHighlight("断熱材を変更", "断熱"))
      .toEqual([
        { text: "断熱", match: true },
        { text: "材を変更", match: false },
      ]);
  });

  test("マッチが先頭以外でも動作", () => {
    expect(splitForHighlight("旧断熱新", "断熱"))
      .toEqual([
        { text: "旧", match: false },
        { text: "断熱", match: true },
        { text: "新", match: false },
      ]);
  });

  test("複数マッチ", () => {
    expect(splitForHighlight("a-x-a-y-a", "a"))
      .toEqual([
        { text: "a", match: true },
        { text: "-x-", match: false },
        { text: "a", match: true },
        { text: "-y-", match: false },
        { text: "a", match: true },
      ]);
  });

  test("空検索文字列で元テキストをそのまま 1 セグメントで返す", () => {
    expect(splitForHighlight("foo", "")).toEqual([{ text: "foo", match: false }]);
  });

  test("空テキスト → 空セグメント", () => {
    expect(splitForHighlight("", "x")).toEqual([{ text: "", match: false }]);
  });

  test("マッチなし", () => {
    expect(splitForHighlight("foo", "bar"))
      .toEqual([{ text: "foo", match: false }]);
  });

  test("大文字小文字無視でマッチを検出", () => {
    expect(splitForHighlight("Foo Bar", "foo"))
      .toEqual([
        { text: "Foo", match: true },
        { text: " Bar", match: false },
      ]);
  });
});

describe("debounce (TC_104)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("最後の呼び出しから delay 後に1回だけ実行される", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced("a");
    debounced("b");
    debounced("c");

    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  test("delay 経過後の追加呼び出しは新たに発火する", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith("a");
    debounced("b");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  test("cancel で保留中の発火を取り消せる", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a");
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });

  test("デフォルト delay は 300ms", () => {
    const fn = vi.fn();
    const debounced = debounce(fn);
    debounced();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalled();
  });
});
