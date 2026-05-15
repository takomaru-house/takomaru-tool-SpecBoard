// =============================================================================
// __tests__/component/MeetingsView.test.jsx
// Sprint 3 コンポーネントテスト - 打ち合わせビュー (UI)
//
// 対応 UI 挙動:
//   - 会社0件 Empty State
//   - 打ち合わせ0件 Empty State
//   - 登録フォーム: タイトル自動生成 / attendees パース
//   - TC_066 未来日付警告 (登録は通る)
//   - TC_067 削除カスケード (UI 経由)
//   - TC_068 Decision ステータス変更
//   - 新規仕様項目作成フロー
//   - 会社フィルター
// =============================================================================

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { STORAGE_KEYS } from "../../src/utils/constants.js";

import { MeetingsView, ToastProvider, ConfirmProvider } from "../../app.jsx";

function renderView(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <MeetingsView saveDisabled={props.saveDisabled ?? false} />
      </ConfirmProvider>
    </ToastProvider>
  );
}

async function seed({ companies = [], categories = [], specItems = [], meetings = [], decisions = [] } = {}) {
  await window.storage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  await window.storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  await window.storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(specItems));
  await window.storage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
  await window.storage.setItem(STORAGE_KEYS.DECISIONS, JSON.stringify(decisions));
  await window.storage.setItem(STORAGE_KEYS.META, JSON.stringify({ schemaVersion: "1.0.0", saveCount: 0 }));
}

const co = (id, name) => ({ id, name, contact: "担当", type: "maker", status: "considering", createdAt: "2026-01-01T00:00:00Z" });
const meeting = (id, companyId, date, title, opts = {}) => ({
  id, companyId, date, title,
  agenda: opts.agenda || "議題",
  summary: opts.summary,
  attendees: opts.attendees || [],
  createdAt: "2026-01-01T00:00:00Z",
});

describe("MeetingsView: 会社0件 Empty State", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社が0件なら専用 Empty State が表示される", async () => {
    await seed({ companies: [] });
    renderView();
    expect(await screen.findByTestId("meetings-empty-no-companies")).toBeInTheDocument();
    expect(screen.getByText(/先に会社を登録してください/)).toBeInTheDocument();
  });
});

describe("MeetingsView: 打ち合わせ0件 Empty State", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社はあるが打ち合わせ0件で Empty State", async () => {
    await seed({ companies: [co("a", "A社")] });
    renderView();
    expect(await screen.findByTestId("meetings-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("empty-add-meeting-button")).toBeInTheDocument();
  });
});

describe("MeetingsView: 打ち合わせ登録 (タイトル自動生成 + attendees パース)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("タイトル省略時は 'YYYY-MM-DD 会社名' で自動生成され保存される", async () => {
    const user = userEvent.setup();
    await seed({ companies: [co("a", "A社")] });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");

    const dateInput = within(modal).getByTestId("meeting-date-input");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-05-13");

    await user.type(within(modal).getByTestId("meeting-agenda-input"), "初回打合せ");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });
    // カードにタイトル表示
    expect(screen.getByText("2026-05-13 A社")).toBeInTheDocument();
  });

  test("attendees にカンマ区切りで入力すると配列で保存される (TC_063 UI層)", async () => {
    const user = userEvent.setup();
    await seed({ companies: [co("a", "A社")] });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");

    await user.clear(within(modal).getByTestId("meeting-date-input"));
    await user.type(within(modal).getByTestId("meeting-date-input"), "2026-05-13");
    await user.type(within(modal).getByTestId("meeting-attendees-input"), "  田中 , 鈴木  ,, 佐藤  ");
    await user.type(within(modal).getByTestId("meeting-agenda-input"), "テスト");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });

    const meetingsRaw = await window.storage.getItem(STORAGE_KEYS.MEETINGS);
    const saved = JSON.parse(meetingsRaw);
    expect(saved).toHaveLength(1);
    expect(saved[0].attendees).toEqual(["田中", "鈴木", "佐藤"]);
  });

  test("同一会社・同日2件目に (2) が付与される (TC_061 UI層)", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      meetings: [meeting("m1", "a", "2026-05-13", "2026-05-13 A社")],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");
    await user.clear(within(modal).getByTestId("meeting-date-input"));
    await user.type(within(modal).getByTestId("meeting-date-input"), "2026-05-13");
    await user.type(within(modal).getByTestId("meeting-agenda-input"), "2件目");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });
    expect(screen.getByText("2026-05-13 A社 (2)")).toBeInTheDocument();
  });
});

