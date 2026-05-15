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

// ステータスバッジの色マッピング (CLAUDE.md デザインガイドラインの「用途マッピング」に準拠)
// - 確定/契約済 → sage (green)
// - 検討中     → paper + wood-deep 文字 (subtle)
// - 候補       → wood (highlighted)
// - 落選       → ink-soft (muted)
const COMPANY_STATUS_BADGE = {
  considering: { bg: "bg-paper", text: "text-wood-deep", border: "border-rule" },
  candidate:   { bg: "bg-wood",      text: "text-white",      border: "border-transparent" },
  rejected:    { bg: "bg-bg",        text: "text-ink-soft",   border: "border-rule" },
  contracted:  { bg: "bg-sage",      text: "text-white",      border: "border-transparent" },
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
    name:          { required: true,  maxLength: 50 },
    contact:       { required: true,  maxLength: 30 },
    phone:         { required: false, maxLength: 15,  pattern: /^[\d\-\+\(\)\s]*$/ },
    email:         { required: false, maxLength: 100, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    note:          { required: false, maxLength: 500 },
    rejectionNote: { required: false, maxLength: 500 },
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

// app.jsx 内で利用するロジック (src/utils/validation.js / company.js のミラー)
// テストは src/utils/ 側の純粋関数で実施する。
// VALIDATION 定数は Section 1 (型定義・定数) に集約済み。

function validateCompanyInline(input) {
  const errors = {};
  const v = VALIDATION.Company;
  const name = String(input?.name ?? "");
  if (v.name.required && name.trim().length === 0) errors.name = "会社名は必須です";
  else if (name.length > v.name.maxLength) errors.name = `${v.name.maxLength}文字以内で入力してください`;
  const contact = String(input?.contact ?? "");
  if (v.contact.required && contact.trim().length === 0) errors.contact = "担当者は必須です";
  else if (contact.length > v.contact.maxLength) errors.contact = `${v.contact.maxLength}文字以内で入力してください`;
  if (input?.phone) {
    const phone = String(input.phone);
    if (phone.length > v.phone.maxLength) errors.phone = `${v.phone.maxLength}文字以内で入力してください`;
    else if (!v.phone.pattern.test(phone)) errors.phone = "電話番号の形式が不正です (数字・ハイフン・括弧のみ)";
  }
  if (input?.email) {
    const email = String(input.email);
    if (email.length > v.email.maxLength) errors.email = `${v.email.maxLength}文字以内で入力してください`;
    else if (!v.email.pattern.test(email)) errors.email = "メールアドレスの形式が不正です";
  }
  if (input?.note && String(input.note).length > v.note.maxLength) {
    errors.note = `${v.note.maxLength}文字以内で入力してください`;
  }
  if (input?.rejectionNote && String(input.rejectionNote).length > v.rejectionNote.maxLength) {
    errors.rejectionNote = `${v.rejectionNote.maxLength}文字以内で入力してください`;
  }
  return errors;
}

function isDuplicateCompanyNameInline(name, companies, excludeId = null) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (normalized.length === 0) return false;
  return companies.some(
    (c) => !c.deletedAt && c.id !== excludeId &&
      String(c.name ?? "").trim().toLowerCase() === normalized
  );
}

async function loadCompaniesFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.COMPANIES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCompaniesToStorage(companies, showToast) {
  await saveWithCapacityCheck(STORAGE_KEYS.COMPANIES, companies, showToast);
}

function createCompanyEntity(input) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    createdAt: now,
    name: String(input.name ?? "").trim(),
    type: input.type || "maker",
    contact: String(input.contact ?? "").trim(),
    phone: input.phone ? String(input.phone).trim() : undefined,
    email: input.email ? String(input.email).trim() : undefined,
    status: input.status || "considering",
    note: input.note ? String(input.note) : undefined,
    rejectionNote: input.rejectionNote ? String(input.rejectionNote) : undefined,
  };
}

function updateCompanyEntity(original, input) {
  return {
    ...original,
    name: String(input.name ?? "").trim(),
    type: input.type || original.type,
    contact: String(input.contact ?? "").trim(),
    phone: input.phone ? String(input.phone).trim() : undefined,
    email: input.email ? String(input.email).trim() : undefined,
    status: input.status || original.status,
    note: input.note ? String(input.note) : undefined,
    rejectionNote: input.rejectionNote ? String(input.rejectionNote) : undefined,
  };
}

// ---- ステータスバッジ ----

