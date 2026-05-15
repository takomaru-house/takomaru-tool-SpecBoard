// =============================================================================
// __tests__/component/Responsive.test.jsx
// Sprint 7-A レスポンシブ確認 (Tailwind ユーティリティクラス検証)
//
// jsdom では実 viewport を変えられないため、適切な class が要素に付与されている
// (md:hidden / hidden md:block / overflow-x-auto / no-print 等) をアサートする。
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";
import * as fs from "fs";
import * as path from "path";

import {
  CompaniesView,
  SpecComparisonView,
  CompanyCard,
  ToastProvider,
  ConfirmProvider,
} from "../../app.jsx";

function wrap(node) {
  return render(
    <ToastProvider>
      <ConfirmProvider>{node}</ConfirmProvider>
    </ToastProvider>
  );
}

const sampleCompany = {
  id: "c1", name: "A社", contact: "田中", type: "maker",
  status: "considering", createdAt: "2026-01-01T00:00:00Z",
};

async function seedCompanies(list) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(list));
  await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([]));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify([]));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify([]));
  await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify([]));
  await window.storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify([]));
  await window.storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify([]));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

describe("CompaniesView: グリッドのレスポンシブ列数", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社カードのグリッドが grid + md:grid-cols-2 + xl:grid-cols-3 class を持つ", async () => {
    await seedCompanies([sampleCompany]);
    wrap(<CompaniesView saveDisabled={false} />);
    const card = await screen.findByTestId("company-card");
    const grid = card.parentElement;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).toMatch(/md:grid-cols-2/);
    expect(grid.className).toMatch(/xl:grid-cols-3/);
  });
});

describe("SpecComparisonView: 横スクロール対応", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("仕様比較テーブルが overflow-x-auto を持つ (会社多数で横スクロール)", async () => {
    await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify([sampleCompany]));
    await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([{
      id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0, isDefault: false, createdAt: "x",
    }]));
    await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify([{
      id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [], createdAt: "x",
    }]));
    await window.storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify([]));
    await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify([]));
    await window.storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify([]));
    await window.storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify([]));
    await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));

    wrap(<SpecComparisonView saveDisabled={false} />);
    const table = await screen.findByTestId("spec-table");
    expect(table.parentElement.className).toMatch(/overflow-x-auto/);
  });
});

describe("印刷時の非表示制御", () => {
  test("CompanyCard 本体は印刷対象 (no-print クラスを持たない)", () => {
    wrap(<CompanyCard company={sampleCompany} meetingsCount={0}
      onClick={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    const card = screen.getByTestId("company-card");
    expect(card.className).not.toMatch(/no-print/);
  });
});

describe("ナビゲーション系の Tailwind クラス (ソースコード検証)", () => {
  let src;
  beforeEach(() => {
    const filename = path.resolve(process.cwd(), "app.jsx");
    src = fs.readFileSync(filename, "utf-8");
  });

  test("BottomNavigation は md:hidden fixed bottom-0 で制御されている", () => {
    expect(src).toMatch(/md:hidden fixed bottom-0/);
  });

  test("TabNavigation (デスクトップ) は hidden md:block で制御されている", () => {
    expect(src).toMatch(/hidden md:block/);
  });

  test("Header の検索バーは hidden sm:block (スマホ非表示)", () => {
    expect(src).toMatch(/hidden sm:block/);
  });

  test("GlobalStyles に @media print の宣言がある", () => {
    expect(src).toMatch(/@media print/);
    expect(src).toMatch(/header, nav, \.no-print \{ display: none !important; \}/);
  });
});
