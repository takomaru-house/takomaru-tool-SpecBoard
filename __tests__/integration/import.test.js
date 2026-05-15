// =============================================================================
// __tests__/integration/import.test.js
// Sprint 6 結合テスト - JSON エクスポート/インポート 往復 + アトミック保証
//
// 対応テストケース: TC_110, TC_111, TC_112, TC_113, TC_114
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";
import { exportAllJSON, importAll, computeStorageUsage } from "../../src/utils/exportImport.js";

describe("exportAllJSON (TC_110, TC_111)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_110: 全エンティティが JSON に含まれる", async () => {
    await storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify([{ id: "co1" }]));
    await storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([{ id: "c1" }]));
    await storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify([{ id: "s1" }]));
    await storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify([{ id: "n1" }]));
    await storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify([{ id: "m1" }]));
    await storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify([{ id: "d1" }]));
    await storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify([{ id: "l1" }]));

    const exp = await exportAllJSON(storage);
    expect(exp.version).toBe("1.0");
    expect(exp.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(exp.companies).toHaveLength(1);
    expect(exp.categories).toHaveLength(1);
    expect(exp.specItems).toHaveLength(1);
    expect(exp.specItemNotes).toHaveLength(1);
    expect(exp.meetings).toHaveLength(1);
    expect(exp.decisions).toHaveLength(1);
    expect(exp.changeLogs).toHaveLength(1);
  });

  test("TC_111: 論理削除済みエンティティも含まれる", async () => {
    await storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify([
      { id: "co1", name: "A" },
      { id: "co2", name: "B", deletedAt: "2026-01-01" },
    ]));
    const exp = await exportAllJSON(storage);
    expect(exp.companies).toHaveLength(2);
    expect(exp.companies.find((c) => c.id === "co2").deletedAt).toBeTruthy();
  });

  test("ストレージに何もなくても空配列で返す", async () => {
    const exp = await exportAllJSON(storage);
    expect(exp.companies).toEqual([]);
    expect(exp.changeLogs).toEqual([]);
  });
});

describe("importAll - 往復 (TC_112)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_112: エクスポート → クリア → インポートで完全復元", async () => {
    const original = {
      companies: [
        { id: "co1", name: "A社", status: "considering", contact: "x", type: "maker", createdAt: "x" },
      ],
      categories: [
        { id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0, isDefault: false, createdAt: "x" },
      ],
      specItems: [
        { id: "s1", categoryId: "c1", name: "断熱材", sortOrder: 0, createdAt: "x",
          values: [{ companyId: "co1", value: "GW 24K", updatedAt: "y" }] },
      ],
      meetings: [
        { id: "m1", companyId: "co1", date: "2026-05-13", title: "M1", agenda: "x", createdAt: "x", attendees: [] },
      ],
      decisions: [
        { id: "d1", meetingId: "m1", content: "決定", status: "confirmed", createdAt: "x" },
      ],
      specItemNotes: [
        { id: "n1", specItemId: "s1", companyId: "co1", note: "A社優位", createdAt: "x", updatedAt: "x" },
      ],
      changeLogs: [
        { id: "l1", specItemId: "s1", companyId: "co1", previousValue: "", newValue: "GW 24K",
          changedAt: "2026-05-13T00:00:00Z", createdAt: "2026-05-13T00:00:00Z" },
      ],
    };

    await storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(original.companies));
    await storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(original.categories));
    await storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(original.specItems));
    await storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify(original.specItemNotes));
    await storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(original.meetings));
    await storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(original.decisions));
    await storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(original.changeLogs));

    const exported = await exportAllJSON(storage);

    // クリア
    for (const k of Object.values(STORAGE_KEYS)) {
      if (k === STORAGE_KEYS.META) continue;
      await storage.removeItem(k);
    }
    // 空であることを確認
    const cleared = await exportAllJSON(storage);
    expect(cleared.companies).toEqual([]);

    // 上書きインポート
    await importAll(storage, exported, "overwrite");

    const restoredCompanies = JSON.parse(await storage.getItem(STORAGE_KEYS.COMPANIES));
    const restoredItems = JSON.parse(await storage.getItem(STORAGE_KEYS.SPEC_ITEMS));
    const restoredNotes = JSON.parse(await storage.getItem(STORAGE_KEYS.SPEC_ITEM_NOTES));
    expect(restoredCompanies[0].id).toBe("co1");
    expect(restoredItems[0].values[0].value).toBe("GW 24K");
    expect(restoredNotes[0].note).toBe("A社優位");
  });
});

