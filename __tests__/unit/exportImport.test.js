// =============================================================================
// __tests__/unit/exportImport.test.js
// Sprint 6 単体テスト - validateImportFile / sanitizeEntity / resolveIdConflict / resolveAllIdConflicts
//
// 対応テストケース: TC_113 (ID衝突 / 純粋ロジック), TC_118 (プロトタイプ汚染), TC_119 (validate)
// =============================================================================

import { describe, test, expect } from "vitest";
import {
  validateImportFile,
  sanitizeEntity,
  resolveIdConflict,
  resolveAllIdConflicts,
} from "../../src/utils/exportImport.js";

describe("validateImportFile (TC_119)", () => {
  test("null でエラー", () => {
    expect(validateImportFile(null)).toMatch(/JSON|形式/);
  });

  test("undefined でエラー", () => {
    expect(validateImportFile(undefined)).toMatch(/JSON|形式/);
  });

  test("配列でエラー", () => {
    expect(validateImportFile([])).toMatch(/JSON|形式/);
    expect(validateImportFile([{ version: "1.0" }])).toMatch(/JSON|形式/);
  });

  test("プリミティブでエラー", () => {
    expect(validateImportFile("string")).toMatch(/JSON|形式/);
    expect(validateImportFile(123)).toMatch(/JSON|形式/);
  });

  test("version 欠落でエラー", () => {
    expect(validateImportFile({ companies: [] })).toMatch(/version/);
  });

  test("version 不一致で警告メッセージ", () => {
    const r = validateImportFile({ version: "0.9" });
    expect(r).toMatch(/バージョン不一致/);
  });

  test("正常な形式で null", () => {
    expect(validateImportFile({ version: "1.0", companies: [] })).toBeNull();
  });
});

describe("sanitizeEntity (TC_118 / NF-SC-005)", () => {
  test("通常のオブジェクトはそのままコピー", () => {
    const obj = { id: "x", name: "foo" };
    expect(sanitizeEntity(obj)).toEqual(obj);
    expect(sanitizeEntity(obj)).not.toBe(obj);
  });

  test("__proto__ キーを除去", () => {
    const malicious = JSON.parse('{"id":"x","__proto__":{"polluted":true}}');
    const sanitized = sanitizeEntity(malicious);
    expect(sanitized).not.toHaveProperty("__proto__");
    expect(sanitized.polluted).toBeUndefined();
    expect({}.polluted).toBeUndefined(); // Object.prototype 汚染なし
  });

  test("constructor / prototype キーを除去", () => {
    const malicious = { id: "x", constructor: "evil", prototype: "evil" };
    const sanitized = sanitizeEntity(malicious);
    expect(sanitized.constructor).toBe(Object); // 通常の Object.prototype.constructor
    expect(sanitized.prototype).toBeUndefined();
  });

  test("null / undefined はそのまま返す", () => {
    expect(sanitizeEntity(null)).toBeNull();
    expect(sanitizeEntity(undefined)).toBeUndefined();
  });
});

describe("resolveIdConflict (TC_113 補助)", () => {
  test("ID 衝突時に新 ID を発行する", () => {
    const item = { id: "existing", name: "x" };
    const result = resolveIdConflict(item, new Set(["existing"]));
    expect(result.id).not.toBe("existing");
    expect(result.name).toBe("x");
  });

  test("衝突しない場合は元のまま (シャローコピーで返さない)", () => {
    const item = { id: "unique", name: "x" };
    const result = resolveIdConflict(item, new Set(["other"]));
    expect(result).toBe(item);
  });

  test("id 欠落エンティティはそのまま返す", () => {
    const item = { name: "no-id" };
    const result = resolveIdConflict(item, new Set([]));
    expect(result).toBe(item);
  });
});