describe("MeetingsView: 未来日付警告 (TC_066 / E15)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("未来日付で warning Toast が表示されるが登録は可能", async () => {
    const user = userEvent.setup();
    await seed({ companies: [co("a", "A社")] });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");

    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const futureStr = future.toISOString().slice(0, 10);

    await user.clear(within(modal).getByTestId("meeting-date-input"));
    await user.type(within(modal).getByTestId("meeting-date-input"), futureStr);
    await user.type(within(modal).getByTestId("meeting-agenda-input"), "予定の打ち合わせ");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    // warning Toast が出る
    await waitFor(() => {
      expect(screen.getByTestId("toast-warning")).toBeInTheDocument();
    });
    expect(screen.getByTestId("toast-warning")).toHaveTextContent(/未来の日付/);

    // 登録は通る
    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });
    // 未来日付を含むカードがレンダリングされる (カード見出し + 日付メタで複数マッチするので All を許容)
    const matches = screen.getAllByText(new RegExp(futureStr));
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe("MeetingsView: 削除カスケード (TC_067 UI層)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("打ち合わせ削除で関連 Decision も論理削除される", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      meetings: [meeting("m1", "a", "2026-05-13", "M1")],
      decisions: [
        { id: "d1", meetingId: "m1", content: "決定1", status: "pending", createdAt: "x" },
        { id: "d2", meetingId: "m1", content: "決定2", status: "confirmed", createdAt: "y" },
      ],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("delete-meeting-button-m1"));
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-card-m1")).not.toBeInTheDocument();
    });

    const decisions = JSON.parse(await window.storage.getItem(STORAGE_KEYS.DECISIONS));
    expect(decisions.find((d) => d.id === "d1").deletedAt).toBeTruthy();
    expect(decisions.find((d) => d.id === "d2").deletedAt).toBeTruthy();
  });
});

describe("MeetingsView: 詳細ページ + Decision ステータス変更 (TC_068)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("詳細ページ表示 → ステータス変更で保存される", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      meetings: [meeting("m1", "a", "2026-05-13", "M1")],
      decisions: [
        { id: "d1", meetingId: "m1", content: "保留中の事項", status: "pending", createdAt: "x" },
      ],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));

    const detail = await screen.findByTestId("meeting-detail-page");
    expect(within(detail).getByText("保留中の事項")).toBeInTheDocument();

    // ステータス変更
    await user.selectOptions(within(detail).getByTestId("decision-status-change-d1"), "confirmed");

    // 状態が保存される
    await waitFor(async () => {
      const decisions = JSON.parse(await window.storage.getItem(STORAGE_KEYS.DECISIONS));
      expect(decisions.find((d) => d.id === "d1").status).toBe("confirmed");
    });
  });

  test("Decision を削除できる (確認ダイアログ経由)", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      meetings: [meeting("m1", "a", "2026-05-13", "M1")],
      decisions: [
        { id: "d1", meetingId: "m1", content: "削除対象", status: "pending", createdAt: "x" },
      ],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("meeting-card-m1"));
    const detail = await screen.findByTestId("meeting-detail-page");
    await user.click(within(detail).getByTestId("decision-delete-d1"));
    const dialog = await screen.findByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("confirm-ok-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("decision-detail-d1")).not.toBeInTheDocument();
    });
  });
});

describe("MeetingsView: 新規仕様項目作成フロー", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("Decision に '+ 新規仕様項目を作成して反映' を選んで保存できる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [{ id: "c1", name: "断熱", normalizedName: "断熱", sortOrder: 0, isDefault: false, createdAt: "x" }],
      specItems: [],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");
    await user.clear(within(modal).getByTestId("meeting-date-input"));
    await user.type(within(modal).getByTestId("meeting-date-input"), "2026-05-13");
    await user.type(within(modal).getByTestId("meeting-agenda-input"), "決定するぞ");

    // 決定事項を追加
    await user.click(within(modal).getByTestId("add-decision-button"));
    await user.type(within(modal).getByTestId("decision-content-input-0"), "新仕様項目を作成して反映");
    await user.selectOptions(within(modal).getByTestId("decision-spec-item-select-0"), "__new_item__");
    // 新規項目フォームが展開される
    const newForm = await within(modal).findByTestId("decision-new-item-form-0");
    await user.type(within(newForm).getByTestId("decision-new-spec-item-name-input-0"), "新項目");
    await user.type(within(modal).getByTestId("decision-spec-value-input-0"), "GW 24K");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });

    // SpecItem が新規追加されている
    const items = JSON.parse(await window.storage.getItem(STORAGE_KEYS.SPEC_ITEMS));
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("新項目");
    expect(items[0].categoryId).toBe("c1");

    // Decision に specItemId が紐づいている
    const decisions = JSON.parse(await window.storage.getItem(STORAGE_KEYS.DECISIONS));
    expect(decisions).toHaveLength(1);
    expect(decisions[0].specItemId).toBe(items[0].id);
    expect(decisions[0].specValue).toBe("GW 24K");
  });

  test("新規カテゴリ作成もできる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      categories: [{ id: "c1", name: "既存", normalizedName: "既存", sortOrder: 0, isDefault: false, createdAt: "x" }],
      specItems: [],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");
    await user.clear(within(modal).getByTestId("meeting-date-input"));
    await user.type(within(modal).getByTestId("meeting-date-input"), "2026-05-13");
    await user.type(within(modal).getByTestId("meeting-agenda-input"), "x");

    await user.click(within(modal).getByTestId("add-decision-button"));
    await user.type(within(modal).getByTestId("decision-content-input-0"), "決定");
    await user.selectOptions(within(modal).getByTestId("decision-spec-item-select-0"), "__new_item__");
    const newForm = await within(modal).findByTestId("decision-new-item-form-0");
    await user.type(within(newForm).getByTestId("decision-new-spec-item-name-input-0"), "項目A");
    await user.selectOptions(
      within(newForm).getByTestId("decision-new-spec-item-category-select-0"),
      "__new_category__"
    );
    await user.type(within(newForm).getByTestId("decision-new-category-name-input-0"), "新カテゴリ");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });

    const cats = JSON.parse(await window.storage.getItem(STORAGE_KEYS.CATEGORIES));
    expect(cats.find((c) => c.name === "新カテゴリ")).toBeDefined();
  });
});

