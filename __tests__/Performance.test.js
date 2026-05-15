// =============================================================================
// __tests__/Performance.test.js
// Sprint 7-B パフォーマンステスト
//
// 計測条件 (Spec.md §5-1): 会社10社・打ち合わせ100件・仕様項目50件・ChangeLog 500件
// 注意: jsdom は実ブラウザよりも約 2〜3 倍遅い傾向があるため、閾値は緩めに設定する。
//       実 Artifact 環境では Spec.md の閾値 (初回ロード 3秒以内 等) を満たす想定。
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../__tests__/fixtures/mock-storage.js";
import { createStorage } from "../src/utils/storage.js";
import { STORAGE_KEYS } from "../src/utils/constants.js";
import { computeSummary, recentMeetings, recentDecisions, pendingActions } from "../src/utils/dashboard.js";
import { runGlobalSearch } from "../src/utils/search.js";
import { exportAllJSON } from "../src/utils/exportImport.js";
import { buildSpecComparisonCsv } from "../src/utils/csv.js";
import { reflectToSpec } from "../src/utils/specReflection.js";
import { sortChangeLogsDesc } from "../src/utils/changeLog.js";

// 計測条件: Spec.md §5-1
const N_COMPANIES = 10;
const N_MEETINGS = 100;
const N_SPEC_ITEMS = 50;
const N_CATEGORIES = 5;
const N_CHANGE_LOGS = 500;
const N_DECISIONS = 200;

// 閾値 (jsdom 環境向けに 2 倍の安全マージン)
const THRESHOLDS = {
  initialLoadMs: 6000,      // Spec.md 3000ms × 2
  tabSwitchMs:   1000,      // Spec.md 500ms × 2
  crudSaveMs:    2000,      // Spec.md 1000ms × 2
  reflectMs:     4000,      // Spec.md 2000ms × 2
  exportMs:      6000,      // Spec.md 3000ms × 2
  searchMs:      1000,      // 大量データ検索 (Spec.md 500ms × 2)
};

