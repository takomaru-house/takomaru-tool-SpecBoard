// =============================================================================
// __tests__/component/SettingsView.test.jsx
// Sprint 6 コンポーネントテスト - 設定画面 (Export/Import/CSV/印刷/アーカイブ/使用量)
//
// 対応 UI 挙動:
//   - JSON エクスポート (Blob ダウンロード)
//   - JSON インポート (マージ / 上書き / バージョン不一致 警告)
//   - CSV エクスポート (全件 / 確定済み)
//   - 印刷ボタンで window.print() が呼ばれる
//   - ストレージ使用量プログレスバー
//   - 累積保存回数
//   - アーカイブ表示 (論理削除済み一覧)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import { SettingsView, ToastProvider, ConfirmProvider } from "../../app.jsx";

let downloadCalls;
let printCalls;
let originalCreateObjectURL;
let originalRevokeObjectURL;

function setupBrowserMocks() {
  downloadCalls = [];
  printCalls = 0;

  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn((blob) => `blob:mock-${downloadCalls.length}`);
  URL.revokeObjectURL = vi.fn();

  const proto = HTMLAnchorElement.prototype;
  proto.click = function () {
    downloadCalls.push({
      href: this.href,
      download: this.download,
    });
  };

  if (!window.print) window.print = () => {};
  window.print = vi.fn(() => { printCalls++; });
}

function teardownBrowserMocks() {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
}

function renderView({ saveDisabled = false, onClose = vi.fn() } = {}) {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <SettingsView saveDisabled={saveDisabled} onClose={onClose} />
      </ConfirmProvider>
    </ToastProvider>
  );
  return { onClose };
}

async function seed(data = {}) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(data.companies || []));
  await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(data.categories || []));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(data.specItems || []));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEM_NOTES, JSON.stringify(data.specItemNotes || []));
  await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(data.meetings || []));
  await window.storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(data.decisions || []));
  await window.storage.setItem(STORAGE_KEYS.CHANGE_LOGS, JSON.stringify(data.changeLogs || []));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify(data.meta || { schemaVersion: "1.0.0", saveCount: 0 }));
}

describe("SettingsView: 基本表示", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  test("ストレージ使用量・保存回数・印刷ボタン・アーカイブが表示される", async () => {
    await seed({ companies: [{ id: "c1", name: "A社" }], meta: { saveCount: 42 } });
    renderView();
    await screen.findByTestId("settings-view");

    expect(screen.getByTestId("storage-usage-card")).toBeInTheDocument();
    expect(screen.getByTestId("save-count-value")).toHaveTextContent("42");
    expect(screen.getByTestId("print-button")).toBeInTheDocument();
    expect(screen.getByTestId("archive-card")).toBeInTheDocument();
  });

  test("各 STORAGE_KEY の使用量バーが表示される", async () => {
    await seed({ companies: [{ id: "c1", name: "A社" }] });
    renderView();
    await screen.findByTestId("settings-view");

    for (const key of Object.values(STORAGE_KEYS)) {
      expect(screen.getByTestId(`storage-usage-${key}`)).toBeInTheDocument();
    }
  });
});

describe("SettingsView: JSON エクスポート", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  test("エクスポートボタンクリックでダウンロードがトリガーされる", async () => {
    const user = userEvent.setup();
    await seed({ companies: [{ id: "c1", name: "A社", createdAt: "2026-01-01T00:00:00Z" }] });
    renderView();
    await screen.findByTestId("settings-view");

    await user.click(screen.getByTestId("export-json-button"));

    await waitFor(() => {
      expect(downloadCalls.length).toBe(1);
    });
    expect(downloadCalls[0].download).toMatch(/^takomaru-specboard-\d{4}-\d{2}-\d{2}\.json$/);
    expect(screen.getByTestId("toast-success")).toHaveTextContent(/JSON.*エクスポート/);
  });

  test("saveDisabled でエクスポートボタンが無効化される", async () => {
    await seed();
    renderView({ saveDisabled: true });
    await screen.findByTestId("settings-view");
    expect(screen.getByTestId("export-json-button")).toBeDisabled();
  });
});

describe("SettingsView: CSV エクスポート", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  test("CSV「全件」ボタンでダウンロードがトリガーされる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [{ id: "co1", name: "A社" }],
      categories: [{ id: "c1", name: "断熱", sortOrder: 0 }],
      specItems: [{ id: "s1", name: "断熱材", categoryId: "c1", sortOrder: 0, values: [] }],
    });
    renderView();
    await screen.findByTestId("settings-view");

    await user.click(screen.getByTestId("export-csv-all-button"));
    await waitFor(() => {
      expect(downloadCalls.length).toBe(1);
    });
    expect(downloadCalls[0].download).toMatch(/^spec-comparison-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("CSV「確定済みのみ」ボタンも動作", async () => {
    const user = userEvent.setup();
    await seed({});
    renderView();
    await screen.findByTestId("settings-view");
    await user.click(screen.getByTestId("export-csv-confirmed-button"));
    await waitFor(() => {
      expect(downloadCalls.length).toBe(1);
    });
  });
});