describe("MeetingsView: 会社フィルター", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社フィルターで該当会社の打ち合わせのみ表示", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社"), co("b", "B社")],
      meetings: [
        meeting("m1", "a", "2026-05-13", "A社1"),
        meeting("m2", "b", "2026-05-14", "B社1"),
      ],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    expect(screen.getByTestId("meeting-card-m1")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-card-m2")).toBeInTheDocument();

    await user.click(screen.getByTestId("meeting-filter-a"));
    expect(screen.getByTestId("meeting-card-m1")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-card-m2")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("meeting-filter-all"));
    expect(screen.getByTestId("meeting-card-m1")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-card-m2")).toBeInTheDocument();
  });
});

describe("MeetingsView: 前回の打ち合わせパネル", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("会社選択時に前回打ち合わせが表示される", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      meetings: [meeting("m1", "a", "2026-04-01", "前回", { agenda: "前回議題", summary: "前回まとめ" })],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");

    expect(within(modal).getByTestId("prev-meeting-panel")).toBeInTheDocument();
    expect(within(modal).getByText(/A社 の前回の打ち合わせ/)).toBeInTheDocument();

    // 展開すると議題が見える
    await user.click(within(modal).getByTestId("prev-meeting-toggle"));
    expect(within(modal).getByText(/前回議題/)).toBeInTheDocument();
  });

  test("前回打ち合わせが無ければパネルは表示されない", async () => {
    const user = userEvent.setup();
    await seed({ companies: [co("a", "A社")] });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");

    expect(within(modal).queryByTestId("prev-meeting-panel")).not.toBeInTheDocument();
  });
});

describe("MeetingsView: バリデーション (TC_064 UI)", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("議題空のまま登録するとエラー表示で送信されない", async () => {
    const user = userEvent.setup();
    await seed({ companies: [co("a", "A社")] });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("add-meeting-button"));
    const modal = await screen.findByTestId("meeting-form-modal");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    expect(within(modal).getByText(/議題は必須です/)).toBeInTheDocument();
    // モーダルはまだ開いている
    expect(screen.getByTestId("meeting-form-modal")).toBeInTheDocument();
  });
});

describe("MeetingsView: 編集フロー", () => {
  let restored;
  beforeEach(() => {
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("既存の打ち合わせを編集できる", async () => {
    const user = userEvent.setup();
    await seed({
      companies: [co("a", "A社")],
      meetings: [meeting("m1", "a", "2026-05-13", "旧タイトル", { agenda: "旧議題" })],
    });
    renderView();

    await screen.findByTestId("meetings-view");
    await user.click(screen.getByTestId("edit-meeting-button-m1"));
    const modal = await screen.findByTestId("meeting-form-modal");
    expect(within(modal).getByText(/打ち合わせを編集/)).toBeInTheDocument();

    const titleInput = within(modal).getByTestId("meeting-title-input");
    await user.clear(titleInput);
    await user.type(titleInput, "新タイトル");
    await user.click(within(modal).getByTestId("save-meeting-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("meeting-form-modal")).not.toBeInTheDocument();
    });
    expect(screen.getByText("新タイトル")).toBeInTheDocument();
  });
});