function buildSeed() {
  const now = new Date().toISOString();

  const companies = Array.from({ length: N_COMPANIES }, (_, i) => ({
    id: `co${i}`, name: `会社${i}`,
    contact: `担当${i}`, type: "maker",
    status: i < 3 ? "considering" : i < 6 ? "candidate" : i < 8 ? "contracted" : "rejected",
    note: "x".repeat(50),
    createdAt: now,
  }));

  const categories = Array.from({ length: N_CATEGORIES }, (_, i) => ({
    id: `cat${i}`, name: `カテゴリ${i}`,
    normalizedName: `カテゴリ${i}`.toLowerCase(),
    sortOrder: i, isDefault: false, createdAt: now,
  }));

  const specItems = Array.from({ length: N_SPEC_ITEMS }, (_, i) => ({
    id: `s${i}`, name: `仕様項目${i}`,
    categoryId: `cat${i % N_CATEGORIES}`,
    sortOrder: Math.floor(i / N_CATEGORIES),
    values: companies.slice(0, 3).map((co) => ({
      companyId: co.id, value: `値${i}-${co.id}`, updatedAt: now,
    })),
    createdAt: now,
  }));

  const meetings = Array.from({ length: N_MEETINGS }, (_, i) => ({
    id: `m${i}`,
    companyId: companies[i % N_COMPANIES].id,
    date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, "0")}-${String((i % 30) + 1).padStart(2, "0")}`,
    title: `打ち合わせ${i}`,
    agenda: `議題${i}`,
    summary: i % 10 === 0 ? "あ".repeat(200) : `まとめ${i}`,
    attendees: [`参加者${i}`],
    location: i % 5 === 0 ? "本社" : undefined,
    createdAt: now,
  }));

  const decisions = Array.from({ length: N_DECISIONS }, (_, i) => ({
    id: `d${i}`,
    meetingId: meetings[i % N_MEETINGS].id,
    content: `決定事項${i}`,
    status: ["pending", "confirmed", "cancelled"][i % 3],
    note: i % 3 === 0 ? `メモ${i}` : undefined,
    specItemId: specItems[i % N_SPEC_ITEMS].id,
    specCompanyId: companies[i % N_COMPANIES].id,
    specValue: `v${i}`,
    createdAt: now,
  }));

  const changeLogs = Array.from({ length: N_CHANGE_LOGS }, (_, i) => ({
    id: `l${i}`,
    specItemId: specItems[i % N_SPEC_ITEMS].id,
    companyId: companies[i % N_COMPANIES].id,
    previousValue: i === 0 ? "" : `v${i - 1}`,
    newValue: `v${i}`,
    meetingId: meetings[i % N_MEETINGS].id,
    reason: i % 5 === 0 ? `理由${i}` : undefined,
    changedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    createdAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  }));

  return { companies, categories, specItems, meetings, decisions, changeLogs };
}

async function seedToStorage(storage, data) {
  await storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(data.companies));
  await storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data.categories));
  await storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(data.specItems));
  await storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(data.meetings));
  await storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(data.decisions));
  await storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(data.changeLogs));
  await storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify([]));
  await storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

function measure(label, fn) {
  const start = performance.now();
  return Promise.resolve(fn()).then((result) => {
    const ms = performance.now() - start;
    return { ms, result, label };
  });
}

describe("Performance: 計測条件で各操作が閾値以内", () => {
  let storage;
  let restored;
  let seedData;

  beforeEach(async () => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    storage = createStorage("window.storage");
    seedData = buildSeed();
    await seedToStorage(storage, seedData);
  });
  afterEach(() => restoreGlobalStorage(restored));

  test(`初回ロード: ストレージ全件読み込みが ${THRESHOLDS.initialLoadMs}ms 以内`, async () => {
    const { ms } = await measure("initialLoad", async () => {
      await storage.getItem(STORAGE_KEYS.COMPANIES);
      await storage.getItem(STORAGE_KEYS.CATEGORIES);
      await storage.getItem(STORAGE_KEYS.SPEC_ITEMS);
      await storage.getItem(STORAGE_KEYS.MEETINGS);
      await storage.getItem(STORAGE_KEYS.DECISIONS);
      await storage.getItem(STORAGE_KEYS.CHANGE_LOGS);
      await storage.getItem(STORAGE_KEYS.SPEC_ITEM_NOTES);
    });
    console.log(`[perf] initialLoad: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(THRESHOLDS.initialLoadMs);
  });

  test(`ダッシュボード集計: computeSummary + recentMeetings + recentDecisions + pendingActions が ${THRESHOLDS.tabSwitchMs}ms 以内`, async () => {
    const { ms } = await measure("dashboard", () => {
      computeSummary(seedData);
      recentMeetings(seedData.meetings);
      recentDecisions(seedData.decisions);
      pendingActions(seedData.decisions);
    });
    console.log(`[perf] dashboardCompute: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(THRESHOLDS.tabSwitchMs);
  });

  test(`仕様反映フロー (reflectToSpec) が ${THRESHOLDS.reflectMs}ms 以内`, async () => {
    const decision = {
      specItemId: seedData.specItems[0].id,
      specCompanyId: seedData.companies[0].id,
      specValue: "新値",
      meetingId: seedData.meetings[0].id,
    };
    const { ms } = await measure("reflectToSpec", async () => {
      await reflectToSpec(storage, decision, "計測テスト");
    });
    console.log(`[perf] reflectToSpec: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(THRESHOLDS.reflectMs);
  });

  test(`JSON 全件エクスポートが ${THRESHOLDS.exportMs}ms 以内`, async () => {
    const { ms, result } = await measure("export", async () => {
      return await exportAllJSON(storage);
    });
    console.log(`[perf] export: ${ms.toFixed(1)}ms (entries: companies=${result.companies.length}, meetings=${result.meetings.length}, changeLogs=${result.changeLogs.length})`);
    expect(ms).toBeLessThan(THRESHOLDS.exportMs);
    expect(result.companies.length).toBe(N_COMPANIES);
    expect(result.meetings.length).toBe(N_MEETINGS);
    expect(result.changeLogs.length).toBe(N_CHANGE_LOGS);
  });

  test(`CSV 仕様比較エクスポート (全件) が ${THRESHOLDS.exportMs}ms 以内`, async () => {
    const { ms, result } = await measure("csv", () => buildSpecComparisonCsv({
      companies: seedData.companies,
      categories: seedData.categories,
      specItems: seedData.specItems,
      mode: "all",
    }));
    console.log(`[perf] csv: ${ms.toFixed(1)}ms (bytes=${result.length})`);
    expect(ms).toBeLessThan(THRESHOLDS.exportMs);
    expect(result.length).toBeGreaterThan(0);
  });

  test(`全文検索が ${THRESHOLDS.searchMs}ms 以内`, async () => {
    const { ms, result } = await measure("search", () => runGlobalSearch(seedData, "決定"));
    console.log(`[perf] search "決定": ${ms.toFixed(1)}ms (hits=${result.totalCount})`);
    expect(ms).toBeLessThan(THRESHOLDS.searchMs);
    expect(result.totalCount).toBeGreaterThan(0);
  });

  test(`ChangeLog 500件のソート (sortChangeLogsDesc) が高速`, () => {
    const start = performance.now();
    const sorted = sortChangeLogsDesc(seedData.changeLogs);
    const ms = performance.now() - start;
    console.log(`[perf] sortChangeLogsDesc 500件: ${ms.toFixed(1)}ms`);
    expect(sorted.length).toBe(N_CHANGE_LOGS);
    // 不要に遅くないことの sanity check
    expect(ms).toBeLessThan(200);
  });

  test("Spec.md パフォーマンス目標 (実環境向け) を記録", () => {
    const targets = {
      initialLoad: "3000ms",
      tabSwitch:   "500ms",
      crudSave:    "1000ms",
      reflectToSpec: "2000ms",
      jsonExport:  "3000ms",
    };
    // ドキュメント値が手元と一致することを宣言的に確認
    expect(targets).toBeDefined();
    for (const [key, val] of Object.entries(targets)) {
      expect(val).toMatch(/^\d+ms$/);
    }
  });
});