function StatusBadge({ status, testId }) {
  const style = COMPANY_STATUS_BADGE[status] || COMPANY_STATUS_BADGE.considering;
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] border ${style.bg} ${style.text} ${style.border}`}
      style={{ letterSpacing: "0.12em", fontWeight: 500 }}
    >
      {COMPANY_STATUS_LABEL[status] || status}
    </span>
  );
}

// ---- 残り文字数カウンター ----

function CharCounter({ current, max }) {
  const remaining = max - (current ?? 0);
  const tone = remaining < 0 ? "text-rust" : remaining < 10 ? "text-wood-deep" : "text-ink-soft";
  return (
    <span className={`text-[11px] font-mono ${tone}`}>
      残り {remaining}
    </span>
  );
}

// ---- インラインエラー ----

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" aria-live="polite" className="mt-1 text-xs text-rust">
      {message}
    </p>
  );
}

// ---- フィールド共通ラッパー ----

function Field({ label, htmlFor, error, hint, max, value, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-xs text-ink-soft" style={{ letterSpacing: "0.08em" }}>
          {label}
        </label>
        {max !== undefined && <CharCounter current={String(value ?? "").length} max={max} />}
      </div>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-ink-soft/70">{hint}</p>}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  );
}

// ---- 会社追加・編集モーダル ----

function CompanyFormModal({ existingCompanies, initial, onSubmit, onClose, saveDisabled }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    type: initial?.type ?? "maker",
    contact: initial?.contact ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    status: initial?.status ?? "considering",
    note: initial?.note ?? "",
    rejectionNote: initial?.rejectionNote ?? "",
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const titleId = useMemo(() => `company-form-title-${Math.random().toString(36).slice(2, 8)}`, []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const liveErrors = useMemo(() => validateCompanyInline(form), [form]);
  const visibleErrors = submitted ? liveErrors : errors;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validateCompanyInline(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit(form);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="company-form-modal"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-bg rounded-2xl max-w-xl w-full p-7 my-8"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}
      >
        <div className="flex items-baseline justify-between mb-5">
          <h2 id={titleId} className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            {isEdit ? "会社を編集" : "会社を追加"}
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Company</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="会社名 *" htmlFor="cf-name" error={visibleErrors.name} max={VALIDATION.Company.name.maxLength} value={form.name}>
            <input id="cf-name" type="text" data-testid="company-name-input" value={form.name} onChange={update("name")}
              maxLength={120}
              aria-invalid={Boolean(visibleErrors.name)} aria-describedby={visibleErrors.name ? "cf-name-error" : undefined}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>

          <Field label="種別" htmlFor="cf-type">
            <select id="cf-type" data-testid="company-type-select" value={form.type} onChange={update("type")}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
              {Object.entries(COMPANY_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="担当者 *" htmlFor="cf-contact" error={visibleErrors.contact} max={VALIDATION.Company.contact.maxLength} value={form.contact}>
            <input id="cf-contact" type="text" data-testid="company-contact-input" value={form.contact} onChange={update("contact")}
              maxLength={80}
              aria-invalid={Boolean(visibleErrors.contact)} aria-describedby={visibleErrors.contact ? "cf-contact-error" : undefined}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>

          <Field label="ステータス" htmlFor="cf-status">
            <select id="cf-status" data-testid="company-status-select" value={form.status} onChange={update("status")}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
              {Object.entries(COMPANY_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>

          <Field label="電話番号" htmlFor="cf-phone" error={visibleErrors.phone} hint="数字・ハイフン・括弧・+のみ" max={VALIDATION.Company.phone.maxLength} value={form.phone}>
            <input id="cf-phone" type="tel" data-testid="company-phone-input" value={form.phone} onChange={update("phone")}
              maxLength={30}
              aria-invalid={Boolean(visibleErrors.phone)} aria-describedby={visibleErrors.phone ? "cf-phone-error" : undefined}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm font-mono focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>

          <Field label="メール" htmlFor="cf-email" error={visibleErrors.email} max={VALIDATION.Company.email.maxLength} value={form.email}>
            <input id="cf-email" type="email" data-testid="company-email-input" value={form.email} onChange={update("email")}
              maxLength={200}
              aria-invalid={Boolean(visibleErrors.email)} aria-describedby={visibleErrors.email ? "cf-email-error" : undefined}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm font-mono focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>

          <div className="md:col-span-2">
            <Field label="メモ" htmlFor="cf-note" error={visibleErrors.note} max={VALIDATION.Company.note.maxLength} value={form.note}>
              <textarea id="cf-note" data-testid="company-note-input" value={form.note} onChange={update("note")}
                rows={3} maxLength={1000}
                aria-invalid={Boolean(visibleErrors.note)} aria-describedby={visibleErrors.note ? "cf-note-error" : undefined}
                className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
            </Field>
          </div>

          {form.status === "rejected" && (
            <div className="md:col-span-2">
              <Field label="断り連絡メモ" htmlFor="cf-rejection" error={visibleErrors.rejectionNote} max={VALIDATION.Company.rejectionNote.maxLength} value={form.rejectionNote}>
                <textarea id="cf-rejection" data-testid="company-rejection-note-input" value={form.rejectionNote} onChange={update("rejectionNote")}
                  rows={2} maxLength={1000}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
              </Field>
            </div>
          )}
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} data-testid="company-cancel-button"
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper focus-visible:outline focus-visible:outline-2 ring-rust transition">
            キャンセル
          </button>
          <button type="submit" data-testid="save-company-button" disabled={saveDisabled}
            className="px-6 py-2 rounded-full bg-rust text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 ring-rust transition">
            {isEdit ? "更新" : "登録"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- 会社カード ----

function CompanyCard({ company, meetingsCount, onEdit, onDelete, onClick }) {
  return (
    <article
      data-testid="company-card"
      className="bg-paper border border-rule rounded-2xl p-5 hover:border-wood-deep transition group cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base text-ink truncate" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            {company.name}
          </h3>
          <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mt-0.5">
            {COMPANY_TYPE_LABEL[company.type] || company.type}
          </p>
        </div>
        <StatusBadge status={company.status} testId={`company-card-status-${company.id}`} />
      </div>

      <dl className="text-sm text-ink-soft space-y-1">
        <div className="flex gap-2">
          <dt className="text-ink-soft/70 w-16 shrink-0">担当</dt>
          <dd className="text-ink truncate">{company.contact}</dd>
        </div>
        {company.phone && (
          <div className="flex gap-2">
            <dt className="text-ink-soft/70 w-16 shrink-0">電話</dt>
            <dd className="font-mono text-xs text-ink truncate">{company.phone}</dd>
          </div>
        )}
        {company.email && (
          <div className="flex gap-2">
            <dt className="text-ink-soft/70 w-16 shrink-0">メール</dt>
            <dd className="font-mono text-xs text-ink truncate">{company.email}</dd>
          </div>
        )}
      </dl>

      {company.note && (
        <p className="mt-3 text-xs text-ink-soft leading-relaxed line-clamp-2">{company.note}</p>
      )}
      {company.status === "rejected" && company.rejectionNote && (
        <p className="mt-3 text-xs text-ink-soft leading-relaxed border-l-2 border-rule pl-2">
          <span className="font-serif-en uppercase text-[10px] mr-1 opacity-70">Note</span>
          {company.rejectionNote}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-rule/60 pt-3">
        <span className="text-[11px] text-ink-soft">
          打ち合わせ <span className="font-mono text-ink">{meetingsCount ?? 0}</span> 件
        </span>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onEdit} data-testid={`edit-company-button-${company.id}`}
            className="text-xs px-3 py-1 rounded-full border border-rule text-ink-soft hover:text-ink hover:border-wood-deep focus-visible:outline focus-visible:outline-2 ring-rust transition">
            編集
          </button>
          <button type="button" onClick={onDelete} data-testid={`delete-company-button-${company.id}`}
            className="text-xs px-3 py-1 rounded-full border border-rule text-rust hover:bg-rust hover:text-white focus-visible:outline focus-visible:outline-2 ring-rust transition">
            削除
          </button>
        </div>
      </div>
    </article>
  );
}

// ---- 会社詳細ページ ----

function CompanyDetailPage({ company, onClose, onEdit }) {
  const [tab, setTab] = useState("info"); // info | meetings | specs
  if (!company) return null;

  return (
    <div
      className="fixed inset-0 z-30 bg-bg overflow-y-auto"
      data-testid="company-detail-page"
      role="dialog"
      aria-modal="true"
      aria-label={`${company.name}の詳細`}
    >
      <header className="sticky top-0 bg-bg border-b border-rule z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button type="button" onClick={onClose} data-testid="company-detail-close"
            className="text-sm text-ink-soft hover:text-ink flex items-center gap-1 focus-visible:outline focus-visible:outline-2 ring-rust rounded">
            <span>←</span> 会社一覧
          </button>
          <button type="button" onClick={onEdit} data-testid="company-detail-edit"
            className="px-4 py-1.5 rounded-full text-xs bg-rust text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 ring-rust transition">
            編集
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-baseline gap-3 mb-2">
          <h1 className="text-2xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 700 }}>
            {company.name}
          </h1>
          <span className="font-serif-en text-xs uppercase tracking-widest text-wood-deep">
            {COMPANY_TYPE_LABEL[company.type] || company.type}
          </span>
        </div>
        <div className="mb-6"><StatusBadge status={company.status} /></div>

        <nav className="border-b border-rule mb-6" role="tablist" aria-label="詳細タブ">
          {[
            { id: "info",     label: "基本情報" },
            { id: "meetings", label: "打ち合わせ" },
            { id: "specs",    label: "仕様値" },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={active}
                data-testid={`company-detail-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={"px-5 py-3 text-sm border-b-2 mr-1 transition focus-visible:outline focus-visible:outline-2 ring-rust " +
                  (active ? "text-ink" : "border-transparent text-ink-soft hover:text-ink")}
                style={{
                  fontFamily: "var(--jp-serif)",
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.08em",
                  borderBottomColor: active ? "var(--rust)" : "transparent",
                }}>
                {t.label}
              </button>
            );
          })}
        </nav>

        {tab === "info" && (
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <DetailRow label="担当者">{company.contact}</DetailRow>
            <DetailRow label="電話番号">{company.phone || "—"}</DetailRow>
            <DetailRow label="メール">{company.email || "—"}</DetailRow>
            <DetailRow label="登録日">{(company.createdAt || "").slice(0, 10)}</DetailRow>
            {company.note && (
              <div className="md:col-span-2">
                <DetailRow label="メモ" wrap>
                  <p className="whitespace-pre-line leading-relaxed">{company.note}</p>
                </DetailRow>
              </div>
            )}
            {company.status === "rejected" && company.rejectionNote && (
              <div className="md:col-span-2">
                <DetailRow label="断り連絡メモ" wrap>
                  <p className="whitespace-pre-line leading-relaxed">{company.rejectionNote}</p>
                </DetailRow>
              </div>
            )}
          </dl>
        )}
        {tab === "meetings" && (
          <EmptyState icon="📅" title="打ち合わせは Sprint 3 で表示されます"
            description="この会社との打ち合わせ一覧を summary 先頭100文字省略で表示する予定です。" />
        )}
        {tab === "specs" && (
          <EmptyState icon="📋" title="仕様値は Sprint 2 で表示されます"
            description="この会社の仕様値を一覧表示する予定です。" />
        )}
      </main>
    </div>
  );
}

