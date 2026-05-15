// =============================================================================
// 注文住宅管理ツール - app.jsx
// Sprint 0 実装範囲: 基盤・ストレージ・共通UI・アプリシェル
//
// 設計参照:
//   - docs/Spec.md
//   - CLAUDE.md
//   - 02-テスト/02-テスト計画.md
//   - 02-テスト/03-テスト観点.md
//   - 02-テスト/04-テストケース.md
//   - 02-テスト/05-テストスクリプト.md
//
// セクション構成:
//   1. 型定義・定数
//   2. ストレージユーティリティ
//   3. 共通UIコンポーネント
//   4. 会社管理コンポーネント         （Sprint 1 で実装）
//   5. 仕様比較コンポーネント         （Sprint 2 で実装）
//   6. 打ち合わせコンポーネント       （Sprint 3 で実装）
//   7. 変更ログコンポーネント         （Sprint 4 で実装）
//   8. ダッシュボード                 （Sprint 5 で実装）
//   9. 設定・Import/Export            （Sprint 6 で実装）
//  10. メインApp・ルーティング
// =============================================================================

const { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } = React;

// ===== 1. 型定義・定数 =====

const APP_VERSION = "0.1.0-sprint0";
const SCHEMA_VERSION = "1.0.0";
const EXPORT_FORMAT_VERSION = "1.0";

const STORAGE_KEYS = {
  META:            "meta",
  COMPANIES:       "companies",
  CATEGORIES:      "categories",
  SPEC_ITEMS:      "spec_items",
  SPEC_ITEM_NOTES: "spec_item_notes",
  MEETINGS:        "meetings",
  DECISIONS:       "decisions",
  CHANGE_LOGS:     "change_logs",
};

const STORAGE_WARNING_BYTES = 400_000;
const STORAGE_BACKUP_SAVE_COUNT = 50;

const COMPANY_STATUS = {
  CONSIDERING: "considering",
  CANDIDATE:   "candidate",
  REJECTED:    "rejected",
  CONTRACTED:  "contracted",
};

const COMPANY_STATUS_LABEL = {
  considering: "検討中",
  candidate:   "候補",
  rejected:    "落選",
  contracted:  "契約済",
};

const COMPANY_TYPE = {
  MAKER:   "maker",
  BUILDER: "builder",
  OTHER:   "other",
};

const COMPANY_TYPE_LABEL = {
  maker:   "ハウスメーカー",
  builder: "工務店",
  other:   "その他",
};

const DECISION_STATUS = {
  CONFIRMED: "confirmed",
  PENDING:   "pending",
  CANCELLED: "cancelled",
};

const DECISION_STATUS_LABEL = {
  confirmed: "確定",
  pending:   "保留",
  cancelled: "キャンセル",
};

const PRIORITY_LABEL = {
  high:   "高",
  medium: "中",
  low:    "低",
};