describe("SettingsView: JSON インポート", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  async function importJsonFile(user, jsonObject) {
    const file = new File([JSON.stringify(jsonObject)], "import.json", { type: "application/json" });
    const input = screen.getByTestId("import-file-input");
    await user.upload(input, file);
  }

  test("マージモードで JSON インポート → 既存に追加される", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [{ id: "co1", name: "既存社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
    });
    renderView();
    await screen.findByTestId("settings-view");

    expect(screen.getByTestId("import-mode-select")).toHaveValue("merge");

    await importJsonFile(user, {
      version: "1.0",
      companies: [{ id: "co2", name: "新社", contact: "y", type: "maker", status: "candidate", createdAt: "y" }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("toast-success")).toHaveTextContent(/インポートが完了/);
    });

    const companies = JSON.parse(await window.storage.getItem(STORAGE_KEYS.COMPANIES));
    expect(companies).toHaveLength(2);
    expect(companies.find((c) => c.name === "新社")).toBeDefined();
    expect(companies.find((c) => c.name === "既存社")).toBeDefined();
  });

  test("上書きモードは確認ダイアログ → OK で全置換", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [{ id: "co1", name: "既存社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
    });
    renderView();
    await screen.findByTestId("settings-view");

    await user.selectOptions(screen.getByTestId("import-mode-select"), "overwrite");
    await importJsonFile(user, {
      version: "1.0",
      companies: [{ id: "co2", name: "新社", contact: "y", type: "maker", status: "candidate", createdAt: "y" }],
    });

    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    await waitFor(() => {
      expect(screen.getByTestId("toast-success")).toHaveTextContent(/インポートが完了/);
    });
    const companies = JSON.parse(await window.storage.getItem(STORAGE_KEYS.COMPANIES));
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("新社");
  });

  test("上書きモードでキャンセルすると既存データが維持される", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [{ id: "co1", name: "既存社", contact: "x", type: "maker", status: "considering", createdAt: "x" }],
    });
    renderView();
    await screen.findByTestId("settings-view");

    await user.selectOptions(screen.getByTestId("import-mode-select"), "overwrite");
    await importJsonFile(user, {
      version: "1.0",
      companies: [{ id: "co2", name: "新社" }],
    });

    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-cancel-button"));

    const companies = JSON.parse(await window.storage.getItem(STORAGE_KEYS.COMPANIES));
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("既存社");
  });

  test("バージョン不一致で warning Toast + 確認 → OK で続行", async () => {
    const user = userEvent.setup();
    await seed({});
    renderView();
    await screen.findByTestId("settings-view");

    await importJsonFile(user, {
      version: "0.9",
      companies: [{ id: "co1", name: "互換社" }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("toast-warning")).toHaveTextContent(/バージョン不一致/);
    });
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    await waitFor(() => {
      const successToasts = screen.queryAllByTestId("toast-success");
      expect(successToasts.length).toBeGreaterThan(0);
    });
  });

  test("不正な JSON でエラー Toast", async () => {
    const user = userEvent.setup();
    await seed({});
    renderView();
    await screen.findByTestId("settings-view");

    const file = new File(["{invalid json"], "bad.json", { type: "application/json" });
    await user.upload(screen.getByTestId("import-file-input"), file);

    await waitFor(() => {
      expect(screen.getByTestId("toast-error")).toHaveTextContent(/JSON.*解析|形式が不正/);
    });
  });
});

describe("SettingsView: 印刷ボタン", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  test("印刷ボタンクリックで window.print() が呼ばれる (F-ST-004)", async () => {
    const user = userEvent.setup();
    await seed({});
    renderView();
    await screen.findByTestId("settings-view");

    await user.click(screen.getByTestId("print-button"));
    expect(window.print).toHaveBeenCalled();
  });
});

describe("SettingsView: アーカイブ表示", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  test("論理削除済みエンティティがアーカイブに表示される", async () => {
    await seed({
      companies: [
        { id: "co1", name: "現役社", contact: "x", type: "maker", status: "considering", createdAt: "x" },
        { id: "co2", name: "削除済み社", contact: "y", type: "maker", status: "considering",
          createdAt: "x", deletedAt: "2026-04-01T00:00:00Z" },
      ],
      meetings: [
        { id: "m1", title: "削除済み打ち合わせ", companyId: "co1", date: "2026-03-13", agenda: "x",
          attendees: [], createdAt: "x", deletedAt: "2026-04-01T00:00:00Z" },
      ],
    });
    renderView();
    await screen.findByTestId("settings-view");

    expect(screen.getByTestId("archive-section-company")).toBeInTheDocument();
    expect(screen.getByTestId("archive-company-co2")).toHaveTextContent("削除済み社");

    expect(screen.getByTestId("archive-section-meeting")).toBeInTheDocument();
    expect(screen.getByTestId("archive-meeting-m1")).toHaveTextContent("削除済み打ち合わせ");
  });

  test("論理削除がゼロなら空メッセージ", async () => {
    await seed({});
    renderView();
    await screen.findByTestId("settings-view");
    expect(screen.getByText(/論理削除されたデータはありません/)).toBeInTheDocument();
  });
});

describe("SettingsView: 戻るボタン", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
    setupBrowserMocks();
  });
  afterEach(() => { teardownBrowserMocks(); restoreGlobalStorage(restored); });

  test("onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    await seed({});
    const { onClose } = renderView();
    await screen.findByTestId("settings-view");
    await user.click(screen.getByTestId("settings-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