describe("resolveAllIdConflicts (TC_113)", () => {
  test("merge: 既存と衝突した ID が新規発行され、参照 FK も更新される", () => {
    const importJson = {
      version: "1.0",
      companies: [{ id: "co1", name: "新A社" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2026-05-13", agenda: "x" }],
    };
    const existing = {
      companies: [{ id: "co1", name: "既存A社" }],
      meetings: [],
      categories: [], spec_items: [], spec_item_notes: [], decisions: [], change_logs: [],
    };
    const result = resolveAllIdConflicts(importJson, existing, "merge");
    // companies 2 件 (既存 + インポートで新 ID 発行)
    expect(result.companies).toHaveLength(2);
    const importedCompany = result.companies.find((c) => c.name === "新A社");
    expect(importedCompany.id).not.toBe("co1");
    // meetings は新会社の新 ID を指している
    expect(result.meetings).toHaveLength(1);
    expect(result.meetings[0].companyId).toBe(importedCompany.id);
  });

  test("overwrite モード: 既存を全て置き換える", () => {
    const importJson = {
      version: "1.0",
      companies: [{ id: "co1", name: "新A社" }],
    };
    const existing = {
      companies: [{ id: "co1", name: "既存A社" }, { id: "co2", name: "既存B社" }],
      meetings: [], categories: [], spec_items: [], spec_item_notes: [], decisions: [], change_logs: [],
    };
    const result = resolveAllIdConflicts(importJson, existing, "overwrite");
    expect(result.companies).toEqual([{ id: "co1", name: "新A社" }]);
    expect(result.meetings).toEqual([]);
  });

  test("__proto__ キーを持つエンティティは除去される (TC_118 統合)", () => {
    const importJson = {
      version: "1.0",
      companies: [JSON.parse('{"id":"co1","name":"X","__proto__":{"polluted":true}}')],
    };
    const result = resolveAllIdConflicts(importJson, {
      companies: [], meetings: [], categories: [],
      spec_items: [], spec_item_notes: [], decisions: [], change_logs: [],
    }, "merge");
    expect(result.companies[0]).not.toHaveProperty("__proto__");
    expect(({}).polluted).toBeUndefined();
  });

  test("Decision の specItemId / specCompanyId / meetingId が remap される", () => {
    // JSON フィールド名は camelCase (specItems / changeLogs 等)
    const importJson = {
      version: "1.0",
      companies: [{ id: "co1", name: "X" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2026-05-13", agenda: "x" }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", values: [] }],
      decisions: [{
        id: "d1", meetingId: "m1", content: "決定",
        specItemId: "s1", specCompanyId: "co1", specValue: "v",
      }],
      categories: [{ id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0 }],
    };
    // 既存 (storageKey = snake_case)
    const existing = {
      companies: [{ id: "co1", name: "既存X社" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2026-01-01", agenda: "old" }],
      spec_items: [{ id: "s1", name: "既存項目", categoryId: "c1", values: [] }],
      spec_item_notes: [],
      decisions: [],
      change_logs: [],
      categories: [{ id: "c1", name: "既存カテゴリ", normalizedName: "既存", sortOrder: 0 }],
    };
    const result = resolveAllIdConflicts(importJson, existing, "merge");
    const importedDecision = result.decisions.find((d) => d.content === "決定");
    expect(importedDecision).toBeDefined();
    const importedMeeting = result.meetings.find((m) => m.date === "2026-05-13");
    const importedCompany = result.companies.find((c) => c.name === "X");
    const importedItem = result.spec_items.find((s) => s.name === "断熱材");
    expect(importedItem).toBeDefined();
    // 参照が新 ID に書き換わっている
    expect(importedDecision.meetingId).toBe(importedMeeting.id);
    expect(importedDecision.specCompanyId).toBe(importedCompany.id);
    expect(importedDecision.specItemId).toBe(importedItem.id);
  });

  test("SpecItem.values 内の companyId / meetingId も remap される", () => {
    const importJson = {
      version: "1.0",
      companies: [{ id: "co1", name: "X" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2026-05-13", agenda: "x" }],
      specItems: [{
        id: "s1", name: "断熱材", categoryId: "c1",
        values: [{ companyId: "co1", value: "GW", meetingId: "m1", updatedAt: "x" }],
      }],
      categories: [{ id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0 }],
    };
    const existing = {
      companies: [{ id: "co1", name: "既存" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2025-01-01", agenda: "old" }],
      spec_items: [], spec_item_notes: [], decisions: [], change_logs: [],
      categories: [],
    };
    const result = resolveAllIdConflicts(importJson, existing, "merge");
    const importedItem = result.spec_items.find((s) => s.name === "断熱材");
    expect(importedItem).toBeDefined();
    const importedCompany = result.companies.find((c) => c.name === "X");
    const importedMeeting = result.meetings.find((m) => m.date === "2026-05-13");
    expect(importedItem.values[0].companyId).toBe(importedCompany.id);
    expect(importedItem.values[0].meetingId).toBe(importedMeeting.id);
  });
});