const VALIDATION = {
  Company: {
    name:    { required: true,  maxLength: 50 },
    contact: { required: true,  maxLength: 30 },
    phone:   { required: false, maxLength: 15,  pattern: /^[\d\-\+\(\)\s]*$/ },
    email:   { required: false, maxLength: 100, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    note:    { required: false, maxLength: 500 },
  },
  Meeting: {
    date:      { required: true,  format: "YYYY-MM-DD" },
    agenda:    { required: true,  maxLength: 1000 },
    summary:   { required: false, maxLength: 2000 },
    attendees: { required: false, maxItems: 20, itemMaxLength: 30 },
    location:  { required: false, maxLength: 100 },
  },
  Decision: {
    content:   { required: true,  maxLength: 1000 },
    specValue: { required: false, maxLength: 200 },
    note:      { required: false, maxLength: 500 },
  },
  SpecItem: {
    name:  { required: true,  maxLength: 50 },
    value: { required: false, maxLength: 200 },
  },
  Category: {
    name: { required: true, maxLength: 30, unique: true, normalize: "trim+toLowerCase" },
  },
  SpecItemNote: {
    note: { required: true, maxLength: 200 },
  },
};

const StorageError = {
  QUOTA_EXCEEDED:      "容量上限に達しました。JSONエクスポートで容量を確保してください",
  READ_FAILED:         "データの読み込みに失敗しました。ページを再読み込みしてください",
  WRITE_FAILED:        "保存に失敗しました。しばらく待ってから再試行してください",
  PARSE_ERROR:         "データ形式が不正です。インポートファイルを確認してください",
  STORAGE_UNAVAILABLE: "ストレージが利用できません。データは保存されません",
};

const DEFAULT_TEMPLATE = [
  { category: "断熱",
    items: ["断熱工法", "断熱材の種類", "断熱等性能等級（UA値）", "床断熱材"] },
  { category: "開口部（窓）",
    items: ["サッシの種類", "ガラスの種類", "玄関ドアの種類"] },
  { category: "構造",
    items: ["工法", "耐震等級", "基礎の種類", "地盤保証"] },
  { category: "設備（水回り）",
    items: ["キッチン", "浴室", "洗面台", "トイレ"] },
  { category: "保証・アフターサービス",
    items: ["初期保証年数", "長期保証の条件", "定期点検の頻度"] },
];

const TABS = [
  { id: "dashboard",       label: "ダッシュボード", icon: "🏠" },
  { id: "companies",       label: "会社管理",       icon: "🏢" },
  { id: "spec-comparison", label: "仕様比較",       icon: "📋" },
  { id: "meetings",        label: "打ち合わせ",     icon: "📅" },
  { id: "change-logs",     label: "変更ログ",       icon: "📜" },
];

// ===== 2. ストレージユーティリティ =====

// storageMode は verifyStorageAPI() の結果に基づきアプリ初期化時に決定する。
// "window.storage" | "localStorage" | "none"
let storageMode = "window.storage";

async function verifyStorageAPI() {
  try {
    await window.storage.setItem("__test__", JSON.stringify({ ok: true }));
    const result = await window.storage.getItem("__test__");
    const parsed = JSON.parse(result);
    await window.storage.removeItem("__test__");

    if (parsed && parsed.ok) {
      console.log("✅ window.storage API 正常動作確認");
      const dummy = "x".repeat(100_000);
      await window.storage.setItem("__capacity_test__", dummy);
      await window.storage.removeItem("__capacity_test__");
      console.log("✅ 100KB書き込み成功");
      return "window.storage";
    }
    throw new Error("window.storage 検証失敗: 期待した値が読み取れませんでした");
  } catch (e) {
    console.warn("⚠️ window.storage 利用不可。localStorage にフォールバック:", e);
    try {
      localStorage.setItem("__fb_test__", "1");
      localStorage.removeItem("__fb_test__");
      console.log("✅ localStorage 利用可能");
      return "localStorage";
    } catch (e2) {
      console.error("❌ localStorage も利用不可:", e2);
      return "none";
    }
  }
}

const storage = {
  getItem: async (key) => {
    if (storageMode === "window.storage") return window.storage.getItem(key);
    if (storageMode === "localStorage")   return localStorage.getItem(key);
    return null;
  },
  setItem: async (key, value) => {
    if (storageMode === "window.storage") return window.storage.setItem(key, value);
    if (storageMode === "localStorage")   return localStorage.setItem(key, value);
    throw new Error(StorageError.STORAGE_UNAVAILABLE);
  },
  removeItem: async (key) => {
    if (storageMode === "window.storage") return window.storage.removeItem(key);
    if (storageMode === "localStorage")   return localStorage.removeItem(key);
  },
};

async function safeStorageOperation(operation, showToast) {
  try {
    return await operation();
  } catch (e) {
    if (e && e.name === "QuotaExceededError") {
      showToast?.("error", StorageError.QUOTA_EXCEEDED);
    } else if (e && /unavailable/i.test(e.message || "")) {
      showToast?.("error", StorageError.STORAGE_UNAVAILABLE);
    } else {
      showToast?.("error", StorageError.WRITE_FAILED);
    }
    throw e;
  }
}

async function loadMeta() {
  const raw = await storage.getItem(STORAGE_KEYS.META);
  if (!raw) return { schemaVersion: "0.0.0", saveCount: 0 };
  try {
    return JSON.parse(raw);
  } catch {
    return { schemaVersion: "0.0.0", saveCount: 0 };
  }
}

async function saveMeta(meta) {
  await storage.setItem(STORAGE_KEYS.META, JSON.stringify(meta));
}

async function loadEntities(key) {
  const raw = await storage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveWithCapacityCheck(key, data, showToast) {
  const str = JSON.stringify(data);
  if (str.length > STORAGE_WARNING_BYTES) {
    showToast?.("warning",
      "データ量が多くなっています。JSONエクスポートでバックアップを推奨します。");
  }
  await safeStorageOperation(() => storage.setItem(key, str), showToast);
  await incrementSaveCount(showToast);
}

async function incrementSaveCount(showToast) {
  const meta = await loadMeta();
  const count = (meta.saveCount ?? 0) + 1;
  await saveMeta({ ...meta, saveCount: count });
  if (count % STORAGE_BACKUP_SAVE_COUNT === 0) {
    showToast?.("info",
      `${count}回保存しました。JSONエクスポートでバックアップをお勧めします。`);
  }
}

// --- マイグレーション ---

async function migrateV0toV1(data) {
  const categories = (data.categories ?? []).map((c) => ({
    ...c,
    normalizedName: c.normalizedName ?? (c.name ?? "").trim().toLowerCase(),
  }));
  const specItems = (data.spec_items ?? []).map((s, i) => ({
    ...s,
    sortOrder: s.sortOrder ?? i,
  }));
  return { ...data, categories, spec_items: specItems };
}

const MIGRATIONS = {
  "0.0.0->1.0.0": migrateV0toV1,
};

function compareVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

async function loadAllKnownEntities() {
  const result = {};
  for (const key of Object.values(STORAGE_KEYS)) {
    if (key === STORAGE_KEYS.META) continue;
    const raw = await storage.getItem(key);
    if (raw) {
      try { result[key] = JSON.parse(raw); } catch { /* ignore */ }
    }
  }
  return result;
}

async function persistAllEntities(data) {
  for (const [key, value] of Object.entries(data)) {
    if (key === STORAGE_KEYS.META) continue;
    if (value !== undefined) {
      await storage.setItem(key, JSON.stringify(value));
    }
  }
}

async function runMigrations() {
  const meta = await loadMeta();
  const current = meta.schemaVersion || "0.0.0";
  if (compareVersion(current, SCHEMA_VERSION) >= 0) return false;

  let data = await loadAllKnownEntities();
  for (const [path, fn] of Object.entries(MIGRATIONS)) {
    const [from, to] = path.split("->");
    if (compareVersion(current, from) <= 0 && compareVersion(to, SCHEMA_VERSION) <= 0) {
      data = await fn(data);
    }
  }
  await persistAllEntities(data);
  await saveMeta({
    ...meta,
    schemaVersion: SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
  });
  return true;
}

// --- 標準テンプレート投入 ---

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function initializeDefaultTemplateIfEmpty() {
  const categories = await loadEntities(STORAGE_KEYS.CATEGORIES);
  const specItems  = await loadEntities(STORAGE_KEYS.SPEC_ITEMS);
  if (categories.length > 0 || specItems.length > 0) return false;

  const now = new Date().toISOString();
  const newCategories = [];
  const newSpecItems  = [];
  DEFAULT_TEMPLATE.forEach((tmpl, catIdx) => {
    const categoryId = newId();
    newCategories.push({
      id: categoryId,
      name: tmpl.category,
      normalizedName: tmpl.category.trim().toLowerCase(),
      sortOrder: catIdx,
      isDefault: true,
      createdAt: now,
    });
    tmpl.items.forEach((itemName, itemIdx) => {
      newSpecItems.push({
        id: newId(),
        categoryId,
        name: itemName,
        sortOrder: itemIdx,
        values: [],
        createdAt: now,
      });
    });
  });

  await storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(newCategories));
  await storage.setItem(STORAGE_KEYS.SPEC_ITEMS, JSON.stringify(newSpecItems));
  return true;
}

// ===== 3. 共通UIコンポーネント =====

// --- Toast ---

const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type, message) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), 3000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const TOAST_STYLES = {
  success: { bg: "bg-sage-deep", icon: "✓" },
  error:   { bg: "bg-rust",      icon: "✕" },
  warning: { bg: "bg-wood-deep", icon: "!" },
  info:    { bg: "bg-ink",       icon: "i" },
};

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => {
        const style = TOAST_STYLES[t.type] || TOAST_STYLES.info;
        return (
          <div
            key={t.id}
            role="status"
            data-testid={`toast-${t.type}`}
            className={`pointer-events-auto ${style.bg} text-white rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 animate-fade-in`}
            style={{ boxShadow: "0 8px 24px rgba(26,24,22,0.18)" }}
          >
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/15 text-sm font-semibold"
            >
              {style.icon}
            </span>
            <span className="flex-1 text-sm leading-relaxed">{t.message}</span>
            <button
              type="button"
              aria-label="通知を閉じる"
              onClick={() => onDismiss(t.id)}
              className="text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- Confirm Dialog ---

const ConfirmContext = createContext(null);

function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, description, resolve }

  const showConfirm = useCallback((title, description) => {
    return new Promise((resolve) => {
      setState({ title, description, resolve });
    });
  }, []);

  const handleClose = (result) => {
    if (state) {
      state.resolve(result);
      setState(null);
    }
  };

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      {state && (
        <ConfirmDialog
          title={state.title}
          description={state.description}
          onCancel={() => handleClose(false)}
          onConfirm={() => handleClose(true)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}

function ConfirmDialog({ title, description, onCancel, onConfirm }) {
  const titleId = useMemo(() => `confirm-title-${Math.random().toString(36).slice(2, 8)}`, []);
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="confirm-dialog"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    >
      <div
        className="bg-bg rounded-2xl max-w-md w-full p-7"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}
      >
        <h2 id={titleId} className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
          {title}
        </h2>
        {description && (
          <p className="mt-3 text-sm text-ink-soft whitespace-pre-line leading-relaxed">{description}</p>
        )}
        <div className="mt-7 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            data-testid="confirm-cancel-button"
            onClick={onCancel}
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper focus-visible:outline focus-visible:outline-2 ring-rust transition"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="confirm-ok-button"
            onClick={onConfirm}
            className="px-5 py-2 rounded-full bg-rust text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 ring-rust transition"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Spinner ---

function Spinner({ label = "読み込み中..." }) {
  return (
    <div
      className="flex items-center justify-center p-8"
      role="status"
      aria-live="polite"
      data-testid="spinner"
    >
      <div
        className="inline-block w-8 h-8 border-4 rounded-full animate-spin"
        style={{ borderColor: "var(--rust)", borderTopColor: "transparent" }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// --- Empty State ---

function EmptyState({ icon, title, description, action, testId }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-20 px-4"
      data-testid={testId || "empty-state"}
    >
      <div className="text-5xl mb-5 opacity-80" aria-hidden="true">{icon}</div>
      <h3 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600, letterSpacing: "0.04em" }}>
        {title}
      </h3>
      {description && (
        <p className="mt-3 text-sm text-ink-soft max-w-md leading-relaxed">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          data-testid={action.testId}
          className="mt-7 px-6 py-2.5 rounded-full bg-rust text-white text-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 ring-rust transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// --- Banners ---

function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const handleOnline  = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div
      data-testid="offline-banner"
      className="bg-paper text-wood-deep border-b border-rule px-4 py-2 text-sm"
      role="status"
    >
      <span className="font-serif-en text-xs uppercase mr-2 opacity-70">Offline</span>
      オフラインで動作中：変更は保存されますが、JSONエクスポートでのバックアップを推奨します。
    </div>
  );
}

function StorageUnavailableBanner({ mode }) {
  if (mode !== "none") return null;
  return (
    <div
      data-testid="storage-unavailable-banner"
      className="bg-rust text-white px-4 py-3 text-sm"
      role="alert"
    >
      <span className="font-serif-en text-xs uppercase mr-2 opacity-80">Storage Unavailable</span>
      データを保存できません。ブラウザの設定を確認してください。
      <span className="ml-2 opacity-90">
        操作は継続できますが、セッション終了でデータは失われます。
      </span>
    </div>
  );
}

// =====================================================================
// 4〜9. 各機能セクションは後続Sprintで実装
// =====================================================================

// ===== 4. 会社管理コンポーネント =====
// Sprint 1 で実装

// ===== 5. 仕様比較コンポーネント =====
// Sprint 2 で実装

// ===== 6. 打ち合わせコンポーネント =====
// Sprint 3 で実装

// ===== 7. 変更ログコンポーネント =====
// Sprint 4 で実装

// ===== 8. ダッシュボード =====
// Sprint 5 で実装

// ===== 9. 設定・Import/Export =====
// Sprint 6 で実装

// ===== 10. メインApp・ルーティング =====

function Header({ searchQuery, onSearchChange, onSettingsClick, saveDisabled }) {
  return (
    <header className="bg-bg border-b border-rule sticky top-0 z-30 no-print">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <h1 className="shrink-0 flex items-baseline gap-2">
          <span className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            注文住宅管理ツール
          </span>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest hidden sm:inline">
            House Journal
          </span>
        </h1>
        <div className="flex-1 max-w-xl hidden sm:block">
          <label htmlFor="global-search" className="sr-only">全体検索</label>
          <input
            id="global-search"
            type="search"
            data-testid="global-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="会社・打ち合わせ・仕様項目を検索（Sprint 5で有効化）"
            disabled={saveDisabled}
            className="w-full px-4 py-2 rounded-full border border-rule text-sm bg-bg placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 ring-rust disabled:bg-paper disabled:text-ink-soft/40"
          />
        </div>
        <button
          type="button"
          aria-label="設定"
          data-testid="settings-button"
          onClick={onSettingsClick}
          className="p-2 rounded-full hover:bg-paper text-ink-soft focus-visible:outline focus-visible:outline-2 ring-rust transition"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}

function TabNavigation({ currentTab, onTabChange }) {
  return (
    <nav
      className="hidden md:block bg-bg border-b border-rule no-print"
      aria-label="主要ナビゲーション"
    >
      <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={
                "px-5 py-4 text-sm border-b-2 transition whitespace-nowrap focus-visible:outline focus-visible:outline-2 ring-rust " +
                (active
                  ? "text-ink"
                  : "border-transparent text-ink-soft hover:text-ink")
              }
              style={{
                fontFamily: "var(--jp-serif)",
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.08em",
                borderBottomColor: active ? "var(--rust)" : "transparent",
              }}
            >
              <span className="mr-2" aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function BottomNavigation({ currentTab, onTabChange }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 bg-bg border-t border-rule z-40 no-print"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0)",
        boxShadow: "0 -2px 12px rgba(26,24,22,0.08)",
      }}
      aria-label="モバイルナビゲーション"
    >
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tab.label}
              data-testid={`bottom-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={
                "py-2.5 flex flex-col items-center text-[11px] gap-1 focus-visible:outline focus-visible:outline-2 ring-rust transition " +
                (active ? "text-rust" : "text-ink-soft hover:text-ink")
              }
              style={{
                fontFamily: "var(--jp-serif)",
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.06em",
              }}
            >
              <span className="text-lg" aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TabPlaceholder({ tabId }) {
  const placeholders = {
    dashboard: {
      icon: "🏠",
      title: "ダッシュボードは Sprint 5 で実装されます",
      description: "サマリーカード・未確定事項・直近の打ち合わせ／決定事項を表示する予定です。",
    },
    companies: {
      icon: "🏢",
      title: "会社管理は Sprint 1 で実装されます",
      description: "検討中の会社を登録・編集・論理削除できるようになります。",
    },
    "spec-comparison": {
      icon: "📋",
      title: "仕様比較は Sprint 2 で実装されます",
      description: "各社の仕様値をカテゴリ別に並べて比較できるようになります。",
    },
    meetings: {
      icon: "📅",
      title: "打ち合わせ記録は Sprint 3 で実装されます",
      description: "打ち合わせと決定事項を記録し、仕様反映フローへ繋ぎます。",
    },
    "change-logs": {
      icon: "📜",
      title: "変更ログは Sprint 4 で実装されます",
      description: "仕様値の変更履歴をタイムラインで確認できるようになります。",
    },
  };
  const p = placeholders[tabId] || placeholders.dashboard;
  return <EmptyState icon={p.icon} title={p.title} description={p.description} />;
}

// 参考デザイン: https://inumaru-kazuya.github.io/takomaruHP/
// 抽出した design token を CSS 変数として注入する
function GlobalStyles() {
  return (
    <style>{`
      :root {
        --bg:        #faf8f3;
        --paper:     #f0eadb;
        --rule:      #d8cfbe;
        --ink:       #1a1816;
        --ink-soft:  #4a4640;
        --wood:      #c69e6c;
        --wood-deep: #8a6740;
        --rust:      #b35a3a;
        --sage:      #5b6b4a;
        --sage-deep: #3d4a32;
        --sans:     "Noto Sans JP", system-ui, -apple-system, sans-serif;
        --serif:    "Cormorant Garamond", "Noto Serif JP", serif;
        --jp-serif: "Noto Serif JP", serif;
        --mono:     "JetBrains Mono", ui-monospace, monospace;
      }
      html, body { background: var(--bg); color: var(--ink); }
      body { font-family: var(--sans); letter-spacing: 0.02em; }
      h1, h2, h3, h4 { font-family: var(--jp-serif); letter-spacing: 0.04em; }
      .font-serif-en { font-family: var(--serif); letter-spacing: 0.12em; }
      .font-mono     { font-family: var(--mono); }
      .text-ink      { color: var(--ink); }
      .text-ink-soft { color: var(--ink-soft); }
      .text-rust     { color: var(--rust); }
      .text-wood-deep{ color: var(--wood-deep); }
      .text-sage     { color: var(--sage); }
      .bg-bg         { background-color: var(--bg); }
      .bg-paper      { background-color: var(--paper); }
      .bg-rust       { background-color: var(--rust); }
      .bg-wood       { background-color: var(--wood); }
      .bg-wood-deep  { background-color: var(--wood-deep); }
      .bg-sage       { background-color: var(--sage); }
      .bg-sage-deep  { background-color: var(--sage-deep); }
      .bg-ink        { background-color: var(--ink); }
      .border-rule   { border-color: var(--rule); }
      .ring-rust:focus-visible { outline-color: var(--rust); }
      @media print {
        header, nav, .no-print { display: none !important; }
        body { background: white; }
        table { page-break-inside: auto; }
        tr    { page-break-inside: avoid; page-break-after: auto; }
      }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in { animation: fade-in 150ms ease-out; }
    `}</style>
  );
}

function StorageBootstrapStatus({ phase }) {
  if (!phase) return null;
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <div
          className="inline-block w-10 h-10 border-4 rounded-full animate-spin mb-5"
          style={{ borderColor: "var(--rust)", borderTopColor: "transparent" }}
        />
        <p className="font-serif-en uppercase tracking-widest text-xs text-wood-deep mb-1">Initializing</p>
        <p className="text-sm text-ink-soft">{phase}</p>
      </div>
    </div>
  );
}

function AppInner() {
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [bootPhase, setBootPhase] = useState("ストレージを確認しています...");
  const [resolvedStorageMode, setResolvedStorageMode] = useState(null);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  // 起動シーケンス
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mode = await verifyStorageAPI();
        if (cancelled) return;
        storageMode = mode;
        setResolvedStorageMode(mode);

        if (mode === "none") {
          showToast("error", StorageError.STORAGE_UNAVAILABLE);
          setBootPhase(null);
          return;
        }

        setBootPhase("マイグレーションを確認しています...");
        const migrated = await runMigrations();
        if (cancelled) return;
        if (migrated) showToast("info", "データ形式を最新版に更新しました");

        setBootPhase("初期データを確認しています...");
        const seeded = await initializeDefaultTemplateIfEmpty();
        if (cancelled) return;
        if (seeded) showToast("success", "標準仕様テンプレートを読み込みました");

        setBootPhase(null);
      } catch (e) {
        console.error("初期化失敗:", e);
        if (!cancelled) {
          showToast("error", "初期化に失敗しました。ページを再読み込みしてください");
          setBootPhase(null);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSettingsClick = useCallback(async () => {
    const ok = await showConfirm(
      "Sprint 6 で実装予定の機能です",
      "設定画面（JSON Export/Import・印刷・アーカイブ・ストレージ使用量）は Sprint 6 で利用可能になります。\nダイアログを閉じますか？"
    );
    if (ok) showToast("info", "設定画面は Sprint 6 で実装されます");
  }, [showConfirm, showToast]);

  if (bootPhase) return <StorageBootstrapStatus phase={bootPhase} />;

  const saveDisabled = resolvedStorageMode === "none";

  return (
    <div className="min-h-screen bg-bg text-ink pb-20 md:pb-0">
      <GlobalStyles />
      <StorageUnavailableBanner mode={resolvedStorageMode} />
      <OfflineBanner />
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSettingsClick={handleSettingsClick}
        saveDisabled={saveDisabled}
      />
      <TabNavigation currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="max-w-7xl mx-auto px-4 py-6" data-testid="main-content">
        <TabPlaceholder tabId={currentTab} />

        {/* 開発用デバッグパネル（Sprint 0 のみ） */}
        <DevDebugPanel
          storageMode={resolvedStorageMode}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      </main>

      <BottomNavigation currentTab={currentTab} onTabChange={setCurrentTab} />
    </div>
  );
}

// Sprint 0 動作確認用デバッグパネル（Sprint 1 以降で削除予定）
function DevDebugPanel({ storageMode: mode, showToast, showConfirm }) {
  const [meta, setMeta] = useState(null);

  const refreshMeta = useCallback(async () => {
    setMeta(await loadMeta());
  }, []);

  useEffect(() => { refreshMeta(); }, [refreshMeta]);

  const handleTestToasts = () => {
    showToast("success", "保存しました");
    setTimeout(() => showToast("info", "情報メッセージ"), 200);
    setTimeout(() => showToast("warning", "容量警告メッセージ"), 400);
    setTimeout(() => showToast("error", "エラーメッセージ"), 600);
  };

  const handleTestConfirm = async () => {
    const ok = await showConfirm(
      "この操作を実行しますか？",
      "確認ダイアログのテストです。削除等の不可逆操作で使用します。"
    );
    showToast(ok ? "success" : "info", ok ? "確定されました" : "キャンセルされました");
  };

  const handleIncrementSave = async () => {
    await incrementSaveCount(showToast);
    await refreshMeta();
  };

  const handleSimulate50 = async () => {
    const m = await loadMeta();
    await saveMeta({ ...m, saveCount: 49 });
    await incrementSaveCount(showToast);
    await refreshMeta();
  };

  return (
    <section
      className="mt-12 p-5 border border-dashed border-rule rounded-2xl bg-paper/60"
      data-testid="dev-debug-panel"
    >
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-serif-en uppercase text-xs text-wood-deep">Sprint 0 Debug</span>
        <h2 className="text-sm text-ink-soft" style={{ fontFamily: "var(--jp-serif)", fontWeight: 500 }}>
          動作確認パネル（Sprint 1 以降で削除予定）
        </h2>
      </div>
      <dl className="text-xs text-ink-soft grid grid-cols-[140px_1fr] gap-y-1 mb-5">
        <dt className="font-serif-en uppercase tracking-wider opacity-70">APP_VERSION</dt>
        <dd className="font-mono text-ink">{APP_VERSION}</dd>
        <dt className="font-serif-en uppercase tracking-wider opacity-70">SCHEMA_VERSION</dt>
        <dd className="font-mono text-ink">{SCHEMA_VERSION}</dd>
        <dt className="font-serif-en uppercase tracking-wider opacity-70">storageMode</dt>
        <dd className="font-mono text-ink" data-testid="debug-storage-mode">{mode}</dd>
        <dt className="font-serif-en uppercase tracking-wider opacity-70">META.saveCount</dt>
        <dd className="font-mono text-ink" data-testid="debug-save-count">{meta?.saveCount ?? "-"}</dd>
        <dt className="font-serif-en uppercase tracking-wider opacity-70">META.schemaVersion</dt>
        <dd className="font-mono text-ink">{meta?.schemaVersion ?? "-"}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <DebugButton testId="debug-test-toasts" onClick={handleTestToasts}>
          Toast 4種テスト
        </DebugButton>
        <DebugButton testId="debug-test-confirm" onClick={handleTestConfirm}>
          確認ダイアログテスト
        </DebugButton>
        <DebugButton testId="debug-increment-save" onClick={handleIncrementSave} disabled={mode === "none"}>
          saveCount +1
        </DebugButton>
        <DebugButton testId="debug-simulate-50" onClick={handleSimulate50} disabled={mode === "none"}>
          saveCount=50 をシミュレート
        </DebugButton>
      </div>
    </section>
  );
}

function DebugButton({ children, onClick, disabled, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-1.5 text-xs rounded-full border border-rule bg-bg text-ink-soft hover:text-ink hover:border-wood-deep disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 ring-rust transition"
    >
      {children}
    </button>
  );
}

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppInner />
      </ConfirmProvider>
    </ToastProvider>
  );
}

// Artifact 環境では <App /> をルートにマウントする想定
export default App;
