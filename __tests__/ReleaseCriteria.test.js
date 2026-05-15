// =============================================================================
// __tests__/ReleaseCriteria.test.js
// Sprint 7-B リリース判定メタテスト (RC-01〜RC-10)
//
// CLAUDE.md / Spec.md の最終リリース判定基準を満たしていることを宣言的に確認する。
// 個別の機能テストは各テストファイルで実施済み。
// =============================================================================

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();

function readFile(rel) {
  return fs.readFileSync(path.resolve(ROOT, rel), "utf-8");
}

function listTestFiles() {
  const dir = path.resolve(ROOT, "__tests__");
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.test\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
    }
  }
  walk(dir);
  return files;
}

describe("Release Criteria (RC-01〜RC-10) 監査", () => {
  test("RC-01: 全単体テストが unit/ 配下に存在する", () => {
    const dir = path.resolve(ROOT, "__tests__/unit");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js"));
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  test("RC-02: 全結合テストが integration/ 配下に存在する", () => {
    const dir = path.resolve(ROOT, "__tests__/integration");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js"));
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  test("RC-03: コンポーネントテストが component/ 配下に存在する", () => {
    const dir = path.resolve(ROOT, "__tests__/component");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.jsx"));
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  test("RC-04: カバレッジ目標が package.json / vitest.config.js に設定されている", () => {
    const cfg = readFile("vitest.config.js");
    expect(cfg).toMatch(/lines:\s*80/);
    expect(cfg).toMatch(/branches:\s*70/);
  });

  test("RC-05: エッジケース E1〜E20 のテスト所在が確認できる", () => {
    const e1to10 = readFile("__tests__/component/EdgeCasesE1toE10.test.jsx");
    const e11to20 = readFile("__tests__/component/EdgeCasesE11toE20.test.jsx");
    // E1〜E10 言及
    for (let i = 1; i <= 10; i++) {
      expect(e1to10).toMatch(new RegExp(`E${i}\\b`));
    }
    // E11〜E20 言及
    for (let i = 11; i <= 20; i++) {
      expect(e11to20).toMatch(new RegExp(`E${i}\\b`));
    }
  });

  test("RC-06: パフォーマンステストファイルが存在し、計測条件が記述されている", () => {
    const perf = readFile("__tests__/Performance.test.js");
    expect(perf).toMatch(/N_COMPANIES\s*=\s*10/);
    expect(perf).toMatch(/N_MEETINGS\s*=\s*100/);
    expect(perf).toMatch(/N_SPEC_ITEMS\s*=\s*50/);
    expect(perf).toMatch(/N_CHANGE_LOGS\s*=\s*500/);
  });

  test("RC-07: 手動テスト対象が CLAUDE.md に記載されている", () => {
    const md = readFile("CLAUDE.md");
    // 手動テスト対象表の存在
    expect(md).toMatch(/手動テスト対象/);
    // 主な手動項目
    expect(md).toMatch(/印刷レイアウト/);
    expect(md).toMatch(/スクリーンリーダー/);
    expect(md).toMatch(/探索的テスト/);
  });

  test("RC-08: ChangeLog 削除不可 (改ざん防止) が実装されている", () => {
    const changeLogJs = readFile("src/utils/changeLog.js");
    expect(changeLogJs).not.toMatch(/export\s+(async\s+)?function\s+(delete|remove)/i);
    // app.jsx でも削除関数の export なし
    const appJsx = readFile("app.jsx");
    expect(appJsx).not.toMatch(/deleteChangeLog/);
  });

  test("RC-09: 書き込み不能モード (storageMode='none') 関連の処理が実装されている", () => {
    const storage = readFile("src/utils/storage.js");
    expect(storage).toMatch(/"none"/);
    const appJsx = readFile("app.jsx");
    expect(appJsx).toMatch(/StorageUnavailableBanner/);
    // 書き込み不能判定 (resolvedStorageMode === "none" / mode === "none" など)
    expect(appJsx).toMatch(/(resolvedStorageMode|mode)\s*===\s*"none"/);
  });

  test("RC-10: JSON エクスポート→インポート往復テストが存在する (TC_112)", () => {
    const importTest = readFile("__tests__/integration/import.test.js");
    expect(importTest).toMatch(/TC_112/);
    expect(importTest).toMatch(/往復/);
  });

  test("テストファイル総数が想定どおり (>= 30)", () => {
    const files = listTestFiles();
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  test("CLAUDE.md と Spec.md と 02-テスト/ が揃っている", () => {
    expect(fs.existsSync(path.resolve(ROOT, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.resolve(ROOT, "docs/Spec.md"))).toBe(true);
    expect(fs.existsSync(path.resolve(ROOT, "02-テスト"))).toBe(true);
  });

  test("Sprint 0〜7 すべてのテストファイルが存在し、宣言的に網羅できている", () => {
    const required = [
      // Sprint 0
      "__tests__/unit/storage.test.js",
      "__tests__/unit/migration.test.js",
      // Sprint 1
      "__tests__/unit/validation.test.js",
      "__tests__/integration/company.test.js",
      "__tests__/component/CompanyFormModal.test.jsx",
      "__tests__/component/CompanyDetailPage.test.jsx",
      "__tests__/component/CompaniesView.test.jsx",
      // Sprint 2
      "__tests__/unit/category.test.js",
      "__tests__/unit/specItem.test.js",
      "__tests__/unit/specItemNote.test.js",
      "__tests__/unit/changeLog.test.js",
      "__tests__/integration/spec.test.js",
      "__tests__/component/SpecComparisonView.test.jsx",
      // Sprint 3
      "__tests__/unit/meeting.test.js",
      "__tests__/unit/decision.test.js",
      "__tests__/integration/meeting.test.js",
      "__tests__/component/MeetingsView.test.jsx",
      // Sprint 4
      "__tests__/unit/specReflection.test.js",
      "__tests__/integration/spec-reflection.test.js",
      "__tests__/component/ChangeLogsView.test.jsx",
      "__tests__/component/SpecReflectionFlow.test.jsx",
      // Sprint 5
      "__tests__/unit/dashboard.test.js",
      "__tests__/unit/search.test.js",
      "__tests__/component/DashboardView.test.jsx",
      "__tests__/component/GlobalSearchPanel.test.jsx",
      // Sprint 6
      "__tests__/unit/csv.test.js",
      "__tests__/unit/exportImport.test.js",
      "__tests__/integration/import.test.js",
      "__tests__/component/SettingsView.test.jsx",
      // Sprint 7-A
      "__tests__/component/Accessibility.test.jsx",
      "__tests__/component/EdgeCasesE1toE10.test.jsx",
      "__tests__/component/Responsive.test.jsx",
      // Sprint 7-B
      "__tests__/component/EdgeCasesE11toE20.test.jsx",
      "__tests__/component/Keyboard.test.jsx",
      "__tests__/Performance.test.js",
      "__tests__/ReleaseCriteria.test.js",
    ];
    for (const f of required) {
      expect(fs.existsSync(path.resolve(ROOT, f)), `${f} が存在しない`).toBe(true);
    }
  });
});