describe("importAll - ID 衝突 (TC_113 / E4)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("merge で会社 ID 衝突 → 新 UUID + Meeting の参照も remap", async () => {
    // 既存
    await storage.setItem(STORAGE_KEYS.COMPANIES,
      JSON.stringify([{ id: "co1", name: "既存A社", contact: "x", type: "maker", status: "considering", createdAt: "x" }]));

    // インポート (同じ ID で別データ)
    const incoming = {
      version: "1.0",
      companies: [{ id: "co1", name: "新A社", contact: "y", type: "maker", status: "candidate", createdAt: "y" }],
      meetings: [{ id: "m1", companyId: "co1", date: "2026-06-01", title: "M1", agenda: "x", attendees: [], createdAt: "z" }],
    };
    await importAll(storage, incoming, "merge");

    const companies = JSON.parse(await storage.getItem(STORAGE_KEYS.COMPANIES));
    expect(companies).toHaveLength(2);
    const imported = companies.find((c) => c.name === "新A社");
    expect(imported.id).not.toBe("co1");

    const meetings = JSON.parse(await storage.getItem(STORAGE_KEYS.MEETINGS));
    expect(meetings[0].companyId).toBe(imported.id); // 参照が再マッピング
  });
});

describe("importAll - アトミック (TC_114)", () => {
  let realWindowStorage;
  let restored;
  let storage;
  beforeEach(() => {
    realWindowStorage = mockStorage({ available: true });
    restored = installGlobalStorage({ windowStorage: realWindowStorage });
    storage = createStorage("window.storage");
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_114: 途中の書き込み失敗で全キーがロールバックされる", async () => {
    // 既存データ
    await storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify([{ id: "co_existing", name: "保持必須" }]));
    await storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify([{ id: "m_existing" }]));
    const snapshotCompanies = await storage.getItem(STORAGE_KEYS.COMPANIES);
    const snapshotMeetings = await storage.getItem(STORAGE_KEYS.MEETINGS);

    // meetings 保存だけ失敗させるストレージラッパー
    const failStorage = {
      getItem: async (k) => realWindowStorage.getItem(k),
      setItem: async (k, v) => {
        if (k === STORAGE_KEYS.MEETINGS) throw new Error("simulated meetings failure");
        return realWindowStorage.setItem(k, v);
      },
      removeItem: async (k) => realWindowStorage.removeItem(k),
    };

    const incoming = {
      version: "1.0",
      companies: [{ id: "co_new", name: "新A社" }],
      meetings: [{ id: "m_new", companyId: "co_new" }],
    };

    await expect(importAll(failStorage, incoming, "merge")).rejects.toThrow(/meetings failure/);

    // 既存データは無傷
    expect(await storage.getItem(STORAGE_KEYS.COMPANIES)).toBe(snapshotCompanies);
    expect(await storage.getItem(STORAGE_KEYS.MEETINGS)).toBe(snapshotMeetings);
  });
});

describe("importAll - プロトタイプ汚染防御 (TC_118)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("__proto__ キーを持つエンティティはサニタイズされる", async () => {
    const incoming = JSON.parse(`{
      "version": "1.0",
      "companies": [{"id":"co1","name":"X","__proto__":{"polluted":true}}]
    }`);
    await importAll(storage, incoming, "merge");
    const companies = JSON.parse(await storage.getItem(STORAGE_KEYS.COMPANIES));
    expect(companies[0]).not.toHaveProperty("__proto__");
    expect(({}).polluted).toBeUndefined();
  });
});

describe("importAll - バージョン不一致", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("デフォルトでは例外を投げる", async () => {
    await expect(importAll(storage, { version: "0.9" }, "merge"))
      .rejects.toThrow(/バージョン不一致/);
  });

  test("allowVersionMismatch=true で続行できる", async () => {
    const incoming = { version: "0.9", companies: [{ id: "co1", name: "X" }] };
    await expect(importAll(storage, incoming, "merge", { allowVersionMismatch: true }))
      .resolves.toBeDefined();
  });
});

describe("computeStorageUsage", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("各キーのバイト数と合計を返す", async () => {
    await storage.setItem(STORAGE_KEYS.COMPANIES, "abc");      // 3 bytes
    await storage.setItem(STORAGE_KEYS.MEETINGS, "12345");     // 5 bytes
    const result = await computeStorageUsage(storage,
      [STORAGE_KEYS.COMPANIES, STORAGE_KEYS.MEETINGS, STORAGE_KEYS.DECISIONS]);
    expect(result.keys[STORAGE_KEYS.COMPANIES]).toBe(3);
    expect(result.keys[STORAGE_KEYS.MEETINGS]).toBe(5);
    expect(result.keys[STORAGE_KEYS.DECISIONS]).toBe(0);
    expect(result.total).toBe(8);
  });

  test("UTF-8 マルチバイト文字も正しくバイト計算", async () => {
    await storage.setItem(STORAGE_KEYS.COMPANIES, "あいう"); // 9 bytes (3 chars × 3 bytes)
    const result = await computeStorageUsage(storage, [STORAGE_KEYS.COMPANIES]);
    expect(result.keys[STORAGE_KEYS.COMPANIES]).toBe(9);
  });
});
