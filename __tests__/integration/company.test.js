// =============================================================================
// __tests__/integration/company.test.js
// Sprint 1 結合テスト - Company CRUD + 論理削除ポリシー
//
// 対応テストケース: TC_020, TC_021, TC_027, TC_031
// 設計参照:
//   - 02-テスト/04-テストケース.md (test-cases-sprint1-company.json)
//   - 02-テスト/03-テスト観点.md (F-CM-001〜004, F-BR-001, F-BR-011)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import {
  createCompany,
  updateCompany,
  softDeleteCompany,
  filterActiveCompanies,
  filterByStatus,
  partitionByContracted,
  loadCompanies,
  saveCompanies,
  appendCompany,
  replaceCompany,
  softDeleteCompanyById,
} from "../../src/utils/company.js";
import { createStorage } from "../../src/utils/storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

// ---------- 純粋関数: createCompany / updateCompany / softDeleteCompany ----------
describe("Company エンティティ操作 (TC_020, TC_021 / F-CM-001, F-CM-002)", () => {
  test("TC_020: 全フィールド入力で Company が生成される", () => {
    const company = createCompany({
      name: "テストハウスメーカー",
      type: "maker",
      contact: "田中太郎",
      phone: "090-1234-5678",
      email: "tanaka@test.co.jp",
      status: "considering",
      note: "展示場で名刺をもらった",
    });
    expect(company.id).toBeTruthy();
    expect(company.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(company.name).toBe("テストハウスメーカー");
    expect(company.type).toBe("maker");
    expect(company.contact).toBe("田中太郎");
    expect(company.phone).toBe("090-1234-5678");
    expect(company.email).toBe("tanaka@test.co.jp");
    expect(company.status).toBe("considering");
    expect(company.note).toBe("展示場で名刺をもらった");
    expect(company.deletedAt).toBeUndefined();
  });

  test("TC_021: 必須のみ (name + contact) で Company を生成できる", () => {
    const company = createCompany({ name: "A工務店", contact: "鈴木一郎" });
    expect(company.name).toBe("A工務店");
    expect(company.contact).toBe("鈴木一郎");
    expect(company.phone).toBeUndefined();
    expect(company.email).toBeUndefined();
    expect(company.note).toBeUndefined();
    expect(company.status).toBe("considering"); // デフォルト
    expect(company.type).toBe("maker");          // デフォルト
  });

  test("createCompany は name の前後空白をトリムする", () => {
    const company = createCompany({ name: "  A社  ", contact: " 担当 " });
    expect(company.name).toBe("A社");
    expect(company.contact).toBe("担当");
  });

  test("updateCompany は id / createdAt を維持する", () => {
    const original = createCompany({ name: "旧名", contact: "担当" });
    const updated = updateCompany(original, {
      name: "新名", type: "builder", contact: "担当", status: "candidate"
    });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.name).toBe("新名");
    expect(updated.type).toBe("builder");
    expect(updated.status).toBe("candidate");
  });

  test("softDeleteCompany は deletedAt を ISO 文字列でセットする", () => {
    const company = createCompany({ name: "削除対象", contact: "担当" });
    const deleted = softDeleteCompany(company);
    expect(deleted.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(deleted.id).toBe(company.id);
    expect(deleted.name).toBe(company.name);
  });
});

// ---------- フィルタ / 分類 ----------
describe("Company フィルタ・ソート (F-CM-004, F-CM-005, F-BR-011)", () => {
  const sample = [
    { id: "c1", name: "A社", status: "considering", createdAt: "2026-01-01T00:00:00Z" },
    { id: "c2", name: "B社", status: "candidate",   createdAt: "2026-02-01T00:00:00Z" },
    { id: "c3", name: "C社", status: "contracted",  createdAt: "2026-03-01T00:00:00Z" },
    { id: "c4", name: "D社", status: "rejected",    createdAt: "2026-04-01T00:00:00Z" },
    { id: "c5", name: "削除済", status: "considering", createdAt: "2026-05-01T00:00:00Z", deletedAt: "2026-05-02T00:00:00Z" },
  ];

  test("filterActiveCompanies は deletedAt 持ちを除外する", () => {
    const result = filterActiveCompanies(sample);
    expect(result).toHaveLength(4);
    expect(result.map((c) => c.id)).not.toContain("c5");
  });

  test("filterByStatus は指定ステータスのみを返す", () => {
    expect(filterByStatus(sample, "considering").map((c) => c.id)).toEqual(["c1", "c5"]);
    expect(filterByStatus(sample, "contracted").map((c) => c.id)).toEqual(["c3"]);
  });

  test("filterByStatus は 'all' または未指定で全件を返す", () => {
    expect(filterByStatus(sample, "all")).toHaveLength(sample.length);
    expect(filterByStatus(sample, null)).toHaveLength(sample.length);
    expect(filterByStatus(sample)).toHaveLength(sample.length);
  });

  test("partitionByContracted は契約済とそれ以外を分離する", () => {
    const { contracted, others } = partitionByContracted(filterActiveCompanies(sample));
    expect(contracted.map((c) => c.id)).toEqual(["c3"]);
    expect(others.map((c) => c.id)).toEqual(["c1", "c2", "c4"]);
  });
});

// ---------- ストレージ I/O ----------
describe("Company ストレージ I/O (TC_027 / F-CM-004, F-BR-001)", () => {
  let storage;
  let restored;

  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });

  afterEach(() => {
    restoreGlobalStorage(restored);
  });

  test("空のストレージから loadCompanies で [] を返す", async () => {
    const list = await loadCompanies(storage);
    expect(list).toEqual([]);
  });

  test("saveCompanies → loadCompanies の往復で同一データが得られる", async () => {
    const companies = [createCompany({ name: "A社", contact: "担当A" })];
    await saveCompanies(storage, companies);
    const loaded = await loadCompanies(storage);
    expect(loaded).toEqual(companies);
  });

  test("appendCompany で会社を追加できる", async () => {
    const a = createCompany({ name: "A社", contact: "担当A" });
    const b = createCompany({ name: "B社", contact: "担当B" });
    await appendCompany(storage, a);
    await appendCompany(storage, b);
    const loaded = await loadCompanies(storage);
    expect(loaded).toHaveLength(2);
    expect(loaded.map((c) => c.name)).toEqual(["A社", "B社"]);
  });

  test("replaceCompany で会社を更新できる", async () => {
    const a = createCompany({ name: "A社", contact: "担当A" });
    await appendCompany(storage, a);
    const updated = updateCompany(a, { name: "A社改", contact: "担当A", status: "candidate" });
    await replaceCompany(storage, updated);
    const loaded = await loadCompanies(storage);
    expect(loaded[0].name).toBe("A社改");
    expect(loaded[0].status).toBe("candidate");
    expect(loaded[0].id).toBe(a.id);
  });

  test("TC_027: softDeleteCompanyById 後、filterActiveCompanies で除外される", async () => {
    const a = createCompany({ name: "削除テスト社", contact: "担当" });
    const b = createCompany({ name: "残存社", contact: "担当B" });
    await saveCompanies(storage, [a, b]);

    await softDeleteCompanyById(storage, a.id);

    const all = await loadCompanies(storage);
    expect(all).toHaveLength(2);
    const deleted = all.find((c) => c.id === a.id);
    expect(deleted.deletedAt).toBeTruthy();

    const active = filterActiveCompanies(all);
    expect(active.map((c) => c.name)).toEqual(["残存社"]);
  });

  test("TC_031: Company 論理削除しても storage 上の他キー (meetings/change_logs) は影響を受けない", async () => {
    const a = createCompany({ name: "保持確認社", contact: "担当" });
    await saveCompanies(storage, [a]);
    // 関連データを別キーに保存 (実装は Sprint 3/4 だが、参照保持の検証として)
    await storage.setItem(STORAGE_KEYS.MEETINGS,
      JSON.stringify([{ id: "m1", companyId: a.id, date: "2026-05-13", agenda: "初回" }]));
    await storage.setItem(STORAGE_KEYS.CHANGE_LOGS,
      JSON.stringify([{ id: "l1", specItemId: "s1", companyId: a.id, previousValue: "x", newValue: "y", changedAt: "2026-05-13T00:00:00Z", createdAt: "2026-05-13T00:00:00Z" }]));

    await softDeleteCompanyById(storage, a.id);

    const meetings = JSON.parse(await storage.getItem(STORAGE_KEYS.MEETINGS));
    const changeLogs = JSON.parse(await storage.getItem(STORAGE_KEYS.CHANGE_LOGS));
    expect(meetings).toHaveLength(1);
    expect(meetings[0].companyId).toBe(a.id);
    expect(changeLogs).toHaveLength(1);
    expect(changeLogs[0].companyId).toBe(a.id);
  });

  test("リロードを跨いでも会社データが保持される (リロード ≒ 同storageで再 load)", async () => {
    const company = createCompany({ name: "セッションテスト社", contact: "担当" });
    await appendCompany(storage, company);

    // 「リロード」= 新しい storage インスタンスでアクセス (実装は同じ window.storage を参照)
    const storage2 = createStorage("window.storage");
    const loaded = await loadCompanies(storage2);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("セッションテスト社");
  });
});