function DetailRow({ label, children, wrap }) {
  return (
    <div className={wrap ? "flex flex-col gap-1" : "flex gap-3 items-baseline"}>
      <dt className="text-xs text-ink-soft shrink-0" style={{ letterSpacing: "0.08em" }}>{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

// ---- 会社一覧ビュー (タブのコンテンツ) ----

const STATUS_FILTERS = [
  { id: "all",          label: "すべて" },
  { id: "considering",  label: "検討中" },
  { id: "candidate",    label: "候補" },
  { id: "contracted",   label: "契約済" },
  { id: "rejected",     label: "落選" },
];

function CompaniesView({ saveDisabled }) {
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [companies, setCompanies] = useState(null); // null = loading
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailCompany, setDetailCompany] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showContracted, setShowContracted] = useState(false);

  const reload = useCallback(async () => {
    const list = await loadCompaniesFromStorage();
    setCompanies(list);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = () => { setEditing(null); setShowForm(true); };
  const handleEdit = (company) => { setEditing(company); setShowForm(true); };

  const handleSubmit = async (form) => {
    const all = companies || [];
    const duplicate = isDuplicateCompanyNameInline(form.name, all, editing?.id);
    if (duplicate) {
      showToast("warning", "同じ名前の会社が既に登録されています");
      // E11: 登録はブロックしない
    }
    try {
      const next = editing
        ? all.map((c) => c.id === editing.id ? updateCompanyEntity(editing, form) : c)
        : [...all, createCompanyEntity(form)];
      await saveCompaniesToStorage(next, showToast);
      await reload();
      setShowForm(false);
      setEditing(null);
      showToast("success", editing ? "会社情報を更新しました" : "会社を登録しました");
    } catch (e) {
      console.error(e);
      // saveWithCapacityCheck 側で error Toast は出ている
    }
  };

  const handleDelete = async (company) => {
    const ok = await showConfirm(
      `「${company.name}」を削除しますか？`,
      "論理削除されます。関連する打ち合わせ・変更ログは保持され、設定画面のアーカイブで参照できます。"
    );
    if (!ok) return;
    try {
      const next = (companies || []).map((c) =>
        c.id === company.id ? { ...c, deletedAt: new Date().toISOString() } : c
      );
      await saveCompaniesToStorage(next, showToast);
      await reload();
      showToast("success", "会社を削除しました");
    } catch (e) {
      console.error(e);
    }
  };

  if (companies === null) return <Spinner label="会社を読み込み中..." />;

  const active = companies.filter((c) => !c.deletedAt);
  const filtered = statusFilter === "all" ? active : active.filter((c) => c.status === statusFilter);
  const others = filtered.filter((c) => c.status !== "contracted");
  const contracted = filtered.filter((c) => c.status === "contracted");

  return (
    <div data-testid="companies-view">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            会社管理
          </h2>
          <p className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mt-1">
            Companies / {active.length} active
          </p>
        </div>
        <button type="button" onClick={handleAdd} data-testid="add-company-button" disabled={saveDisabled}
          className="px-5 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 ring-rust transition">
          + 会社を追加
        </button>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="ステータスフィルター">
          {STATUS_FILTERS.map((f) => {
            const sel = statusFilter === f.id;
            const count = f.id === "all"
              ? active.length
              : active.filter((c) => c.status === f.id).length;
            return (
              <button key={f.id} type="button" role="tab" aria-selected={sel}
                data-testid={`company-filter-${f.id}`}
                onClick={() => setStatusFilter(f.id)}
                className={"px-4 py-1.5 rounded-full text-xs border transition focus-visible:outline focus-visible:outline-2 ring-rust " +
                  (sel
                    ? "bg-ink text-bg border-ink"
                    : "bg-bg text-ink-soft border-rule hover:text-ink hover:border-wood-deep")}
                style={{ letterSpacing: "0.08em" }}>
                {f.label} <span className="font-mono ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {active.length === 0 && (
        <EmptyState
          icon="🏢"
          title="検討中の会社を登録してください"
          description="ハウスメーカー・工務店を登録して、打ち合わせと仕様比較を始めましょう。"
          action={{ label: "+ 会社を追加", onClick: handleAdd, testId: "empty-add-company-button" }}
          testId="companies-empty-state"
        />
      )}

      {others.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {others.map((c) => (
            <CompanyCard key={c.id} company={c}
              meetingsCount={0}
              onClick={() => setDetailCompany(c)}
              onEdit={() => handleEdit(c)}
              onDelete={() => handleDelete(c)} />
          ))}
        </div>
      )}

      {contracted.length > 0 && (
        <section className="mt-8">
          <button type="button"
            onClick={() => setShowContracted((v) => !v)}
            data-testid="toggle-contracted-companies"
            className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink mb-4 focus-visible:outline focus-visible:outline-2 ring-rust rounded">
            <span className="font-serif-en uppercase tracking-widest text-[11px] text-wood-deep">Contracted</span>
            <span style={{ fontFamily: "var(--jp-serif)" }}>契約済 ({contracted.length})</span>
            <span aria-hidden="true">{showContracted ? "▼" : "▶"}</span>
          </button>
          {showContracted && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {contracted.map((c) => (
                <CompanyCard key={c.id} company={c}
                  meetingsCount={0}
                  onClick={() => setDetailCompany(c)}
                  onEdit={() => handleEdit(c)}
                  onDelete={() => handleDelete(c)} />
              ))}
            </div>
          )}
        </section>
      )}

      {showForm && (
        <CompanyFormModal
          existingCompanies={companies}
          initial={editing}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditing(null); }}
          saveDisabled={saveDisabled}
        />
      )}

      {detailCompany && (
        <CompanyDetailPage
          company={detailCompany}
          onClose={() => setDetailCompany(null)}
          onEdit={() => {
            const c = detailCompany;
            setDetailCompany(null);
            setEditing(c);
            setShowForm(true);
          }}
        />
      )}
    </div>
  );
}

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
        {currentTab === "companies"
          ? <CompaniesView saveDisabled={saveDisabled} />
          : <TabPlaceholder tabId={currentTab} />}

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
