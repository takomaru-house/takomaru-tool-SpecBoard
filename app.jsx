// =============================================================================
// 住宅会社仕様比較ツール - app.jsx
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

export function ToastProvider({ children }) {
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

export function ConfirmProvider({ children }) {
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

export function StatusBadge({ status, testId }) {
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

export function CompanyFormModal({ existingCompanies, initial, onSubmit, onClose, saveDisabled }) {
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

  // ESC キーでモーダルを閉じる (document レベルでリッスンしてフォーカス位置に依存しない)
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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
        noValidate
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

export function CompanyCard({ company, meetingsCount, onEdit, onDelete, onClick }) {
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

export function CompanyDetailPage({ company, onClose, onEdit }) {
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

export function CompaniesView({ saveDisabled }) {
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
                    ? "bg-rust text-white border-rust"
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

// ---- Sprint 2 内部ユーティリティ (src/utils/category.js / specItem.js / specItemNote.js / changeLog.js のミラー) ----

function normalizeCategoryNameInline(name) {
  return String(name ?? "").trim().toLowerCase();
}

function isDuplicateCategoryNameInline(name, categories, excludeId = null) {
  const normalized = normalizeCategoryNameInline(name);
  if (normalized.length === 0) return false;
  return categories.some(
    (c) => !c.deletedAt && c.id !== excludeId && c.normalizedName === normalized
  );
}

function validateCategoryInline(input, existing = [], excludeId = null) {
  const errors = {};
  const name = String(input?.name ?? "");
  const trimmed = name.trim();
  if (trimmed.length === 0) return { name: "カテゴリ名は必須です" };
  if (name.length > 30) return { name: "30文字以内で入力してください" };
  if (isDuplicateCategoryNameInline(name, existing, excludeId)) {
    return { name: "同じ名前のカテゴリが既に存在します" };
  }
  return errors;
}

function validateSpecItemInline(input) {
  const errors = {};
  const name = String(input?.name ?? "");
  if (name.trim().length === 0) errors.name = "項目名は必須です";
  else if (name.length > 50) errors.name = "50文字以内で入力してください";
  if (!input?.categoryId) errors.categoryId = "カテゴリを選択してください";
  return errors;
}

function validateSpecValueInline(value) {
  if (value !== undefined && value !== null && String(value).length > 200) {
    return { value: "200文字以内で入力してください" };
  }
  return {};
}

function validateSpecItemNoteInline(input) {
  const note = String(input?.note ?? "");
  if (note.trim().length === 0) return { note: "メモは必須です" };
  if (note.length > 200) return { note: "200文字以内で入力してください" };
  return {};
}

function moveSpecItemInline(items, id, direction) {
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  const sibling = items
    .filter((i) => i.categoryId === target.categoryId && !i.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const idx = sibling.findIndex((i) => i.id === id);
  if (idx === -1) return items;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sibling.length) return items;
  const a = sibling[idx];
  const b = sibling[swapIdx];
  return items.map((item) => {
    if (item.id === a.id) return { ...item, sortOrder: b.sortOrder ?? 0 };
    if (item.id === b.id) return { ...item, sortOrder: a.sortOrder ?? 0 };
    return item;
  });
}

function specItemsByCategoryInline(items, categoryId) {
  return items
    .filter((i) => i.categoryId === categoryId && !i.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function nextSortOrderForCategoryInline(items, categoryId) {
  const sibling = items.filter((i) => i.categoryId === categoryId);
  if (sibling.length === 0) return 0;
  return Math.max(...sibling.map((i) => i.sortOrder ?? 0)) + 1;
}

function findNoteInline(notes, specItemId, companyId) {
  return notes.find((n) => n.specItemId === specItemId && n.companyId === companyId);
}

function buildChangeLogInline({ specItemId, companyId, previousValue, newValue, meetingId, reason }) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    specItemId,
    companyId,
    previousValue: String(previousValue ?? ""),
    newValue: String(newValue ?? ""),
    meetingId: meetingId || undefined,
    reason: reason || undefined,
    changedAt: now,
    createdAt: now,
  };
}

// ---- ストレージ I/O ----

async function loadCategoriesFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.CATEGORIES);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function loadSpecItemsFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.SPEC_ITEMS);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function loadSpecItemNotesFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.SPEC_ITEM_NOTES);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function loadChangeLogsFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.CHANGE_LOGS);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ---- カテゴリ管理モーダル ----

export function CategoryManager({ categories, onClose, onSave, onDelete, saveDisabled }) {
  const showConfirm = useConfirm();
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);

  // ESC で閉じる
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = validateCategoryInline({ name }, categories, editingId);
    if (errors.name) { setError(errors.name); return; }
    onSave({ id: editingId, name });
    setName(""); setError(null); setEditingId(null);
  };

  const handleEdit = (cat) => { setEditingId(cat.id); setName(cat.name); setError(null); };
  const handleDelete = async (cat) => {
    const ok = await showConfirm(
      `カテゴリ「${cat.name}」を削除しますか？`,
      "論理削除されます。所属する仕様項目はそのまま残ります (アーカイブで確認可)。"
    );
    if (ok) onDelete(cat.id);
  };

  const active = categories.filter((c) => !c.deletedAt).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" aria-labelledby="cat-manager-title"
      data-testid="category-manager-modal"
    >
      <div
        className="bg-bg rounded-2xl max-w-lg w-full p-7 my-8"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}
      >
        <div className="flex items-baseline justify-between mb-5">
          <h2 id="cat-manager-title" className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            カテゴリ管理
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Categories</span>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mb-6">
          <label htmlFor="cat-name-input" className="text-xs text-ink-soft" style={{ letterSpacing: "0.08em" }}>
            {editingId ? "カテゴリ名を編集" : "新規カテゴリ名"}
          </label>
          <div className="flex gap-2 mt-1">
            <input
              id="cat-name-input"
              type="text"
              data-testid="category-name-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              maxLength={60}
              className="flex-1 px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust"
            />
            <button type="submit" data-testid="save-category-button" disabled={saveDisabled}
              className="px-5 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
              {editingId ? "更新" : "追加"}
            </button>
            {editingId && (
              <button type="button"
                onClick={() => { setEditingId(null); setName(""); setError(null); }}
                className="px-3 py-2 rounded-full border border-rule text-xs text-ink-soft hover:text-ink">
                取消
              </button>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-rust">{error}</p>}
        </form>

        <ul className="divide-y divide-rule" data-testid="category-list">
          {active.map((c) => (
            <li key={c.id} className="py-2 flex items-center justify-between gap-3" data-testid={`category-row-${c.id}`}>
              <span className="text-sm text-ink">{c.name}</span>
              <div className="flex gap-1">
                <button type="button"
                  data-testid={`category-edit-${c.id}`}
                  onClick={() => handleEdit(c)}
                  className="text-xs px-3 py-1 rounded-full border border-rule text-ink-soft hover:text-ink">
                  編集
                </button>
                <button type="button"
                  data-testid={`category-delete-${c.id}`}
                  onClick={() => handleDelete(c)}
                  className="text-xs px-3 py-1 rounded-full border border-rule text-rust hover:bg-rust hover:text-white">
                  削除
                </button>
              </div>
            </li>
          ))}
          {active.length === 0 && (
            <li className="py-4 text-sm text-ink-soft text-center">カテゴリがありません</li>
          )}
        </ul>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} data-testid="category-manager-close"
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 仕様項目追加モーダル ----

export function ItemAddModal({ categories, onSubmit, onClose, saveDisabled }) {
  const NEW_CATEGORY = "__new_category__";
  const [form, setForm] = useState({ name: "", categoryId: categories[0]?.id || NEW_CATEGORY, newCategoryName: "" });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const itemErrors = validateSpecItemInline({ name: form.name, categoryId: form.categoryId || "x" });
    let categoryError = null;
    if (form.categoryId === NEW_CATEGORY) {
      const catErrors = validateCategoryInline({ name: form.newCategoryName }, categories);
      if (catErrors.name) categoryError = catErrors.name;
    }
    const combined = { ...itemErrors };
    if (categoryError) combined.newCategoryName = categoryError;
    delete combined.categoryId; // category は別フィールドで判定
    if (form.categoryId === NEW_CATEGORY && !form.newCategoryName.trim()) {
      combined.newCategoryName = "カテゴリ名は必須です";
    }
    setErrors(combined);
    if (Object.keys(combined).length > 0) return;

    onSubmit({
      name: form.name,
      categoryId: form.categoryId === NEW_CATEGORY ? null : form.categoryId,
      newCategoryName: form.categoryId === NEW_CATEGORY ? form.newCategoryName : null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" aria-labelledby="item-add-title"
      data-testid="item-add-modal"
    >
      <form onSubmit={handleSubmit} noValidate
        className="bg-bg rounded-2xl max-w-lg w-full p-7 my-8"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}>
        <div className="flex items-baseline justify-between mb-5">
          <h2 id="item-add-title" className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            仕様項目を追加
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Spec Item</span>
        </div>

        <Field label="項目名 *" htmlFor="si-name" error={errors.name} max={50} value={form.name}>
          <input id="si-name" type="text" data-testid="spec-item-name-input"
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={120}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
        </Field>

        <div className="mt-4">
          <label htmlFor="si-cat" className="text-xs text-ink-soft" style={{ letterSpacing: "0.08em" }}>カテゴリ *</label>
          <select id="si-cat" data-testid="spec-item-category-select"
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
            {categories.filter((c) => !c.deletedAt).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_CATEGORY}>+ 新規カテゴリを作成</option>
          </select>
        </div>

        {form.categoryId === NEW_CATEGORY && (
          <div className="mt-4">
            <Field label="新規カテゴリ名 *" htmlFor="si-newcat" error={errors.newCategoryName} max={30} value={form.newCategoryName}>
              <input id="si-newcat" type="text" data-testid="new-category-name-input"
                value={form.newCategoryName}
                onChange={(e) => setForm((f) => ({ ...f, newCategoryName: e.target.value }))}
                maxLength={60}
                className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
            </Field>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} data-testid="item-add-cancel"
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper">
            キャンセル
          </button>
          <button type="submit" data-testid="save-spec-item-button" disabled={saveDisabled}
            className="px-6 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            追加
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- 仕様項目編集モーダル (名称のみ) ----

function SpecItemEditModal({ specItem, onSubmit, onClose, saveDisabled }) {
  const [name, setName] = useState(specItem.name);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = validateSpecItemInline({ name, categoryId: specItem.categoryId });
    if (errors.name) { setError(errors.name); return; }
    onSubmit({ ...specItem, name });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" data-testid="spec-item-edit-modal">
      <form onSubmit={handleSubmit} noValidate
        className="bg-bg rounded-2xl max-w-md w-full p-6"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}>
        <h2 className="text-lg text-ink mb-4" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
          仕様項目を編集
        </h2>
        <Field label="項目名" htmlFor="sie-name" error={error} max={50} value={name}>
          <input id="sie-name" type="text" data-testid="spec-item-edit-name-input"
            value={name} onChange={(e) => { setName(e.target.value); setError(null); }}
            maxLength={120}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
        </Field>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper">キャンセル</button>
          <button type="submit" data-testid="save-spec-item-edit-button" disabled={saveDisabled}
            className="px-6 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40">更新</button>
        </div>
      </form>
    </div>
  );
}

// ---- 仕様値セル編集モーダル ----

export function SpecCellEditor({ specItem, company, currentValue, onSubmit, onClose, saveDisabled }) {
  const [value, setValue] = useState(currentValue?.value ?? "");
  const [reason, setReason] = useState("");
  const [meetingId, setMeetingId] = useState(currentValue?.meetingId ?? "");
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = validateSpecValueInline(value);
    if (errors.value) { setError(errors.value); return; }
    onSubmit({ value: value.trim(), reason: reason.trim() || undefined, meetingId: meetingId || undefined });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" aria-labelledby="cell-editor-title"
      data-testid="spec-cell-editor-modal">
      <form onSubmit={handleSubmit} noValidate
        className="bg-bg rounded-2xl max-w-lg w-full p-7 my-8"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}>
        <div className="flex items-baseline justify-between mb-4">
          <h2 id="cell-editor-title" className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            {company.name} / {specItem.name}
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Spec Value</span>
        </div>

        <Field label="現在の値" htmlFor="sce-value" error={error} max={200} value={value}>
          <textarea id="sce-value" data-testid="spec-cell-value-input"
            value={value} onChange={(e) => { setValue(e.target.value); setError(null); }}
            rows={3} maxLength={400}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
        </Field>

        <Field label="変更理由 (ChangeLog に記録)" htmlFor="sce-reason" max={500} value={reason}>
          <input id="sce-reason" type="text" data-testid="spec-cell-reason-input"
            value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
        </Field>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} data-testid="spec-cell-cancel-button"
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper">キャンセル</button>
          <button type="submit" data-testid="save-spec-cell-button" disabled={saveDisabled}
            className="px-6 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40">保存</button>
        </div>
      </form>
    </div>
  );
}

// ---- 仕様項目メモポップオーバー ----

export function SpecItemNotePopover({ specItem, company, existingNote, onSubmit, onDelete, onClose, saveDisabled }) {
  const showConfirm = useConfirm();
  const [note, setNote] = useState(existingNote?.note ?? "");
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const errors = validateSpecItemNoteInline({ note, specItemId: specItem.id, companyId: company.id });
    if (errors.note) { setError(errors.note); return; }
    onSubmit({ note });
  };

  const handleDelete = async () => {
    const ok = await showConfirm(
      "評価メモを削除しますか？",
      "物理削除されます。再追加は可能です。"
    );
    if (ok) onDelete();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" data-testid="spec-item-note-popover">
      <form onSubmit={handleSubmit} noValidate
        className="bg-bg rounded-2xl max-w-md w-full p-6"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            評価メモ 📝
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Note</span>
        </div>
        <p className="text-xs text-ink-soft mb-3">{company.name} / {specItem.name}</p>
        <Field label="メモ" htmlFor="sin-note" error={error} max={200} value={note}>
          <textarea id="sin-note" data-testid="spec-item-note-input"
            value={note} onChange={(e) => { setNote(e.target.value); setError(null); }}
            rows={3} maxLength={400}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
        </Field>
        <div className="mt-5 flex justify-between gap-3">
          {existingNote && (
            <button type="button" data-testid="delete-spec-note-button"
              onClick={handleDelete}
              className="px-4 py-1.5 rounded-full border border-rule text-rust text-xs hover:bg-rust hover:text-white">
              削除
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button type="button" onClick={onClose}
              className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper">キャンセル</button>
            <button type="submit" data-testid="save-spec-note-button" disabled={saveDisabled}
              className="px-6 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40">保存</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ---- 仕様セル (テーブルの1セル) ----

// E5: 長い仕様値は max-height で省略表示し、「全文を見る」で展開する
const SPEC_VALUE_TRUNCATE_THRESHOLD = 80;

function SpecCell({ specItem, company, value, note, onEdit, onNote }) {
  const [expanded, setExpanded] = useState(false);
  const rawValue = value?.value ?? "";
  const hasValue = String(rawValue).length > 0;
  const isLong = String(rawValue).length > SPEC_VALUE_TRUNCATE_THRESHOLD;

  return (
    <td className="border border-rule align-top p-2 min-w-[180px]" data-testid={`spec-cell-${specItem.id}-${company.id}`}>
      <div className="flex flex-col gap-1">
        {hasValue ? (
          <>
            <div
              className="text-sm text-ink leading-relaxed whitespace-pre-line break-words overflow-hidden"
              data-testid={`spec-cell-value-${specItem.id}-${company.id}`}
              style={isLong && !expanded ? { maxHeight: "5.6em" } : undefined}
            >
              {rawValue}
            </div>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                data-testid={`spec-cell-expand-${specItem.id}-${company.id}`}
                className="self-start text-[11px] text-rust hover:underline no-print"
                aria-expanded={expanded}
              >
                {expanded ? "▲ 折りたたむ" : "▼ 全文を見る"}
              </button>
            )}
          </>
        ) : (
          <div className="text-sm text-ink-soft/60">—</div>
        )}
        <div className="flex items-center justify-end gap-1 no-print">
          {note && (
            <span className="text-[10px] font-mono text-wood-deep" title="メモあり" aria-label="メモあり">📝</span>
          )}
          <button type="button"
            data-testid={`spec-cell-note-button-${specItem.id}-${company.id}`}
            onClick={onNote}
            className="text-[11px] px-2 py-0.5 rounded-full border border-rule text-ink-soft hover:text-ink"
            aria-label={`${company.name}の${specItem.name}の評価メモ`}>
            📝
          </button>
          <button type="button"
            data-testid={`spec-cell-edit-button-${specItem.id}-${company.id}`}
            onClick={onEdit}
            className="text-[11px] px-2 py-0.5 rounded-full border border-rule text-ink-soft hover:text-ink"
            aria-label={`${company.name}の${specItem.name}を編集`}>
            {hasValue ? "編集" : "+ 入力"}
          </button>
        </div>
      </div>
    </td>
  );
}

// ---- 仕様行 ----

function SpecRow({ specItem, companies, notesByCompany, onCellEdit, onNoteEdit, onItemEdit, onItemDelete, onMoveUp, onMoveDown, saveDisabled, isFirst, isLast }) {
  return (
    <tr data-testid={`spec-row-${specItem.id}`}>
      <th className="border border-rule bg-paper text-left align-top p-2 min-w-[180px] sticky left-0" scope="row">
        <div className="flex items-start gap-1">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink truncate" data-testid={`spec-item-name-${specItem.id}`}>{specItem.name}</div>
          </div>
          <div className="flex flex-col gap-0.5 no-print">
            <button type="button" data-testid={`spec-item-move-up-${specItem.id}`}
              onClick={onMoveUp} disabled={isFirst || saveDisabled}
              aria-label="上に移動"
              className="text-[10px] w-5 h-5 flex items-center justify-center rounded border border-rule text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed">
              ▲
            </button>
            <button type="button" data-testid={`spec-item-move-down-${specItem.id}`}
              onClick={onMoveDown} disabled={isLast || saveDisabled}
              aria-label="下に移動"
              className="text-[10px] w-5 h-5 flex items-center justify-center rounded border border-rule text-ink-soft hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed">
              ▼
            </button>
          </div>
        </div>
        <div className="flex gap-1 mt-1 no-print">
          <button type="button" data-testid={`spec-item-edit-${specItem.id}`}
            onClick={onItemEdit} disabled={saveDisabled}
            className="text-[10px] px-2 py-0.5 rounded-full border border-rule text-ink-soft hover:text-ink disabled:opacity-30">
            編集
          </button>
          <button type="button" data-testid={`spec-item-delete-${specItem.id}`}
            onClick={onItemDelete} disabled={saveDisabled}
            className="text-[10px] px-2 py-0.5 rounded-full border border-rule text-rust hover:bg-rust hover:text-white disabled:opacity-30">
            削除
          </button>
        </div>
      </th>
      {companies.map((co) => {
        const v = (specItem.values || []).find((sv) => sv.companyId === co.id);
        const note = notesByCompany[co.id];
        return (
          <SpecCell
            key={co.id}
            specItem={specItem}
            company={co}
            value={v}
            note={note}
            onEdit={() => onCellEdit(co)}
            onNote={() => onNoteEdit(co)}
          />
        );
      })}
    </tr>
  );
}

// ---- 仕様比較ビュー (メイン) ----

export function SpecComparisonView({ saveDisabled }) {
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [companies, setCompanies] = useState(null);
  const [categories, setCategories] = useState(null);
  const [specItems, setSpecItems] = useState(null);
  const [notes, setNotes] = useState([]);

  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showItemAdd, setShowItemAdd] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // SpecItem editing
  const [editingCell, setEditingCell] = useState(null); // { specItem, company }
  const [editingNote, setEditingNote] = useState(null); // { specItem, company }
  const [hiddenCompanies, setHiddenCompanies] = useState(() => new Set());
  const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);
  const [foldedCategories, setFoldedCategories] = useState(() => new Set());

  const reload = useCallback(async () => {
    const cos = (await loadCompaniesFromStorage()).filter((c) => !c.deletedAt);
    const cats = await loadCategoriesFromStorage();
    const items = await loadSpecItemsFromStorage();
    const ns = await loadSpecItemNotesFromStorage();
    setCompanies(cos);
    setCategories(cats);
    setSpecItems(items);
    setNotes(ns);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (!companies || !categories || !specItems) return <Spinner label="仕様データを読み込み中..." />;

  // ---- 会社0件 → Empty State (E1) ----
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="🏢"
        title="比較する会社を先に登録してください"
        description="会社管理タブから1社以上を登録すると仕様比較ができます。"
        testId="spec-empty-state-no-companies"
      />
    );
  }

  const visibleCompanies = companies.filter((c) => !hiddenCompanies.has(c.id));
  const activeCategories = categories
    .filter((c) => !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const activeItems = specItems.filter((i) => !i.deletedAt);

  // ---- 項目0件 → Empty State (E10 相当) ----
  if (activeCategories.length === 0 && activeItems.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="仕様項目がありません"
        description="標準テンプレートが投入されていない可能性があります。仕様項目を追加するか、設定画面でテンプレートを再投入してください。"
        action={{
          label: "+ 仕様項目を追加",
          onClick: () => setShowItemAdd(true),
          testId: "spec-empty-add-item-button",
        }}
        testId="spec-empty-state-no-items"
      />
    );
  }

  const toggleCompany = (id) => {
    setHiddenCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategoryFold = (id) => {
    setFoldedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isRowAllEmpty = (item) => {
    return visibleCompanies.every((co) => {
      const v = (item.values || []).find((sv) => sv.companyId === co.id);
      return !v || !v.value || String(v.value).length === 0;
    });
  };

  // ---- カテゴリ管理 ----
  const handleSaveCategory = async ({ id, name }) => {
    try {
      let next;
      if (id) {
        next = categories.map((c) =>
          c.id === id ? { ...c, name: name.trim(), normalizedName: normalizeCategoryNameInline(name) } : c
        );
      } else {
        const sortOrder = Math.max(0, ...categories.map((c) => c.sortOrder ?? 0)) + 1;
        next = [...categories, {
          id: newId(),
          createdAt: new Date().toISOString(),
          name: name.trim(),
          normalizedName: normalizeCategoryNameInline(name),
          sortOrder,
          isDefault: false,
        }];
      }
      await saveWithCapacityCheck(STORAGE_KEYS.CATEGORIES, next, showToast);
      setCategories(next);
      showToast("success", id ? "カテゴリを更新しました" : "カテゴリを追加しました");
    } catch (e) { console.error(e); }
  };

  const handleDeleteCategory = async (id) => {
    try {
      const next = categories.map((c) =>
        c.id === id ? { ...c, deletedAt: new Date().toISOString() } : c
      );
      await saveWithCapacityCheck(STORAGE_KEYS.CATEGORIES, next, showToast);
      setCategories(next);
      showToast("success", "カテゴリを削除しました");
    } catch (e) { console.error(e); }
  };

  // ---- 仕様項目追加 ----
  const handleAddItem = async ({ name, categoryId, newCategoryName }) => {
    try {
      let cats = categories;
      let useCategoryId = categoryId;
      if (newCategoryName) {
        const sortOrder = Math.max(0, ...cats.map((c) => c.sortOrder ?? 0)) + 1;
        const newCat = {
          id: newId(),
          createdAt: new Date().toISOString(),
          name: newCategoryName.trim(),
          normalizedName: normalizeCategoryNameInline(newCategoryName),
          sortOrder,
          isDefault: false,
        };
        cats = [...cats, newCat];
        useCategoryId = newCat.id;
        await saveWithCapacityCheck(STORAGE_KEYS.CATEGORIES, cats, showToast);
        setCategories(cats);
      }
      const sortOrder = nextSortOrderForCategoryInline(specItems, useCategoryId);
      const newItem = {
        id: newId(),
        createdAt: new Date().toISOString(),
        categoryId: useCategoryId,
        name: name.trim(),
        sortOrder,
        values: [],
      };
      const nextItems = [...specItems, newItem];
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, nextItems, showToast);
      setSpecItems(nextItems);
      setShowItemAdd(false);
      showToast("success", "仕様項目を追加しました");
    } catch (e) { console.error(e); }
  };

  // ---- 仕様項目 編集 / 削除 / 並び替え ----
  const handleEditItem = async (updated) => {
    try {
      const next = specItems.map((i) => (i.id === updated.id ? updated : i));
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, next, showToast);
      setSpecItems(next);
      setEditingItem(null);
      showToast("success", "仕様項目を更新しました");
    } catch (e) { console.error(e); }
  };

  const handleDeleteItem = async (item) => {
    const ok = await showConfirm(
      `仕様項目「${item.name}」を削除しますか？`,
      "論理削除されます。記録された ChangeLog は保持されます。"
    );
    if (!ok) return;
    try {
      const next = specItems.map((i) =>
        i.id === item.id ? { ...i, deletedAt: new Date().toISOString() } : i
      );
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, next, showToast);
      setSpecItems(next);
      showToast("success", "仕様項目を削除しました");
    } catch (e) { console.error(e); }
  };

  const handleMove = async (item, direction) => {
    const next = moveSpecItemInline(specItems, item.id, direction);
    if (next === specItems) return; // 変化なし
    try {
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, next, showToast);
      setSpecItems(next);
    } catch (e) { console.error(e); }
  };

  // ---- セル編集 (値変更 + ChangeLog 記録) ----
  const handleCellSubmit = async ({ value, reason, meetingId }) => {
    const { specItem, company } = editingCell;
    const existing = (specItem.values || []).find((v) => v.companyId === company.id);
    const previousValue = existing?.value ?? "";
    if (previousValue === value) {
      setEditingCell(null);
      return;
    }
    try {
      // SpecItem 更新
      const now = new Date().toISOString();
      const newValue = { companyId: company.id, value: String(value), meetingId, updatedAt: now };
      const updatedItem = {
        ...specItem,
        values: [...(specItem.values || []).filter((v) => v.companyId !== company.id), newValue],
      };
      const nextItems = specItems.map((i) => (i.id === specItem.id ? updatedItem : i));
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, nextItems, showToast);
      setSpecItems(nextItems);

      // ChangeLog 追記
      const log = buildChangeLogInline({
        specItemId: specItem.id, companyId: company.id,
        previousValue, newValue: value,
        meetingId, reason,
      });
      const logs = await loadChangeLogsFromStorage();
      await saveWithCapacityCheck(STORAGE_KEYS.CHANGE_LOGS, [...logs, log], showToast);

      setEditingCell(null);
      showToast("success", "仕様値を更新しました");
    } catch (e) { console.error(e); }
  };

  // ---- メモ保存 / 削除 ----
  const handleNoteSubmit = async ({ note }) => {
    const { specItem, company } = editingNote;
    try {
      const list = await loadSpecItemNotesFromStorage();
      const existing = findNoteInline(list, specItem.id, company.id);
      let next;
      if (existing) {
        next = list.map((n) =>
          n.id === existing.id ? { ...n, note: note.trim(), updatedAt: new Date().toISOString() } : n
        );
      } else {
        next = [...list, {
          id: newId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          specItemId: specItem.id,
          companyId: company.id,
          note: note.trim(),
        }];
      }
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEM_NOTES, next, showToast);
      setNotes(next);
      setEditingNote(null);
      showToast("success", "メモを保存しました");
    } catch (e) { console.error(e); }
  };

  const handleNoteDelete = async () => {
    const { specItem, company } = editingNote;
    try {
      const list = await loadSpecItemNotesFromStorage();
      const existing = findNoteInline(list, specItem.id, company.id);
      if (!existing) { setEditingNote(null); return; }
      const next = list.filter((n) => n.id !== existing.id);
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEM_NOTES, next, showToast);
      setNotes(next);
      setEditingNote(null);
      showToast("success", "メモを削除しました");
    } catch (e) { console.error(e); }
  };

  return (
    <div data-testid="spec-comparison-view">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            仕様比較
          </h2>
          <p className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mt-1">
            Spec Comparison
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowCategoryManager(true)} data-testid="manage-categories-button"
            className="px-4 py-2 rounded-full border border-rule text-sm text-ink-soft hover:text-ink hover:border-wood-deep">
            カテゴリ管理
          </button>
          <button type="button" onClick={() => setShowItemAdd(true)} data-testid="add-spec-item-button" disabled={saveDisabled}
            className="px-5 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            + 仕様項目を追加
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-5 no-print">
        <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
          <input type="checkbox"
            checked={showOnlyEmpty}
            onChange={(e) => setShowOnlyEmpty(e.target.checked)}
            data-testid="filter-empty-only"
            className="rounded border-rule" />
          未入力のみ表示
        </label>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-ink-soft uppercase tracking-widest font-serif-en">Columns:</span>
          {companies.map((co) => {
            const hidden = hiddenCompanies.has(co.id);
            return (
              <button key={co.id} type="button"
                data-testid={`column-toggle-${co.id}`}
                onClick={() => toggleCompany(co.id)}
                aria-pressed={!hidden}
                className={"px-3 py-0.5 rounded-full text-[11px] border " +
                  (hidden
                    ? "bg-bg text-ink-soft/50 border-rule line-through"
                    : "bg-paper text-ink border-rule hover:border-wood-deep")}
                style={{ letterSpacing: "0.08em" }}>
                {co.name}
              </button>
            );
          })}
        </div>
      </div>

      {visibleCompanies.length === 0 ? (
        <EmptyState
          icon="👁"
          title="表示する会社がありません"
          description="上の列トグルから少なくとも1社を表示してください。"
          testId="spec-no-visible-companies"
        />
      ) : (
        <div className="overflow-auto border border-rule rounded-2xl bg-paper" style={{ maxHeight: "calc(100vh - 180px)" }}>
          <table className="w-full text-sm" data-testid="spec-table">
            <thead>
              <tr>
                <th className="border border-rule p-3 text-left bg-paper min-w-[180px] sticky top-0 left-0 z-30" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
                  項目
                </th>
                {visibleCompanies.map((co) => (
                  <th key={co.id} className="border border-rule p-3 text-left min-w-[180px] bg-paper sticky top-0 z-20" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
                    {co.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeCategories.map((cat) => {
                const items = specItemsByCategoryInline(activeItems, cat.id);
                const folded = foldedCategories.has(cat.id);
                const filtered = showOnlyEmpty ? items.filter((i) => isRowAllEmpty(i)) : items;
                return (
                  <React.Fragment key={cat.id}>
                    <tr className="bg-bg/50" data-testid={`category-section-${cat.id}`}>
                      <th colSpan={visibleCompanies.length + 1}
                        className="border border-rule p-2 text-left bg-bg sticky left-0"
                        scope="colgroup">
                        <div className="flex items-center justify-between gap-2">
                          <button type="button"
                            data-testid={`category-toggle-${cat.id}`}
                            onClick={() => toggleCategoryFold(cat.id)}
                            className="flex items-center gap-2 text-sm text-ink hover:text-rust transition focus-visible:outline focus-visible:outline-2 ring-rust rounded">
                            <span aria-hidden="true">{folded ? "▶" : "▼"}</span>
                            <span style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>{cat.name}</span>
                            <span className="text-xs text-ink-soft">({items.length})</span>
                          </button>
                        </div>
                      </th>
                    </tr>
                    {!folded && filtered.map((item, idx) => (
                      <SpecRow key={item.id}
                        specItem={item}
                        companies={visibleCompanies}
                        notesByCompany={visibleCompanies.reduce((acc, co) => {
                          acc[co.id] = findNoteInline(notes, item.id, co.id); return acc;
                        }, {})}
                        onCellEdit={(co) => setEditingCell({ specItem: item, company: co })}
                        onNoteEdit={(co) => setEditingNote({ specItem: item, company: co })}
                        onItemEdit={() => setEditingItem(item)}
                        onItemDelete={() => handleDeleteItem(item)}
                        onMoveUp={() => handleMove(item, "up")}
                        onMoveDown={() => handleMove(item, "down")}
                        saveDisabled={saveDisabled}
                        isFirst={idx === 0}
                        isLast={idx === filtered.length - 1}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onSave={handleSaveCategory}
          onDelete={handleDeleteCategory}
          saveDisabled={saveDisabled}
        />
      )}
      {showItemAdd && (
        <ItemAddModal
          categories={categories}
          onSubmit={handleAddItem}
          onClose={() => setShowItemAdd(false)}
          saveDisabled={saveDisabled}
        />
      )}
      {editingItem && (
        <SpecItemEditModal
          specItem={editingItem}
          onSubmit={handleEditItem}
          onClose={() => setEditingItem(null)}
          saveDisabled={saveDisabled}
        />
      )}
      {editingCell && (
        <SpecCellEditor
          specItem={editingCell.specItem}
          company={editingCell.company}
          currentValue={(editingCell.specItem.values || []).find((v) => v.companyId === editingCell.company.id)}
          onSubmit={handleCellSubmit}
          onClose={() => setEditingCell(null)}
          saveDisabled={saveDisabled}
        />
      )}
      {editingNote && (
        <SpecItemNotePopover
          specItem={editingNote.specItem}
          company={editingNote.company}
          existingNote={findNoteInline(notes, editingNote.specItem.id, editingNote.company.id)}
          onSubmit={handleNoteSubmit}
          onDelete={handleNoteDelete}
          onClose={() => setEditingNote(null)}
          saveDisabled={saveDisabled}
        />
      )}
    </div>
  );
}

// ===== 6. 打ち合わせコンポーネント =====

// ---- Sprint 3 内部ユーティリティ (src/utils/meeting.js / decision.js のミラー) ----

const DATE_PATTERN_INLINE = /^\d{4}-\d{2}-\d{2}$/;

function generateMeetingTitleInline(date, companyName, existingTitles = []) {
  const base = `${date} ${companyName}`;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(?:\\s+\\(\\d+\\))?$`);
  const matches = existingTitles.filter((t) => re.test(t));
  if (matches.length === 0) return base;
  return `${base} (${matches.length + 1})`;
}

function parseAttendeesInline(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
}

function formatAttendeesInline(attendees) {
  return Array.isArray(attendees) ? attendees.join(", ") : "";
}

function isFutureDateInline(dateStr, now = new Date()) {
  if (!dateStr || !DATE_PATTERN_INLINE.test(dateStr)) return false;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return target.getTime() > today.getTime();
}

function validateMeetingInline(input) {
  const errors = {};
  const date = String(input?.date ?? "");
  if (date.length === 0) errors.date = "日付は必須です";
  else if (!DATE_PATTERN_INLINE.test(date)) errors.date = "日付の形式が不正です (YYYY-MM-DD)";

  const agenda = String(input?.agenda ?? "");
  if (agenda.trim().length === 0) errors.agenda = "議題は必須です";
  else if (agenda.length > 1000) errors.agenda = "1000文字以内で入力してください";

  if (input?.summary && String(input.summary).length > 2000)
    errors.summary = "2000文字以内で入力してください";
  if (input?.location && String(input.location).length > 100)
    errors.location = "100文字以内で入力してください";

  let arr = input?.attendees;
  if (typeof arr === "string") arr = parseAttendeesInline(arr);
  if (Array.isArray(arr)) {
    if (arr.length > 20) errors.attendees = "参加者は20人以内で入力してください";
    else if (arr.some((a) => String(a).length > 30))
      errors.attendees = "参加者1人の名前は30文字以内です";
  }

  if (!input?.companyId) errors.companyId = "会社は必須です";
  return errors;
}

function validateDecisionInline(input) {
  const errors = {};
  const content = String(input?.content ?? "");
  if (content.trim().length === 0) errors.content = "決定内容は必須です";
  else if (content.length > 1000) errors.content = "1000文字以内で入力してください";
  if (input?.specValue && String(input.specValue).length > 200)
    errors.specValue = "200文字以内で入力してください";
  if (input?.note && String(input.note).length > 500)
    errors.note = "500文字以内で入力してください";
  return errors;
}

async function loadMeetingsFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.MEETINGS);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function loadDecisionsFromStorage() {
  const raw = await storage.getItem(STORAGE_KEYS.DECISIONS);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ---- 決定事項ステータスバッジ ----

const DECISION_STATUS_BADGE = {
  pending:   { bg: "bg-paper",    text: "text-wood-deep", border: "border-rule" },
  confirmed: { bg: "bg-sage",     text: "text-white",     border: "border-transparent" },
  cancelled: { bg: "bg-bg",       text: "text-ink-soft",  border: "border-rule" },
};

function DecisionStatusBadge({ status, testId }) {
  const s = DECISION_STATUS_BADGE[status] || DECISION_STATUS_BADGE.pending;
  return (
    <span data-testid={testId}
      className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] border ${s.bg} ${s.text} ${s.border}`}
      style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
      {DECISION_STATUS_LABEL[status] || status}
    </span>
  );
}

// ---- 前回の打ち合わせパネル ----

function PrevMeetingPanel({ company, prevMeeting }) {
  const [open, setOpen] = useState(false);
  if (!company || !prevMeeting) return null;
  return (
    <div className="bg-paper border border-rule rounded-2xl p-4" data-testid="prev-meeting-panel">
      <button type="button"
        data-testid="prev-meeting-toggle"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left">
        <span className="text-sm text-ink-soft">
          <span className="font-serif-en text-[10px] uppercase tracking-widest mr-2 opacity-70">Prev</span>
          {company.name} の前回の打ち合わせ
          <span className="ml-2 font-mono text-xs text-ink">{prevMeeting.date}</span>
        </span>
        <span aria-hidden="true" className="text-ink-soft">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-rule text-sm text-ink-soft space-y-2">
          <p className="text-ink"><span className="text-ink-soft mr-2">議題:</span>{prevMeeting.agenda}</p>
          {prevMeeting.summary && (
            <p className="text-ink-soft whitespace-pre-line">
              <span className="mr-2">まとめ:</span>{prevMeeting.summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---- 決定事項インライン編集行 ----

function DecisionInlineRow({ decision, idx, companies, defaultCompanyId, categories, specItems, errors, onChange, onRemove }) {
  const NEW_ITEM = "__new_item__";
  const NEW_CAT = "__new_category__";
  const isNewItem = decision.__newItem === true;
  const activeItems = specItems.filter((s) => !s.deletedAt);
  const activeCats = categories.filter((c) => !c.deletedAt).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const update = (key, value) => onChange({ ...decision, [key]: value });

  const handleSpecItemSelect = (e) => {
    const v = e.target.value;
    if (v === NEW_ITEM) {
      onChange({
        ...decision, __newItem: true,
        specItemId: null,
        __newItemName: "",
        __newCategoryId: activeCats[0]?.id || NEW_CAT,
        __newCategoryName: "",
      });
    } else if (v === "") {
      onChange({ ...decision, __newItem: false, specItemId: null, __newItemName: null });
    } else {
      onChange({ ...decision, __newItem: false, specItemId: v, __newItemName: null });
    }
  };

  return (
    <div className="border border-rule rounded-xl p-4 bg-paper/40 relative" data-testid={`decision-row-${idx}`}>
      <button type="button" onClick={onRemove}
        data-testid={`decision-remove-${idx}`}
        aria-label="この決定事項を削除"
        className="absolute top-2 right-2 text-ink-soft hover:text-rust text-sm">
        ✕
      </button>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-serif-en uppercase text-[10px] tracking-widest text-wood-deep">Decision #{idx + 1}</span>
      </div>

      <Field label="決定内容 *" htmlFor={`d-content-${idx}`} error={errors?.content} max={1000} value={decision.content}>
        <textarea id={`d-content-${idx}`} data-testid={`decision-content-input-${idx}`}
          value={decision.content || ""} onChange={(e) => update("content", e.target.value)}
          rows={2} maxLength={2000}
          className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
      </Field>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="ステータス" htmlFor={`d-status-${idx}`}>
          <select id={`d-status-${idx}`} data-testid={`decision-status-select-${idx}`}
            value={decision.status || "pending"}
            onChange={(e) => update("status", e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
            {Object.entries(DECISION_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="メモ" htmlFor={`d-note-${idx}`} error={errors?.note} max={500} value={decision.note}>
          <input id={`d-note-${idx}`} type="text" data-testid={`decision-note-input-${idx}`}
            value={decision.note || ""} onChange={(e) => update("note", e.target.value)}
            maxLength={1000}
            className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
        </Field>
      </div>

      <div className="mt-4 pt-3 border-t border-rule">
        <p className="font-serif-en uppercase text-[10px] tracking-widest text-wood-deep mb-2">Spec Reflection</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`d-spec-item-${idx}`} className="text-xs text-ink-soft" style={{ letterSpacing: "0.08em" }}>仕様項目</label>
            <select id={`d-spec-item-${idx}`} data-testid={`decision-spec-item-select-${idx}`}
              value={isNewItem ? NEW_ITEM : (decision.specItemId || "")}
              onChange={handleSpecItemSelect}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
              <option value="">— 紐付けなし —</option>
              {activeItems.map((it) => {
                const cat = activeCats.find((c) => c.id === it.categoryId);
                return <option key={it.id} value={it.id}>{cat ? `[${cat.name}] ` : ""}{it.name}</option>;
              })}
              <option value={NEW_ITEM}>+ 新規仕様項目を作成して反映</option>
            </select>
          </div>
          <div>
            <label htmlFor={`d-spec-company-${idx}`} className="text-xs text-ink-soft" style={{ letterSpacing: "0.08em" }}>会社</label>
            <select id={`d-spec-company-${idx}`} data-testid={`decision-spec-company-select-${idx}`}
              value={decision.specCompanyId || defaultCompanyId || ""}
              onChange={(e) => update("specCompanyId", e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
              {companies.filter((co) => !co.deletedAt).map((co) => (
                <option key={co.id} value={co.id}>{co.name}</option>
              ))}
            </select>
          </div>
        </div>

        {isNewItem && (
          <div className="mt-3 p-3 rounded-lg border border-dashed border-wood-deep bg-bg" data-testid={`decision-new-item-form-${idx}`}>
            <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-2">New Spec Item</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="項目名 *" htmlFor={`d-new-name-${idx}`} max={50} value={decision.__newItemName}>
                <input id={`d-new-name-${idx}`} type="text"
                  data-testid={`decision-new-spec-item-name-input-${idx}`}
                  value={decision.__newItemName || ""}
                  onChange={(e) => update("__newItemName", e.target.value)}
                  maxLength={120}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
              </Field>
              <div>
                <label htmlFor={`d-new-cat-${idx}`} className="text-xs text-ink-soft" style={{ letterSpacing: "0.08em" }}>カテゴリ *</label>
                <select id={`d-new-cat-${idx}`} data-testid={`decision-new-spec-item-category-select-${idx}`}
                  value={decision.__newCategoryId || ""}
                  onChange={(e) => update("__newCategoryId", e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
                  {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value={NEW_CAT}>+ 新規カテゴリ作成</option>
                </select>
              </div>
            </div>
            {decision.__newCategoryId === NEW_CAT && (
              <div className="mt-2">
                <Field label="新規カテゴリ名 *" htmlFor={`d-new-cat-name-${idx}`} max={30} value={decision.__newCategoryName}>
                  <input id={`d-new-cat-name-${idx}`} type="text"
                    data-testid={`decision-new-category-name-input-${idx}`}
                    value={decision.__newCategoryName || ""}
                    onChange={(e) => update("__newCategoryName", e.target.value)}
                    maxLength={60}
                    className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
                </Field>
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <Field label="仕様値 (反映する値)" htmlFor={`d-spec-value-${idx}`} error={errors?.specValue} max={200} value={decision.specValue}>
            <input id={`d-spec-value-${idx}`} type="text" data-testid={`decision-spec-value-input-${idx}`}
              value={decision.specValue || ""} onChange={(e) => update("specValue", e.target.value)}
              maxLength={400}
              placeholder="例: 高性能GW 24K"
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ---- 打ち合わせフォームモーダル ----

export function MeetingFormModal({ initial, companies, categories, specItems, meetings, onSubmit, onClose, saveDisabled }) {
  const showToast = useToast();
  const isEdit = Boolean(initial?.id);

  const [form, setForm] = useState(() => {
    const defaultCompanyId = initial?.companyId ?? companies[0]?.id ?? "";
    return {
      date: initial?.date ?? new Date().toISOString().slice(0, 10),
      companyId: defaultCompanyId,
      title: initial?.title ?? "",
      location: initial?.location ?? "",
      attendees: formatAttendeesInline(initial?.attendees ?? []),
      agenda: initial?.agenda ?? "",
      summary: initial?.summary ?? "",
    };
  });
  const [decisions, setDecisions] = useState(() => initial?.__decisions ?? []);
  const [errors, setErrors] = useState({});
  const [decisionErrors, setDecisionErrors] = useState({});
  const titleId = useMemo(() => `meeting-form-title-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const selectedCompany = companies.find((c) => c.id === form.companyId);
  const prevMeeting = useMemo(() => {
    if (!form.companyId) return null;
    const filtered = meetings
      .filter((m) => !m.deletedAt && m.companyId === form.companyId && m.id !== initial?.id)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return filtered[0] || null;
  }, [meetings, form.companyId, initial?.id]);

  const handleAddDecision = () => {
    setDecisions((d) => [...d, {
      content: "", status: "pending", note: "",
      specItemId: null, specCompanyId: form.companyId, specValue: "",
    }]);
  };
  const handleRemoveDecision = (idx) => {
    setDecisions((d) => d.filter((_, i) => i !== idx));
    setDecisionErrors((e) => {
      const next = { ...e };
      delete next[idx];
      return next;
    });
  };
  const handleDecisionChange = (idx, next) => {
    setDecisions((arr) => arr.map((d, i) => (i === idx ? next : d)));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const meetingErrors = validateMeetingInline({
      date: form.date,
      agenda: form.agenda,
      summary: form.summary,
      location: form.location,
      attendees: form.attendees,
      companyId: form.companyId,
    });
    setErrors(meetingErrors);

    // 各決定事項のバリデーション
    const dErrs = {};
    decisions.forEach((d, idx) => {
      const errs = validateDecisionInline(d);
      // 新規仕様項目作成時のフィールド検証
      if (d.__newItem === true) {
        const name = String(d.__newItemName || "").trim();
        if (name.length === 0) errs.__newItemName = "項目名は必須です";
        if (d.__newCategoryId === "__new_category__") {
          const catName = String(d.__newCategoryName || "").trim();
          if (catName.length === 0) errs.__newCategoryName = "カテゴリ名は必須です";
        } else if (!d.__newCategoryId) {
          errs.__newCategoryName = "カテゴリを選択してください";
        }
      }
      if (Object.keys(errs).length > 0) dErrs[idx] = errs;
    });
    setDecisionErrors(dErrs);

    if (Object.keys(meetingErrors).length > 0 || Object.keys(dErrs).length > 0) return;

    // E15: 未来日付の warning Toast (登録はブロックしない)
    if (isFutureDateInline(form.date)) {
      showToast("warning", "未来の日付が設定されています。予定として登録します。");
    }
    onSubmit({ ...form, decisions });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      data-testid="meeting-form-modal"
    >
      <form onSubmit={handleSubmit} noValidate
        className="bg-bg rounded-2xl max-w-3xl w-full p-7 my-8"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}>
        <div className="flex items-baseline justify-between mb-5">
          <h2 id={titleId} className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            {isEdit ? "打ち合わせを編集" : "打ち合わせを記録"}
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Meeting</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="日付 *" htmlFor="mf-date" error={errors.date}>
            <input id="mf-date" type="date" data-testid="meeting-date-input"
              value={form.date} onChange={update("date")}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm font-mono focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>
          <Field label="会社 *" htmlFor="mf-company" error={errors.companyId}>
            <select id="mf-company" data-testid="meeting-company-select"
              value={form.companyId} onChange={update("companyId")}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
              {companies.filter((c) => !c.deletedAt).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="場所" htmlFor="mf-location" error={errors.location} max={100} value={form.location}>
            <input id="mf-location" type="text" data-testid="meeting-location-input"
              value={form.location} onChange={update("location")}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>
          <Field label="参加者 (カンマ区切り)" htmlFor="mf-attendees" error={errors.attendees}>
            <input id="mf-attendees" type="text" data-testid="meeting-attendees-input"
              value={form.attendees} onChange={update("attendees")}
              placeholder="田中, 鈴木, 佐藤"
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>
          <div className="md:col-span-2">
            <Field label="タイトル (空欄なら自動生成)" htmlFor="mf-title">
              <input id="mf-title" type="text" data-testid="meeting-title-input"
                value={form.title} onChange={update("title")}
                placeholder={selectedCompany ? `${form.date} ${selectedCompany.name}` : "自動生成"}
                className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
            </Field>
          </div>
          {prevMeeting && (
            <div className="md:col-span-2">
              <PrevMeetingPanel company={selectedCompany} prevMeeting={prevMeeting} />
            </div>
          )}
          <div className="md:col-span-2">
            <Field label="議題 *" htmlFor="mf-agenda" error={errors.agenda} max={1000} value={form.agenda}>
              <textarea id="mf-agenda" data-testid="meeting-agenda-input"
                value={form.agenda} onChange={update("agenda")}
                rows={4} maxLength={2000}
                className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="まとめ" htmlFor="mf-summary" error={errors.summary} max={2000} value={form.summary}>
              <textarea id="mf-summary" data-testid="meeting-summary-input"
                value={form.summary} onChange={update("summary")}
                rows={4} maxLength={3000}
                className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 ring-rust" />
            </Field>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-rule">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
              決定事項
            </h3>
            <button type="button" onClick={handleAddDecision} data-testid="add-decision-button"
              className="text-xs px-3 py-1 rounded-full border border-rule text-ink-soft hover:text-ink hover:border-wood-deep">
              + 決定事項を追加
            </button>
          </div>
          {decisions.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-4">決定事項はまだ登録されていません</p>
          ) : (
            <div className="space-y-3" data-testid="decision-list">
              {decisions.map((d, idx) => (
                <DecisionInlineRow key={idx} decision={d} idx={idx}
                  companies={companies} defaultCompanyId={form.companyId}
                  categories={categories} specItems={specItems}
                  errors={decisionErrors[idx]}
                  onChange={(next) => handleDecisionChange(idx, next)}
                  onRemove={() => handleRemoveDecision(idx)} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} data-testid="meeting-cancel-button"
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper">
            キャンセル
          </button>
          <button type="submit" data-testid="save-meeting-button" disabled={saveDisabled}
            className="px-6 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            {isEdit ? "更新" : "登録"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- 打ち合わせカード ----

function MeetingCard({ meeting, company, onClick, onEdit, onDelete, decisionsCount }) {
  return (
    <article
      data-testid={`meeting-card-${meeting.id}`}
      className="bg-paper border border-rule rounded-2xl p-5 hover:border-wood-deep transition cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base text-ink truncate" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            {meeting.title}
          </h3>
          <p className="text-xs text-ink-soft mt-1">
            <span className="font-mono">{meeting.date}</span>
            {company && <> <span className="mx-2 opacity-50">·</span> {company.name}</>}
            {meeting.location && <> <span className="mx-2 opacity-50">·</span> {meeting.location}</>}
          </p>
        </div>
        <span className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep">
          {decisionsCount ?? 0} decisions
        </span>
      </div>
      {meeting.agenda && (
        <p className="mt-3 text-xs text-ink-soft leading-relaxed line-clamp-2">{meeting.agenda}</p>
      )}
      {meeting.summary && (
        <p className="mt-2 text-xs text-ink-soft leading-relaxed line-clamp-3 border-l-2 border-rule pl-2"
           data-testid={`meeting-summary-${meeting.id}`}>
          {meeting.summary.length > 100 ? `${meeting.summary.slice(0, 100)}...` : meeting.summary}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-rule/60 pt-3" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onEdit} data-testid={`edit-meeting-button-${meeting.id}`}
          className="text-xs px-3 py-1 rounded-full border border-rule text-ink-soft hover:text-ink hover:border-wood-deep">
          編集
        </button>
        <button type="button" onClick={onDelete} data-testid={`delete-meeting-button-${meeting.id}`}
          className="text-xs px-3 py-1 rounded-full border border-rule text-rust hover:bg-rust hover:text-white">
          削除
        </button>
      </div>
    </article>
  );
}

// ---- 打ち合わせ詳細ページ ----

function DecisionDetailRow({ decision, specItem, company, onChangeStatus, onDelete, onReflect, saveDisabled }) {
  // Spec セクション表示条件: specItemId か specValue のいずれかが設定されているとき
  const hasSpecRef = Boolean(decision.specItemId) || Boolean(decision.specValue);
  // 仕様項目削除済み判定 (specItemId はあるが specItem が見つからない or deletedAt 持ち)
  const specItemDeleted = Boolean(decision.specItemId) && (!specItem || specItem.deletedAt);
  // 反映可能: specItemId / specCompanyId / specValue が揃っており、対象 SpecItem が削除されていない
  const reflectable = Boolean(
    decision.specItemId && decision.specCompanyId && decision.specValue && specItem && !specItem.deletedAt
  );

  return (
    <div className="border border-rule rounded-xl p-4 bg-paper/40" data-testid={`decision-detail-${decision.id}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-ink leading-relaxed whitespace-pre-line flex-1">{decision.content}</p>
        <DecisionStatusBadge status={decision.status} testId={`decision-detail-status-${decision.id}`} />
      </div>
      {hasSpecRef && (
        <div className="mt-2 text-xs text-ink-soft pt-2 border-t border-rule/60"
             data-testid={`decision-spec-ref-${decision.id}`}>
          <span className="font-serif-en uppercase text-[10px] tracking-widest text-wood-deep mr-2">Spec</span>
          {specItemDeleted ? (
            <span className="text-ink-soft italic" data-testid={`decision-deleted-spec-item-${decision.id}`}>
              [削除済み仕様項目]
            </span>
          ) : (
            <span>{specItem ? specItem.name : "—"}</span>
          )}
          {company && <> <span className="mx-1 opacity-50">·</span> {company.name}</>}
          {decision.specValue && <> <span className="mx-1 opacity-50">→</span> <span className="text-ink">{decision.specValue}</span></>}
        </div>
      )}
      {decision.note && (
        <p className="mt-2 text-xs text-ink-soft border-l-2 border-rule pl-2">{decision.note}</p>
      )}
      <div className="mt-3 flex justify-end gap-2 no-print flex-wrap">
        {reflectable && (
          <button type="button" onClick={() => onReflect?.(decision)}
            data-testid={`decision-reflect-${decision.id}`}
            disabled={saveDisabled}
            className="text-xs px-3 py-1 rounded-full bg-rust text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            ✅ 仕様に反映
          </button>
        )}
        <select value={decision.status}
          onChange={(e) => onChangeStatus(decision, e.target.value)}
          data-testid={`decision-status-change-${decision.id}`}
          className="text-xs px-2 py-1 rounded-full border border-rule bg-bg text-ink-soft focus-visible:outline focus-visible:outline-2 ring-rust">
          {Object.entries(DECISION_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" onClick={() => onDelete(decision)}
          data-testid={`decision-delete-${decision.id}`}
          className="text-xs px-3 py-1 rounded-full border border-rule text-rust hover:bg-rust hover:text-white">
          削除
        </button>
      </div>
    </div>
  );
}

export function MeetingDetailPage({ meeting, company, decisions, specItems, companies, onClose, onEdit, onChangeStatus, onDeleteDecision, onReflect, saveDisabled }) {
  if (!meeting) return null;
  return (
    <div
      className="fixed inset-0 z-30 bg-bg overflow-y-auto"
      data-testid="meeting-detail-page"
      role="dialog" aria-modal="true" aria-label={`${meeting.title}の詳細`}>
      <header className="sticky top-0 bg-bg border-b border-rule z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button type="button" onClick={onClose} data-testid="meeting-detail-close"
            className="text-sm text-ink-soft hover:text-ink flex items-center gap-1 focus-visible:outline focus-visible:outline-2 ring-rust rounded">
            <span>←</span> 打ち合わせ一覧
          </button>
          <button type="button" onClick={onEdit} data-testid="meeting-detail-edit"
            className="px-4 py-1.5 rounded-full text-xs bg-rust text-white hover:opacity-90">
            編集
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-2xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 700 }}>
            {meeting.title}
          </h1>
          <p className="text-xs text-ink-soft mt-2">
            <span className="font-mono">{meeting.date}</span>
            {company ? <> <span className="mx-2 opacity-50">·</span> {company.name}</> : <> <span className="mx-2 opacity-50">·</span> [削除済み会社]</>}
            {meeting.location && <> <span className="mx-2 opacity-50">·</span> {meeting.location}</>}
          </p>
        </div>

        {meeting.attendees && meeting.attendees.length > 0 && (
          <section>
            <h3 className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mb-2">Attendees</h3>
            <p className="text-sm text-ink">{meeting.attendees.join(", ")}</p>
          </section>
        )}

        <section>
          <h3 className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mb-2">Agenda</h3>
          <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{meeting.agenda}</p>
        </section>

        {meeting.summary && (
          <section>
            <h3 className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mb-2">Summary</h3>
            <p className="text-sm text-ink whitespace-pre-line leading-relaxed">{meeting.summary}</p>
          </section>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
              決定事項 ({decisions.length})
            </h3>
          </div>
          {decisions.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-4 border border-dashed border-rule rounded-xl">
              決定事項はありません
            </p>
          ) : (
            <div className="space-y-3" data-testid="meeting-decision-list">
              {decisions.map((d) => {
                const item = specItems.find((s) => s.id === d.specItemId);
                const co = companies.find((c) => c.id === d.specCompanyId);
                return <DecisionDetailRow key={d.id} decision={d}
                  specItem={item} company={co}
                  onChangeStatus={onChangeStatus}
                  onDelete={onDeleteDecision}
                  onReflect={onReflect}
                  saveDisabled={saveDisabled} />;
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ---- 打ち合わせ一覧ビュー (メイン) ----

const MEETINGS_PER_PAGE = 20;

export function MeetingsView({ saveDisabled }) {
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [companies, setCompanies] = useState(null);
  const [categories, setCategories] = useState([]);
  const [specItems, setSpecItems] = useState([]);
  const [meetings, setMeetings] = useState(null);
  const [decisions, setDecisions] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailMeeting, setDetailMeeting] = useState(null);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [reflectingDecision, setReflectingDecision] = useState(null);

  const reload = useCallback(async () => {
    setCompanies((await loadCompaniesFromStorage()).filter((c) => !c.deletedAt));
    setCategories(await loadCategoriesFromStorage());
    setSpecItems(await loadSpecItemsFromStorage());
    setMeetings(await loadMeetingsFromStorage());
    setDecisions(await loadDecisionsFromStorage());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (companies === null || meetings === null) return <Spinner label="打ち合わせを読み込み中..." />;

  // 会社0件 → Empty State
  if (companies.length === 0) {
    return (
      <EmptyState
        icon="🏢"
        title="先に会社を登録してください"
        description="打ち合わせを記録するには、関連する会社を「会社管理」タブから登録する必要があります。"
        testId="meetings-empty-no-companies"
      />
    );
  }

  const activeMeetings = meetings
    .filter((m) => !m.deletedAt)
    .filter((m) => companyFilter === "all" || m.companyId === companyFilter)
    .sort((a, b) => {
      const ax = a.date || ""; const bx = b.date || "";
      if (ax === bx) return (b.createdAt || "").localeCompare(a.createdAt || "");
      return bx.localeCompare(ax);
    });

  const totalPages = Math.max(1, Math.ceil(activeMeetings.length / MEETINGS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageMeetings = activeMeetings.slice((currentPage - 1) * MEETINGS_PER_PAGE, currentPage * MEETINGS_PER_PAGE);

  const handleAdd = () => { setEditing(null); setShowForm(true); };
  const handleEdit = (m) => {
    const rel = decisions.filter((d) => !d.deletedAt && d.meetingId === m.id);
    setEditing({ ...m, __decisions: rel });
    setShowForm(true);
  };

  const handleSubmit = async (formData) => {
    try {
      let cats = categories;
      let items = specItems;
      const company = companies.find((c) => c.id === formData.companyId);
      const companyName = company?.name || "";

      // 1) 各決定事項の「新規仕様項目」を先に解決して specItemId を確定する
      const resolvedDecisions = [];
      for (const d of formData.decisions) {
        let specItemId = d.specItemId || undefined;
        if (d.__newItem === true) {
          let categoryId = d.__newCategoryId;
          if (categoryId === "__new_category__") {
            const newCat = {
              id: newId(),
              createdAt: new Date().toISOString(),
              name: String(d.__newCategoryName || "").trim(),
              normalizedName: normalizeCategoryNameInline(d.__newCategoryName),
              sortOrder: Math.max(0, ...cats.map((c) => c.sortOrder ?? 0)) + 1,
              isDefault: false,
            };
            cats = [...cats, newCat];
            categoryId = newCat.id;
          }
          const newItem = {
            id: newId(),
            createdAt: new Date().toISOString(),
            categoryId,
            name: String(d.__newItemName || "").trim(),
            sortOrder: nextSortOrderForCategoryInline(items, categoryId),
            values: [],
          };
          items = [...items, newItem];
          specItemId = newItem.id;
        }
        resolvedDecisions.push({
          ...d,
          specItemId,
          __newItem: undefined, __newItemName: undefined,
          __newCategoryId: undefined, __newCategoryName: undefined,
        });
      }

      // 2) Meeting タイトル決定 (空欄なら自動生成)
      const titleStr = (formData.title || "").trim();
      let title = titleStr;
      if (!title) {
        const sibTitles = (editing ? meetings.filter((m) => m.id !== editing.id) : meetings)
          .filter((m) => !m.deletedAt && m.date === formData.date && m.companyId === formData.companyId)
          .map((m) => m.title)
          .filter(Boolean);
        title = generateMeetingTitleInline(formData.date, companyName, sibTitles);
      }

      // 3) Meeting 構築
      const attendees = parseAttendeesInline(formData.attendees);
      const now = new Date().toISOString();
      const meetingId = editing?.id || newId();
      const newMeeting = editing ? {
        ...editing,
        date: formData.date,
        companyId: formData.companyId,
        title,
        location: formData.location ? String(formData.location).trim() : undefined,
        attendees,
        agenda: String(formData.agenda).trim(),
        summary: formData.summary ? String(formData.summary).trim() : undefined,
        __decisions: undefined,
      } : {
        id: meetingId,
        createdAt: now,
        date: formData.date,
        companyId: formData.companyId,
        title,
        location: formData.location ? String(formData.location).trim() : undefined,
        attendees,
        agenda: String(formData.agenda).trim(),
        summary: formData.summary ? String(formData.summary).trim() : undefined,
      };
      delete newMeeting.__decisions;

      // 4) Decision を Meeting に紐付け (編集モードでは既存を一旦削除 → 再追加で簡素化)
      let nextDecisions = decisions;
      if (editing) {
        nextDecisions = nextDecisions.filter((d) => d.meetingId !== editing.id || d.deletedAt);
      }
      for (const d of resolvedDecisions) {
        nextDecisions = [...nextDecisions, {
          id: newId(),
          createdAt: new Date().toISOString(),
          meetingId,
          content: String(d.content || "").trim(),
          status: d.status || "pending",
          specItemId: d.specItemId,
          specCompanyId: d.specCompanyId || formData.companyId,
          specValue: d.specValue ? String(d.specValue).trim() : undefined,
          note: d.note ? String(d.note).trim() : undefined,
        }];
      }

      // 5) ストレージ書き込み (順序: categories → specItems → meetings → decisions)
      if (cats !== categories) {
        await saveWithCapacityCheck(STORAGE_KEYS.CATEGORIES, cats, showToast);
      }
      if (items !== specItems) {
        await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, items, showToast);
      }
      const allMeetings = editing
        ? meetings.map((m) => (m.id === editing.id ? newMeeting : m))
        : [...meetings, newMeeting];
      await saveWithCapacityCheck(STORAGE_KEYS.MEETINGS, allMeetings, showToast);
      await saveWithCapacityCheck(STORAGE_KEYS.DECISIONS, nextDecisions, showToast);

      await reload();
      setShowForm(false);
      setEditing(null);
      showToast("success", editing ? "打ち合わせを更新しました" : "打ち合わせを登録しました");
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (meeting) => {
    const ok = await showConfirm(
      `「${meeting.title}」を削除しますか？`,
      "論理削除されます。関連する決定事項も同時に論理削除されます (アーカイブで確認可)。"
    );
    if (!ok) return;
    try {
      const now = new Date().toISOString();
      const nextMeetings = meetings.map((m) => (m.id === meeting.id ? { ...m, deletedAt: now } : m));
      const nextDecisions = decisions.map((d) =>
        d.meetingId === meeting.id && !d.deletedAt ? { ...d, deletedAt: now } : d
      );
      await saveWithCapacityCheck(STORAGE_KEYS.MEETINGS, nextMeetings, showToast);
      await saveWithCapacityCheck(STORAGE_KEYS.DECISIONS, nextDecisions, showToast);
      await reload();
      showToast("success", "打ち合わせを削除しました");
    } catch (e) { console.error(e); }
  };

  const handleChangeDecisionStatus = async (decision, status) => {
    try {
      const next = decisions.map((d) => (d.id === decision.id ? { ...d, status } : d));
      await saveWithCapacityCheck(STORAGE_KEYS.DECISIONS, next, showToast);
      setDecisions(next);
      showToast("success", `ステータスを「${DECISION_STATUS_LABEL[status]}」に変更しました`);
    } catch (e) { console.error(e); }
  };

  const handleDeleteDecision = async (decision) => {
    const ok = await showConfirm(
      "この決定事項を削除しますか？",
      "物理削除されます (元に戻せません)。"
    );
    if (!ok) return;
    try {
      const next = decisions.filter((d) => d.id !== decision.id);
      await saveWithCapacityCheck(STORAGE_KEYS.DECISIONS, next, showToast);
      setDecisions(next);
      showToast("success", "決定事項を削除しました");
    } catch (e) { console.error(e); }
  };

  const handleOpenReflect = (decision) => {
    setReflectingDecision(decision);
  };

  const handleConfirmReflect = async ({ reason }) => {
    if (!reflectingDecision) return;
    try {
      await reflectToSpecInline(reflectingDecision, reason, showToast);
      await reload();
      // 決定事項を「確定」に自動更新する仕様 (反映済みの記録)
      const next = decisions.map((d) =>
        d.id === reflectingDecision.id ? { ...d, status: "confirmed" } : d
      );
      try {
        await saveWithCapacityCheck(STORAGE_KEYS.DECISIONS, next, showToast);
        setDecisions(next);
      } catch { /* status 更新の失敗は致命的ではないので無視 */ }
      setReflectingDecision(null);
      showToast("success", "仕様を更新しました");
    } catch (e) {
      console.error(e);
      // Toast は reflectToSpecInline 側で表示済み
    }
  };

  return (
    <div data-testid="meetings-view">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            打ち合わせ
          </h2>
          <p className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mt-1">
            Meetings / {activeMeetings.length} records
          </p>
        </div>
        <button type="button" onClick={handleAdd} data-testid="add-meeting-button" disabled={saveDisabled}
          className="px-5 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
          + 打ち合わせを記録
        </button>
      </div>

      {meetings.filter((m) => !m.deletedAt).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button type="button" data-testid="meeting-filter-all"
            onClick={() => { setCompanyFilter("all"); setPage(1); }}
            className={"px-4 py-1.5 rounded-full text-xs border focus-visible:outline focus-visible:outline-2 ring-rust " +
              (companyFilter === "all"
                ? "bg-rust text-white border-rust"
                : "bg-bg text-ink-soft border-rule hover:text-ink hover:border-wood-deep")}
            style={{ letterSpacing: "0.08em" }}>
            すべての会社
          </button>
          {companies.map((co) => (
            <button key={co.id} type="button"
              data-testid={`meeting-filter-${co.id}`}
              onClick={() => { setCompanyFilter(co.id); setPage(1); }}
              className={"px-4 py-1.5 rounded-full text-xs border focus-visible:outline focus-visible:outline-2 ring-rust " +
                (companyFilter === co.id
                  ? "bg-rust text-white border-rust"
                  : "bg-bg text-ink-soft border-rule hover:text-ink hover:border-wood-deep")}
              style={{ letterSpacing: "0.08em" }}>
              {co.name}
            </button>
          ))}
        </div>
      )}

      {activeMeetings.length === 0 ? (
        <EmptyState
          icon="📅"
          title="打ち合わせ記録がありません"
          description="打ち合わせを記録すると、議題・決定事項・仕様反映の経緯を一元管理できます。"
          action={{ label: "+ 打ち合わせを記録", onClick: handleAdd, testId: "empty-add-meeting-button" }}
          testId="meetings-empty-state"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {pageMeetings.map((m) => {
              const co = companies.find((c) => c.id === m.companyId);
              const cnt = decisions.filter((d) => !d.deletedAt && d.meetingId === m.id).length;
              return <MeetingCard key={m.id} meeting={m} company={co}
                decisionsCount={cnt}
                onClick={() => setDetailMeeting(m)}
                onEdit={() => handleEdit(m)}
                onDelete={() => handleDelete(m)} />;
            })}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3" data-testid="meetings-pagination">
              <button type="button"
                data-testid="meetings-prev-page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-1.5 rounded-full border border-rule text-xs text-ink-soft hover:text-ink disabled:opacity-30">
                ← 前へ
              </button>
              <span className="text-xs text-ink-soft font-mono" data-testid="meetings-page-info">
                {currentPage} / {totalPages}
              </span>
              <button type="button"
                data-testid="meetings-next-page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-1.5 rounded-full border border-rule text-xs text-ink-soft hover:text-ink disabled:opacity-30">
                次へ →
              </button>
            </div>
          )}
        </>
      )}

      {showForm && (
        <MeetingFormModal
          initial={editing}
          companies={companies}
          categories={categories}
          specItems={specItems}
          meetings={meetings}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditing(null); }}
          saveDisabled={saveDisabled}
        />
      )}

      {detailMeeting && (
        <MeetingDetailPage
          meeting={detailMeeting}
          company={companies.find((c) => c.id === detailMeeting.companyId)}
          companies={companies}
          decisions={decisions.filter((d) => !d.deletedAt && d.meetingId === detailMeeting.id)}
          specItems={specItems}
          onClose={() => setDetailMeeting(null)}
          onEdit={() => { const m = detailMeeting; setDetailMeeting(null); handleEdit(m); }}
          onChangeStatus={handleChangeDecisionStatus}
          onDeleteDecision={handleDeleteDecision}
          onReflect={handleOpenReflect}
          saveDisabled={saveDisabled}
        />
      )}

      {reflectingDecision && (
        <SpecReflectionDialog
          decision={reflectingDecision}
          specItem={specItems.find((s) => s.id === reflectingDecision.specItemId)}
          company={companies.find((c) => c.id === reflectingDecision.specCompanyId)}
          onConfirm={handleConfirmReflect}
          onClose={() => setReflectingDecision(null)}
          saveDisabled={saveDisabled}
        />
      )}
    </div>
  );
}

// ===== 7. 変更ログコンポーネント =====

// ---- Sprint 4 内部ユーティリティ ----

function deepCloneInline(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * アトミックな仕様反映処理 (src/utils/specReflection.js のミラー)
 * SpecItem 保存 → ChangeLog 保存 を順序実行し、失敗時はロールバックする。
 */
async function reflectToSpecInline(decision, reason, showToast) {
  if (!decision?.specItemId || !decision?.specCompanyId) {
    throw new Error("specItemId / specCompanyId が必要です");
  }
  const specItemsBefore = await loadSpecItemsFromStorage();
  const changeLogsBefore = await loadChangeLogsFromStorage();
  const item = specItemsBefore.find((i) => i.id === decision.specItemId);
  if (!item) throw new Error("対象の仕様項目が見つかりません");

  const previous = (item.values || []).find((v) => v.companyId === decision.specCompanyId);
  const previousValue = previous?.value ?? "";

  const now = new Date().toISOString();
  const newSpecValue = {
    companyId: decision.specCompanyId,
    value: String(decision.specValue ?? ""),
    meetingId: decision.meetingId,
    updatedAt: now,
  };
  const newItem = {
    ...item,
    values: [
      ...(item.values || []).filter((v) => v.companyId !== decision.specCompanyId),
      newSpecValue,
    ],
  };
  const newSpecItems = specItemsBefore.map((i) => (i.id === newItem.id ? newItem : i));
  const newChangeLog = buildChangeLogInline({
    specItemId: decision.specItemId,
    companyId: decision.specCompanyId,
    previousValue,
    newValue: decision.specValue ?? "",
    meetingId: decision.meetingId,
    reason,
  });

  // フェーズ 1: SpecItem 保存
  try {
    await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, newSpecItems, showToast);
  } catch (e) {
    showToast?.("error", "仕様の反映に失敗しました。元の状態のままです。");
    throw e;
  }

  // フェーズ 2: ChangeLog 保存 (失敗時 SpecItem をロールバック)
  try {
    await saveWithCapacityCheck(STORAGE_KEYS.CHANGE_LOGS, [...changeLogsBefore, newChangeLog], showToast);
  } catch (e) {
    try {
      await saveWithCapacityCheck(STORAGE_KEYS.SPEC_ITEMS, specItemsBefore, showToast);
    } catch { /* ロールバック失敗は別Toastで通知済み */ }
    showToast?.("error", "仕様の反映に失敗しました。元の状態に戻しました。");
    throw e;
  }

  return { specItem: newItem, changeLog: newChangeLog };
}

// ---- 仕様反映ダイアログ ----

export function SpecReflectionDialog({ decision, specItem, company, onConfirm, onClose, saveDisabled }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const titleId = useMemo(() => `spec-reflection-title-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const previousValue = useMemo(() => {
    if (!specItem) return "";
    const v = (specItem.values || []).find((sv) => sv.companyId === decision.specCompanyId);
    return v?.value ?? "";
  }, [specItem, decision.specCompanyId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason.trim() || undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(26,24,22,0.45)" }}
      role="dialog" aria-modal="true" aria-labelledby={titleId}
      data-testid="spec-reflection-dialog"
    >
      <form onSubmit={handleSubmit} noValidate
        className="bg-bg rounded-2xl max-w-lg w-full p-7"
        style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.22)", border: "1px solid var(--rule)" }}>
        <div className="flex items-baseline justify-between mb-4">
          <h2 id={titleId} className="text-lg text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            仕様を更新しますか？
          </h2>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest">Reflect</span>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex gap-3 items-baseline">
            <dt className="text-xs text-ink-soft w-24 shrink-0" style={{ letterSpacing: "0.08em" }}>仕様項目</dt>
            <dd className="text-ink" data-testid="spec-reflection-item-name">
              {specItem ? specItem.name : "[削除済み仕様項目]"}
            </dd>
          </div>
          <div className="flex gap-3 items-baseline">
            <dt className="text-xs text-ink-soft w-24 shrink-0" style={{ letterSpacing: "0.08em" }}>会社</dt>
            <dd className="text-ink" data-testid="spec-reflection-company-name">
              {company ? company.name : "[削除済み会社]"}
            </dd>
          </div>
          <div className="flex gap-3 items-baseline">
            <dt className="text-xs text-ink-soft w-24 shrink-0" style={{ letterSpacing: "0.08em" }}>変更前</dt>
            <dd className="text-ink-soft whitespace-pre-line" data-testid="spec-reflection-previous">
              {previousValue || "—"}
            </dd>
          </div>
          <div className="flex gap-3 items-baseline">
            <dt className="text-xs text-ink-soft w-24 shrink-0" style={{ letterSpacing: "0.08em" }}>変更後</dt>
            <dd className="text-ink whitespace-pre-line font-medium" data-testid="spec-reflection-new">
              {decision.specValue ?? ""}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <Field label="変更理由 (任意・ChangeLog に記録)" htmlFor="sr-reason" max={500} value={reason}>
            <input id="sr-reason" type="text"
              data-testid="spec-reflection-reason-input"
              value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
              className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust" />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting}
            data-testid="spec-reflection-cancel"
            className="px-5 py-2 rounded-full border border-rule text-ink-soft hover:bg-paper disabled:opacity-40">
            キャンセル
          </button>
          <button type="submit" disabled={submitting || saveDisabled || !specItem}
            data-testid="spec-reflection-confirm"
            className="px-6 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            ✅ 反映する
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- 変更ログタイムライン ----

const CHANGELOG_INITIAL_COUNT = 30;
const CHANGELOG_LOAD_MORE = 20;

function ChangeLogEntry({ log, specItem, company, meeting, onNavigateToMeeting }) {
  return (
    <article className="bg-paper border border-rule rounded-2xl p-5" data-testid={`change-log-entry-${log.id}`}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
          {specItem ? specItem.name : "[削除済み仕様項目]"}
          {company && <span className="text-xs text-ink-soft ml-2">/ {company.name}</span>}
          {!company && <span className="text-xs text-ink-soft ml-2">/ [削除済み会社]</span>}
        </h3>
        <span className="font-mono text-[11px] text-ink-soft" data-testid={`change-log-date-${log.id}`}>
          {(log.changedAt || "").slice(0, 10)}
        </span>
      </div>
      <div className="text-sm space-y-1">
        <div className="flex gap-3">
          <span className="text-xs text-ink-soft w-16 shrink-0" style={{ letterSpacing: "0.08em" }}>変更前</span>
          <span className="text-ink-soft whitespace-pre-line break-words">{log.previousValue || "—"}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-xs text-ink-soft w-16 shrink-0" style={{ letterSpacing: "0.08em" }}>変更後</span>
          <span className="text-ink whitespace-pre-line break-words font-medium">{log.newValue || "—"}</span>
        </div>
        {log.reason && (
          <div className="flex gap-3 mt-2 pt-2 border-t border-rule/60">
            <span className="text-xs text-ink-soft w-16 shrink-0" style={{ letterSpacing: "0.08em" }}>理由</span>
            <span className="text-ink-soft">{log.reason}</span>
          </div>
        )}
      </div>
      {meeting && (
        <div className="mt-3 pt-3 border-t border-rule/60 flex items-center justify-between">
          <span className="text-xs text-ink-soft">
            <span className="font-serif-en uppercase text-[10px] tracking-widest mr-2 opacity-70">From</span>
            {meeting.title}
          </span>
          {onNavigateToMeeting && (
            <button type="button"
              data-testid={`change-log-meeting-link-${log.id}`}
              onClick={() => onNavigateToMeeting(meeting)}
              className="text-xs px-3 py-1 rounded-full border border-rule text-ink-soft hover:text-ink hover:border-wood-deep">
              打ち合わせを開く →
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function ChangeLogsView() {
  const [companies, setCompanies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [specItems, setSpecItems] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [logs, setLogs] = useState(null);

  const [companyFilter, setCompanyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(CHANGELOG_INITIAL_COUNT);

  const reload = useCallback(async () => {
    setCompanies(await loadCompaniesFromStorage());
    setCategories(await loadCategoriesFromStorage());
    setSpecItems(await loadSpecItemsFromStorage());
    setMeetings(await loadMeetingsFromStorage());
    setLogs(await loadChangeLogsFromStorage());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (logs === null) return <Spinner label="変更ログを読み込み中..." />;

  // sortChangeLogsDesc 相当 (changedAt 降順)
  const sorted = [...logs].sort((a, b) =>
    (b.changedAt || "").localeCompare(a.changedAt || "")
  );

  const filtered = sorted.filter((l) => {
    if (companyFilter !== "all" && l.companyId !== companyFilter) return false;
    if (categoryFilter !== "all") {
      const item = specItems.find((s) => s.id === l.specItemId);
      if (!item || item.categoryId !== categoryFilter) return false;
    }
    if (dateFrom) {
      const d = (l.changedAt || "").slice(0, 10);
      if (d < dateFrom) return false;
    }
    if (dateTo) {
      const d = (l.changedAt || "").slice(0, 10);
      if (d > dateTo) return false;
    }
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Sprint 4 動作確認チェックリスト「ChangeLog 削除UI なし」のために、UI 側に削除ボタンを一切置かない
  // (改ざん防止 - Spec.md §3-4)

  return (
    <div data-testid="change-logs-view">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            変更ログ
          </h2>
          <p className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mt-1">
            Change Log / {filtered.length} entries
          </p>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="bg-paper border border-rule rounded-2xl p-4 mb-6 no-print">
          <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-3">Filters</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label htmlFor="cl-company" className="text-ink-soft" style={{ letterSpacing: "0.08em" }}>会社</label>
              <select id="cl-company" data-testid="change-log-filter-company"
                value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
                <option value="all">すべて</option>
                {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cl-category" className="text-ink-soft" style={{ letterSpacing: "0.08em" }}>カテゴリ</label>
              <select id="cl-category" data-testid="change-log-filter-category"
                value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
                <option value="all">すべて</option>
                {categories.filter((c) => !c.deletedAt).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cl-from" className="text-ink-soft" style={{ letterSpacing: "0.08em" }}>開始日</label>
              <input id="cl-from" type="date" data-testid="change-log-filter-from"
                value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 rounded-lg border border-rule bg-bg text-sm font-mono focus-visible:outline focus-visible:outline-2 ring-rust" />
            </div>
            <div>
              <label htmlFor="cl-to" className="text-ink-soft" style={{ letterSpacing: "0.08em" }}>終了日</label>
              <input id="cl-to" type="date" data-testid="change-log-filter-to"
                value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 rounded-lg border border-rule bg-bg text-sm font-mono focus-visible:outline focus-visible:outline-2 ring-rust" />
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon="📜"
          title={logs.length === 0 ? "まだ仕様の変更がありません" : "条件に一致する変更ログがありません"}
          description={logs.length === 0
            ? "仕様比較タブからセルを編集するか、打ち合わせから「仕様に反映」すると履歴が記録されます。"
            : "フィルター条件を変更してください。"}
          testId="change-logs-empty-state"
        />
      ) : (
        <>
          <div className="space-y-4" data-testid="change-log-timeline">
            {visible.map((l) => (
              <ChangeLogEntry key={l.id} log={l}
                specItem={specItems.find((s) => s.id === l.specItemId)}
                company={companies.find((c) => c.id === l.companyId)}
                meeting={meetings.find((m) => m.id === l.meetingId)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button type="button"
                data-testid="change-log-load-more"
                onClick={() => setVisibleCount((n) => n + CHANGELOG_LOAD_MORE)}
                className="px-5 py-2 rounded-full border border-rule text-sm text-ink-soft hover:text-ink hover:border-wood-deep">
                さらに表示 ({filtered.length - visibleCount} 件)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===== 8. ダッシュボード + 全文検索 =====

// ---- Sprint 5 内部ユーティリティ (src/utils/dashboard.js / search.js のミラー) ----

const SEARCH_TARGETS_INLINE = {
  Meeting:  ["agenda", "summary", "location"],
  Decision: ["content", "note", "specValue"],
  SpecItem: ["name"],
  Company:  ["name", "contact", "note"],
};

function computeSummaryInline({ companies = [], meetings = [], decisions = [] }) {
  const active = companies.filter((c) => !c.deletedAt);
  const byStatus = (s) => active.filter((c) => c.status === s).length;
  return {
    considering: byStatus("considering"),
    candidate:   byStatus("candidate"),
    contracted:  byStatus("contracted"),
    rejected:    byStatus("rejected"),
    meetingCount: meetings.filter((m) => !m.deletedAt).length,
    pendingCount: decisions.filter((d) => !d.deletedAt && d.status === "pending").length,
    activeCompanyCount: active.length,
  };
}

function hasActiveCandidatesInline(companies) {
  return companies.filter((c) => !c.deletedAt)
    .some((c) => c.status === "considering" || c.status === "candidate");
}

function recentMeetingsInline(meetings, limit = 5) {
  return [...meetings]
    .filter((m) => !m.deletedAt)
    .sort((a, b) => {
      const ax = a.date || ""; const bx = b.date || "";
      if (ax === bx) return (b.createdAt || "").localeCompare(a.createdAt || "");
      return bx.localeCompare(ax);
    })
    .slice(0, limit);
}

function recentDecisionsInline(decisions, limit = 5) {
  return decisions
    .filter((d) => !d.deletedAt)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

function pendingActionsInline(decisions, limit = 50) {
  return decisions
    .filter((d) => !d.deletedAt && d.status === "pending")
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, limit);
}

function normalizeSearch(s) { return String(s ?? "").toLowerCase(); }

function fieldMatchesSearch(entity, fields, q) {
  return fields.some((f) => normalizeSearch(entity[f]).includes(q));
}

function runGlobalSearchInline({ meetings = [], decisions = [], specItems = [], companies = [] }, query) {
  const q = normalizeSearch(query);
  if (q.length === 0) {
    return { meetings: [], decisions: [], specItems: [], companies: [], totalCount: 0 };
  }
  const mm = meetings.filter((e) => !e.deletedAt && fieldMatchesSearch(e, SEARCH_TARGETS_INLINE.Meeting, q));
  const md = decisions.filter((e) => !e.deletedAt && fieldMatchesSearch(e, SEARCH_TARGETS_INLINE.Decision, q));
  const ms = specItems.filter((e) => !e.deletedAt && fieldMatchesSearch(e, SEARCH_TARGETS_INLINE.SpecItem, q));
  const mc = companies.filter((e) => !e.deletedAt && fieldMatchesSearch(e, SEARCH_TARGETS_INLINE.Company, q));
  return {
    meetings: mm, decisions: md, specItems: ms, companies: mc,
    totalCount: mm.length + md.length + ms.length + mc.length,
  };
}

function splitForHighlightInline(text, query) {
  const s = String(text ?? ""); const q = String(query ?? "");
  if (q.length === 0 || s.length === 0) return [{ text: s, match: false }];
  const lower = s.toLowerCase(); const lq = q.toLowerCase();
  const out = []; let i = 0;
  while (i < s.length) {
    const idx = lower.indexOf(lq, i);
    if (idx === -1) { out.push({ text: s.slice(i), match: false }); break; }
    if (idx > i) out.push({ text: s.slice(i, idx), match: false });
    out.push({ text: s.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return out;
}

// ---- ハイライト表示用コンポーネント ----

function Highlight({ text, query }) {
  const segments = splitForHighlightInline(text, query);
  return (
    <>
      {segments.map((seg, i) =>
        seg.match
          ? <mark key={i} className="bg-wood/40 text-ink rounded px-0.5">{seg.text}</mark>
          : <React.Fragment key={i}>{seg.text}</React.Fragment>
      )}
    </>
  );
}

// ---- ダッシュボードビュー ----

const SUMMARY_CARDS = [
  { key: "considering",  label: "検討中",       targetTab: "companies",       filter: "considering" },
  { key: "candidate",    label: "候補",         targetTab: "companies",       filter: "candidate" },
  { key: "meetingCount", label: "打ち合わせ",   targetTab: "meetings",        filter: "all" },
  { key: "pendingCount", label: "未確定事項",   targetTab: "meetings",        filter: "all" },
];

export function DashboardView({ onNavigate }) {
  const [companies, setCompanies] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [decisions, setDecisions] = useState([]);

  const reload = useCallback(async () => {
    setCompanies(await loadCompaniesFromStorage());
    setMeetings(await loadMeetingsFromStorage());
    setDecisions(await loadDecisionsFromStorage());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (companies === null) return <Spinner label="ダッシュボードを読み込み中..." />;

  const summary = computeSummaryInline({ companies, meetings, decisions });
  const active = companies.filter((c) => !c.deletedAt);
  const hasCandidates = hasActiveCandidatesInline(companies);

  // 会社0件 → CTA Empty State
  if (active.length === 0) {
    return (
      <EmptyState
        icon="🏠"
        title="まず会社を登録してはじめましょう"
        description="ハウスメーカー・工務店を登録すると、打ち合わせと仕様比較の管理を開始できます。"
        action={{
          label: "会社を登録する",
          onClick: () => onNavigate?.("companies"),
          testId: "dashboard-cta-add-company",
        }}
        testId="dashboard-empty-no-companies"
      />
    );
  }

  // 全社落選/契約済み → E13
  if (!hasCandidates) {
    return (
      <EmptyState
        icon="🌿"
        title="現在候補会社がありません"
        description="検討中・候補ステータスの会社がありません。新しい候補を追加するか、既存の会社のステータスを変更してください。"
        action={{
          label: "会社を登録する",
          onClick: () => onNavigate?.("companies"),
          testId: "dashboard-e13-cta",
        }}
        testId="dashboard-no-active-candidates"
      />
    );
  }

  const recent5Meetings = recentMeetingsInline(meetings, 5);
  const recent5Decisions = recentDecisionsInline(decisions, 5);
  const pending = pendingActionsInline(decisions);

  const findCompany = (id) => companies.find((c) => c.id === id);
  const findMeeting = (id) => meetings.find((m) => m.id === id);

  return (
    <div data-testid="dashboard-view">
      <div className="mb-6">
        <h2 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
          ダッシュボード
        </h2>
        <p className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mt-1">
          Overview
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="dashboard-summary">
        {SUMMARY_CARDS.map((card) => {
          const value = summary[card.key];
          return (
            <button key={card.key} type="button"
              data-testid={`summary-card-${card.key}`}
              onClick={() => onNavigate?.(card.targetTab, { statusFilter: card.filter })}
              className="bg-paper border border-rule rounded-2xl p-5 text-left hover:border-wood-deep transition focus-visible:outline focus-visible:outline-2 ring-rust">
              <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep">
                {card.label}
              </p>
              <p className="mt-2 text-3xl text-ink font-mono" data-testid={`summary-value-${card.key}`}>
                {value}
              </p>
              <p className="mt-1 text-[10px] text-ink-soft">
                {card.key === "meetingCount" ? "回" : card.key === "pendingCount" ? "件" : "社"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Pending Actions */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            ⚠ アクションが必要な項目
          </h3>
          <span className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep">
            Pending / {pending.length}
          </span>
        </div>
        {pending.length === 0 ? (
          <p className="text-xs text-ink-soft text-center py-4 border border-dashed border-rule rounded-xl">
            未確定の決定事項はありません
          </p>
        ) : (
          <div className="space-y-2" data-testid="pending-action-list">
            {pending.slice(0, 5).map((d) => {
              const meeting = findMeeting(d.meetingId);
              const company = meeting ? findCompany(meeting.companyId) : undefined;
              return (
                <div key={d.id} className="bg-paper border border-rule rounded-xl p-3 flex items-start gap-3"
                     data-testid={`pending-item-${d.id}`}>
                  <DecisionStatusBadge status={d.status} testId={`pending-status-${d.id}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{d.content}</p>
                    <p className="text-[11px] text-ink-soft mt-0.5">
                      {company ? company.name : "[削除済み会社]"}
                      {meeting && <> <span className="opacity-50 mx-1">·</span> <span className="font-mono">{meeting.date}</span></>}
                    </p>
                  </div>
                  {meeting && (
                    <button type="button"
                      data-testid={`pending-go-meeting-${d.id}`}
                      onClick={() => onNavigate?.("meetings", { meetingId: meeting.id })}
                      className="text-[11px] px-3 py-1 rounded-full border border-rule text-ink-soft hover:text-ink whitespace-nowrap">
                      確認する →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 直近の打ち合わせ + 決定事項 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
              📅 直近の打ち合わせ
            </h3>
            <button type="button" onClick={() => onNavigate?.("meetings")}
              data-testid="recent-meetings-see-all"
              className="text-[11px] text-ink-soft hover:text-ink">
              全件を見る →
            </button>
          </div>
          {recent5Meetings.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-4 border border-dashed border-rule rounded-xl">
              打ち合わせ記録がありません
            </p>
          ) : (
            <ul className="space-y-2" data-testid="recent-meetings-list">
              {recent5Meetings.map((m) => {
                const co = findCompany(m.companyId);
                return (
                  <li key={m.id}>
                    <button type="button"
                      data-testid={`recent-meeting-${m.id}`}
                      onClick={() => onNavigate?.("meetings", { meetingId: m.id })}
                      className="w-full text-left bg-paper border border-rule rounded-xl p-3 hover:border-wood-deep transition">
                      <p className="text-sm text-ink truncate" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
                        {m.title}
                      </p>
                      <p className="text-[11px] text-ink-soft mt-0.5">
                        <span className="font-mono">{m.date}</span>
                        {co && <> <span className="opacity-50 mx-1">·</span> {co.name}</>}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
              ✓ 直近の決定事項
            </h3>
            <button type="button" onClick={() => onNavigate?.("change-logs")}
              data-testid="recent-decisions-see-all"
              className="text-[11px] text-ink-soft hover:text-ink">
              全件を見る →
            </button>
          </div>
          {recent5Decisions.length === 0 ? (
            <p className="text-xs text-ink-soft text-center py-4 border border-dashed border-rule rounded-xl">
              決定事項がありません
            </p>
          ) : (
            <ul className="space-y-2" data-testid="recent-decisions-list">
              {recent5Decisions.map((d) => {
                const meeting = findMeeting(d.meetingId);
                const co = meeting ? findCompany(meeting.companyId) : undefined;
                return (
                  <li key={d.id} className="bg-paper border border-rule rounded-xl p-3"
                      data-testid={`recent-decision-${d.id}`}>
                    <div className="flex items-start gap-2">
                      <DecisionStatusBadge status={d.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{d.content}</p>
                        <p className="text-[11px] text-ink-soft mt-0.5">
                          {co ? co.name : "—"}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ---- グローバル検索バー (ヘッダーに統合) ----

const SEARCH_DEBOUNCE_MS = 300;

export function GlobalSearchPanel({ data, query, onNavigate, onClose }) {
  const result = useMemo(() => runGlobalSearchInline(data, query), [data, query]);
  const q = query.trim();
  if (q.length === 0) return null;

  return (
    <div
      data-testid="global-search-panel"
      className="absolute top-full left-0 right-0 mt-2 bg-bg border border-rule rounded-2xl shadow-2xl overflow-hidden z-40 max-h-[70vh] flex flex-col"
      style={{ boxShadow: "0 16px 48px rgba(26,24,22,0.2)" }}
    >
      <div className="px-4 py-2 border-b border-rule bg-paper flex items-center justify-between">
        <span className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep">
          Search results: {result.totalCount}
        </span>
        <button type="button" onClick={onClose} data-testid="global-search-close"
          aria-label="検索結果を閉じる"
          className="text-xs text-ink-soft hover:text-ink">
          ✕
        </button>
      </div>
      <div className="overflow-y-auto p-3 space-y-3">
        {result.totalCount === 0 ? (
          <p className="text-sm text-ink-soft text-center py-6" data-testid="global-search-empty">
            「{q}」に一致する記録が見つかりません
          </p>
        ) : (
          <>
            <SearchResultSection title="会社" icon="🏢" entries={result.companies} testIdPrefix="search-company"
              renderItem={(c) => (
                <button key={c.id} type="button" data-testid={`search-company-${c.id}`}
                  onClick={() => onNavigate?.("companies")}
                  className="w-full text-left p-2 rounded hover:bg-paper">
                  <p className="text-sm text-ink"><Highlight text={c.name} query={q} /></p>
                  <p className="text-[11px] text-ink-soft"><Highlight text={c.contact} query={q} /></p>
                </button>
              )} />
            <SearchResultSection title="打ち合わせ" icon="📅" entries={result.meetings} testIdPrefix="search-meeting"
              renderItem={(m) => (
                <button key={m.id} type="button" data-testid={`search-meeting-${m.id}`}
                  onClick={() => onNavigate?.("meetings", { meetingId: m.id })}
                  className="w-full text-left p-2 rounded hover:bg-paper">
                  <p className="text-sm text-ink truncate">
                    <Highlight text={m.title || m.agenda} query={q} />
                  </p>
                  <p className="text-[11px] text-ink-soft truncate">
                    <Highlight text={m.agenda} query={q} />
                  </p>
                </button>
              )} />
            <SearchResultSection title="決定事項" icon="✓" entries={result.decisions} testIdPrefix="search-decision"
              renderItem={(d) => (
                <button key={d.id} type="button" data-testid={`search-decision-${d.id}`}
                  onClick={() => onNavigate?.("meetings", { meetingId: d.meetingId })}
                  className="w-full text-left p-2 rounded hover:bg-paper">
                  <p className="text-sm text-ink truncate"><Highlight text={d.content} query={q} /></p>
                  {d.specValue && (
                    <p className="text-[11px] text-ink-soft truncate">
                      → <Highlight text={d.specValue} query={q} />
                    </p>
                  )}
                </button>
              )} />
            <SearchResultSection title="仕様項目" icon="📋" entries={result.specItems} testIdPrefix="search-spec-item"
              renderItem={(s) => (
                <button key={s.id} type="button" data-testid={`search-spec-item-${s.id}`}
                  onClick={() => onNavigate?.("spec-comparison")}
                  className="w-full text-left p-2 rounded hover:bg-paper">
                  <p className="text-sm text-ink"><Highlight text={s.name} query={q} /></p>
                </button>
              )} />
          </>
        )}
      </div>
    </div>
  );
}

function SearchResultSection({ title, icon, entries, testIdPrefix, renderItem }) {
  if (entries.length === 0) return null;
  return (
    <div data-testid={`${testIdPrefix}-section`}>
      <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-1 px-2">
        {icon} {title} ({entries.length})
      </p>
      <div className="space-y-1">{entries.map(renderItem)}</div>
    </div>
  );
}

// ===== 9. 設定・Import/Export =====

// ---- Sprint 6 内部ユーティリティ (src/utils/csv.js / exportImport.js のミラー) ----

function escapeCsvValueInline(value) {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/[,"\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildCsvInline(rows) {
  return rows.map((r) => r.map(escapeCsvValueInline).join(",")).join("\r\n");
}

function buildSpecComparisonCsvInline({ companies, categories, specItems, mode = "all" }) {
  const header = ["カテゴリ", "仕様項目", ...companies.map((c) => c.name)];
  const rows = [header];
  const activeCategories = categories
    .filter((c) => !c.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const cat of activeCategories) {
    const items = specItems
      .filter((i) => !i.deletedAt && i.categoryId === cat.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const item of items) {
      const values = companies.map((co) => {
        const v = (item.values || []).find((sv) => sv.companyId === co.id);
        return v?.value ?? "";
      });
      if (mode === "confirmed" && values.every((v) => !v)) continue;
      rows.push([cat.name, item.name, ...values]);
    }
  }
  return buildCsvInline(rows);
}

const EXPORT_KEY_MAP_INLINE = {
  companies:       "companies",
  categories:      "categories",
  spec_items:      "specItems",
  spec_item_notes: "specItemNotes",
  meetings:        "meetings",
  decisions:       "decisions",
  change_logs:     "changeLogs",
};
const IMPORT_KEY_MAP_INLINE = Object.fromEntries(
  Object.entries(EXPORT_KEY_MAP_INLINE).map(([s, j]) => [j, s])
);

async function exportAllJSONInline() {
  const out = {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  for (const [storageKey, jsonField] of Object.entries(EXPORT_KEY_MAP_INLINE)) {
    const raw = await storage.getItem(storageKey);
    try {
      const v = raw ? JSON.parse(raw) : [];
      out[jsonField] = Array.isArray(v) ? v : [];
    } catch { out[jsonField] = []; }
  }
  return out;
}

function validateImportFileInline(json) {
  if (json === null || json === undefined) return "JSONの形式が不正です";
  if (typeof json !== "object" || Array.isArray(json)) return "JSONの形式が不正です";
  if (json.version === undefined) return "JSONの形式が不正です (version フィールドがありません)";
  if (json.version !== EXPORT_FORMAT_VERSION) {
    return `バージョン不一致: インポートファイル(${json.version}) / 現在(${EXPORT_FORMAT_VERSION})。互換性のないデータは無視されます。`;
  }
  return null;
}

const FORBIDDEN_PROTO_KEYS_INLINE = new Set(["__proto__", "constructor", "prototype"]);

function sanitizeEntityInline(entity) {
  if (!entity || typeof entity !== "object") return entity;
  const out = {};
  for (const key of Object.keys(entity)) {
    if (FORBIDDEN_PROTO_KEYS_INLINE.has(key)) continue;
    out[key] = entity[key];
  }
  return out;
}

function resolveAllIdConflictsInline(importJson, existing, mode) {
  const baseLists = {};
  for (const storageKey of Object.values(IMPORT_KEY_MAP_INLINE)) {
    baseLists[storageKey] = mode === "merge" ? [...(existing[storageKey] || [])] : [];
  }
  const existingIds = {};
  for (const k of Object.keys(baseLists)) {
    existingIds[k] = new Set(baseLists[k].map((e) => e?.id).filter(Boolean));
  }
  const newCollections = {};
  const remap = {};
  for (const [jsonField, list] of Object.entries(importJson)) {
    if (jsonField === "version" || jsonField === "exportedAt") continue;
    const storageKey = IMPORT_KEY_MAP_INLINE[jsonField];
    if (!storageKey) continue;
    if (!Array.isArray(list)) continue;
    const resolved = [];
    const fieldRemap = {};
    for (const rawItem of list) {
      const sanitized = sanitizeEntityInline(rawItem);
      if (!sanitized || !sanitized.id) continue;
      let updated = sanitized;
      if (existingIds[storageKey].has(sanitized.id)) {
        updated = { ...sanitized, id: newId() };
        fieldRemap[sanitized.id] = updated.id;
      }
      existingIds[storageKey].add(updated.id);
      resolved.push(updated);
    }
    newCollections[storageKey] = resolved;
    remap[storageKey] = fieldRemap;
  }
  const FK_MAPPING = {
    spec_items:      { categoryId: "categories" },
    spec_item_notes: { specItemId: "spec_items", companyId: "companies" },
    meetings:        { companyId: "companies" },
    decisions:       { meetingId: "meetings", specItemId: "spec_items", specCompanyId: "companies" },
    change_logs:     { specItemId: "spec_items", companyId: "companies", meetingId: "meetings" },
  };
  for (const [storageKey, fields] of Object.entries(FK_MAPPING)) {
    const collection = newCollections[storageKey];
    if (!collection) continue;
    for (const item of collection) {
      for (const [field, refKey] of Object.entries(fields)) {
        const mapping = remap[refKey];
        if (mapping && item[field] && mapping[item[field]]) {
          item[field] = mapping[item[field]];
        }
      }
    }
    if (storageKey === "spec_items") {
      for (const item of collection) {
        if (!Array.isArray(item.values)) continue;
        item.values = item.values.map((v) => ({
          ...v,
          companyId: remap.companies?.[v.companyId] || v.companyId,
          meetingId: v.meetingId && remap.meetings?.[v.meetingId]
            ? remap.meetings[v.meetingId] : v.meetingId,
        }));
      }
    }
  }
  const result = { ...baseLists };
  for (const [storageKey, collection] of Object.entries(newCollections)) {
    if (mode === "merge") {
      result[storageKey] = [...(result[storageKey] || []), ...collection];
    } else {
      result[storageKey] = collection;
    }
  }
  return result;
}

async function importAllInline(json, mode, { allowVersionMismatch = false } = {}) {
  const err = validateImportFileInline(json);
  if (err) {
    if (!allowVersionMismatch || !/バージョン不一致/.test(err)) {
      throw new Error(err);
    }
  }
  const existingByStorage = {};
  const snapshotByStorage = {};
  for (const storageKey of Object.values(IMPORT_KEY_MAP_INLINE)) {
    const raw = await storage.getItem(storageKey);
    snapshotByStorage[storageKey] = raw;
    try {
      const v = raw ? JSON.parse(raw) : [];
      existingByStorage[storageKey] = Array.isArray(v) ? v : [];
    } catch { existingByStorage[storageKey] = []; }
  }
  const resolved = resolveAllIdConflictsInline(json, existingByStorage, mode);
  const writtenKeys = [];
  try {
    for (const [storageKey, list] of Object.entries(resolved)) {
      await storage.setItem(storageKey, JSON.stringify(list));
      writtenKeys.push(storageKey);
    }
    return { resolved };
  } catch (e) {
    for (const storageKey of writtenKeys) {
      try {
        if (snapshotByStorage[storageKey] === null || snapshotByStorage[storageKey] === undefined) {
          await storage.removeItem(storageKey);
        } else {
          await storage.setItem(storageKey, snapshotByStorage[storageKey]);
        }
      } catch { /* ignore */ }
    }
    throw e;
  }
}

async function computeStorageUsageInline() {
  const result = { keys: {}, total: 0 };
  for (const key of Object.values(STORAGE_KEYS)) {
    const raw = await storage.getItem(key);
    const bytes = raw ? new TextEncoder().encode(raw).length : 0;
    result.keys[key] = bytes;
    result.total += bytes;
  }
  return result;
}

// ---- ダウンロード/ファイル選択ヘルパー ----

function triggerDownload(filename, content, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ---- ストレージ使用量カード ----

function StorageUsageCard({ usage }) {
  if (!usage) return null;
  const warningLimit = STORAGE_WARNING_BYTES;
  return (
    <div className="bg-paper border border-rule rounded-2xl p-5" data-testid="storage-usage-card">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
          ストレージ使用量
        </h3>
        <span className="font-mono text-xs text-ink-soft">
          <span data-testid="storage-usage-total">{usage.total.toLocaleString()}</span> bytes
        </span>
      </div>
      <div className="space-y-2 text-xs">
        {Object.entries(usage.keys).map(([key, bytes]) => {
          const pct = Math.min(100, Math.round((bytes / warningLimit) * 100));
          const tone = bytes > warningLimit ? "bg-rust" : bytes > warningLimit / 2 ? "bg-wood" : "bg-sage";
          return (
            <div key={key} data-testid={`storage-usage-${key}`}>
              <div className="flex justify-between text-ink-soft mb-1">
                <span className="font-mono">{key}</span>
                <span className="font-mono">{bytes.toLocaleString()} B</span>
              </div>
              <div className="w-full h-1.5 bg-rule/50 rounded-full overflow-hidden">
                <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-ink-soft">
        警告閾値: {warningLimit.toLocaleString()} bytes / キー
      </p>
    </div>
  );
}

// ---- アーカイブビュー (論理削除済みデータ表示) ----

function ArchiveSection({ title, entries, renderItem, testIdPrefix }) {
  if (entries.length === 0) return null;
  return (
    <section data-testid={`archive-section-${testIdPrefix}`}>
      <h4 className="text-sm text-ink mt-4 mb-2" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
        {title} ({entries.length})
      </h4>
      <ul className="space-y-1 text-xs text-ink-soft">
        {entries.map((e) => (
          <li key={e.id} className="bg-paper/50 border border-rule rounded px-3 py-2"
              data-testid={`archive-${testIdPrefix}-${e.id}`}>
            {renderItem(e)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- 設定ビュー ----

export function SettingsView({ saveDisabled, onClose }) {
  const showToast = useToast();
  const showConfirm = useConfirm();

  const [usage, setUsage] = useState(null);
  const [meta, setMeta] = useState(null);
  const [archived, setArchived] = useState(null);
  const [importMode, setImportMode] = useState("merge");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setUsage(await computeStorageUsageInline());
    setMeta(await loadMeta());
    const [cos, cats, items, meetings] = await Promise.all([
      loadCompaniesFromStorage(),
      loadCategoriesFromStorage(),
      loadSpecItemsFromStorage(),
      loadMeetingsFromStorage(),
    ]);
    setArchived({
      companies: cos.filter((c) => c.deletedAt),
      categories: cats.filter((c) => c.deletedAt),
      specItems: items.filter((i) => i.deletedAt),
      meetings: meetings.filter((m) => m.deletedAt),
    });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleExportJson = async () => {
    try {
      const data = await exportAllJSONInline();
      const filename = `takomaru-specboard-${data.exportedAt.slice(0, 10)}.json`;
      triggerDownload(filename, JSON.stringify(data, null, 2), "application/json");
      showToast("success", "JSON をエクスポートしました");
    } catch (e) {
      showToast("error", "エクスポートに失敗しました");
      console.error(e);
    }
  };

  const handleExportCsv = async (mode) => {
    try {
      const [cos, cats, items] = await Promise.all([
        loadCompaniesFromStorage(),
        loadCategoriesFromStorage(),
        loadSpecItemsFromStorage(),
      ]);
      const activeCos = cos.filter((c) => !c.deletedAt);
      const csv = buildSpecComparisonCsvInline({
        companies: activeCos, categories: cats, specItems: items, mode,
      });
      const filename = `spec-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
      // RFC 4180: BOM 付きで Excel での文字化けを回避
      triggerDownload(filename, "﻿" + csv, "text/csv");
      showToast("success", "CSV をエクスポートしました");
    } catch (e) {
      showToast("error", "CSVエクスポートに失敗しました");
      console.error(e);
    }
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await readFileAsText(file);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { showToast("error", "JSONの解析に失敗しました"); return; }

      const error = validateImportFileInline(parsed);
      if (error) {
        if (/バージョン不一致/.test(error)) {
          showToast("warning", error);
          const ok = await showConfirm(
            "バージョン不一致を検出しました",
            "続行しますか？ 互換性のないデータは無視される可能性があります。"
          );
          if (!ok) return;
          await importAllInline(parsed, importMode, { allowVersionMismatch: true });
        } else {
          showToast("error", error);
          return;
        }
      } else {
        if (importMode === "overwrite") {
          const ok = await showConfirm(
            "上書きインポートしますか？",
            "既存のデータは全て上書きされます (元に戻せません)。"
          );
          if (!ok) return;
        }
        await importAllInline(parsed, importMode);
      }

      await reload();
      showToast("success", "インポートが完了しました");
    } catch (e) {
      console.error(e);
      showToast("error", "インポートに失敗しました。データは変更されていません");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  };

  if (!usage || !archived) return <Spinner label="設定を読み込み中..." />;

  return (
    <div data-testid="settings-view">
      <div className="flex items-baseline justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            設定
          </h2>
          <p className="font-serif-en text-[11px] uppercase tracking-widest text-wood-deep mt-1">
            Settings
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} data-testid="settings-close"
            className="text-sm text-ink-soft hover:text-ink">
            ← 戻る
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* データ管理 */}
        <section className="bg-paper border border-rule rounded-2xl p-5">
          <h3 className="text-base text-ink mb-1" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            データ管理
          </h3>
          <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-3">
            Data Management
          </p>
          <div className="space-y-3">
            <button type="button" onClick={handleExportJson}
              data-testid="export-json-button"
              disabled={saveDisabled}
              className="w-full px-4 py-2 rounded-full bg-rust text-white text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
              📥 JSON でエクスポート (全件)
            </button>
            <div>
              <label htmlFor="import-mode" className="text-xs text-ink-soft block mb-1" style={{ letterSpacing: "0.08em" }}>
                インポートモード
              </label>
              <select id="import-mode" data-testid="import-mode-select"
                value={importMode} onChange={(e) => setImportMode(e.target.value)}
                disabled={saveDisabled || importing}
                className="w-full px-3 py-2 rounded-lg border border-rule bg-bg text-sm focus-visible:outline focus-visible:outline-2 ring-rust">
                <option value="merge">マージ (既存に追加)</option>
                <option value="overwrite">上書き (既存を全て置換)</option>
              </select>
            </div>
            <input ref={fileInputRef} type="file" accept=".json,application/json"
              data-testid="import-file-input"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
              disabled={saveDisabled || importing}
              className="hidden" />
            <button type="button"
              data-testid="import-json-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saveDisabled || importing}
              className="w-full px-4 py-2 rounded-full border border-rule text-sm text-ink hover:bg-rule/40 disabled:opacity-40 disabled:cursor-not-allowed">
              📤 JSON からインポート
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-rule">
            <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-2">CSV Export</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => handleExportCsv("all")}
                data-testid="export-csv-all-button"
                className="px-3 py-1.5 rounded-full border border-rule text-xs text-ink-soft hover:text-ink">
                全件
              </button>
              <button type="button" onClick={() => handleExportCsv("confirmed")}
                data-testid="export-csv-confirmed-button"
                className="px-3 py-1.5 rounded-full border border-rule text-xs text-ink-soft hover:text-ink">
                確定済みのみ
              </button>
            </div>
          </div>
        </section>

        {/* ストレージ使用量 */}
        <div className="space-y-6">
          <StorageUsageCard usage={usage} />

          {/* 累積保存回数 */}
          <div className="bg-paper border border-rule rounded-2xl p-5" data-testid="save-count-card">
            <h3 className="text-base text-ink mb-1" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
              累積保存回数
            </h3>
            <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-3">
              Save Count
            </p>
            <p className="text-3xl font-mono text-ink" data-testid="save-count-value">
              {meta?.saveCount ?? 0}
            </p>
            <p className="text-[11px] text-ink-soft mt-1">
              50回ごとに JSON バックアップを推奨します
            </p>
          </div>

          {/* 印刷 */}
          <div className="bg-paper border border-rule rounded-2xl p-5" data-testid="print-card">
            <h3 className="text-base text-ink mb-1" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
              印刷
            </h3>
            <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-3">
              Print
            </p>
            <button type="button" onClick={handlePrint}
              data-testid="print-button"
              className="px-4 py-2 rounded-full border border-rule text-sm text-ink hover:bg-rule/40">
              🖨 印刷プレビューを開く
            </button>
            <p className="text-[11px] text-ink-soft mt-2">
              現在のタブの内容を @media print 形式で印刷します
            </p>
          </div>
        </div>
      </div>

      {/* アーカイブ */}
      <section className="mt-8 bg-paper border border-rule rounded-2xl p-5" data-testid="archive-card">
        <h3 className="text-base text-ink mb-1" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
          アーカイブ (削除済みデータ)
        </h3>
        <p className="font-serif-en text-[10px] uppercase tracking-widest text-wood-deep mb-3">
          Archive
        </p>
        {(archived.companies.length === 0 && archived.categories.length === 0 &&
          archived.specItems.length === 0 && archived.meetings.length === 0) ? (
          <p className="text-xs text-ink-soft text-center py-4 border border-dashed border-rule rounded-xl">
            論理削除されたデータはありません
          </p>
        ) : (
          <div>
            <ArchiveSection title="会社" testIdPrefix="company"
              entries={archived.companies}
              renderItem={(c) => (
                <>
                  <span className="text-ink">{c.name}</span>
                  <span className="ml-2 font-mono">削除日: {(c.deletedAt || "").slice(0, 10)}</span>
                </>
              )} />
            <ArchiveSection title="カテゴリ" testIdPrefix="category"
              entries={archived.categories}
              renderItem={(c) => (
                <>
                  <span className="text-ink">{c.name}</span>
                  <span className="ml-2 font-mono">削除日: {(c.deletedAt || "").slice(0, 10)}</span>
                </>
              )} />
            <ArchiveSection title="仕様項目" testIdPrefix="spec-item"
              entries={archived.specItems}
              renderItem={(s) => (
                <>
                  <span className="text-ink">{s.name}</span>
                  <span className="ml-2 font-mono">削除日: {(s.deletedAt || "").slice(0, 10)}</span>
                </>
              )} />
            <ArchiveSection title="打ち合わせ" testIdPrefix="meeting"
              entries={archived.meetings}
              renderItem={(m) => (
                <>
                  <span className="text-ink">{m.title}</span>
                  <span className="ml-2 font-mono">削除日: {(m.deletedAt || "").slice(0, 10)}</span>
                </>
              )} />
          </div>
        )}
      </section>
    </div>
  );
}

// ===== 10. メインApp・ルーティング =====

function Header({ searchQuery, onSearchChange, onSettingsClick, saveDisabled, onSearchNavigate, searchEnabled }) {
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [open, setOpen] = useState(false);
  const [searchData, setSearchData] = useState(null);

  // 300ms デバウンス (TC_104)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // クエリが非空になったらストレージから検索対象データをロード + パネル展開
  useEffect(() => {
    if (!searchEnabled) return;
    if (debouncedQuery.trim().length === 0) {
      setSearchData(null);
      setOpen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [companies, meetings, decisions, specItems] = await Promise.all([
        loadCompaniesFromStorage(),
        loadMeetingsFromStorage(),
        loadDecisionsFromStorage(),
        loadSpecItemsFromStorage(),
      ]);
      if (cancelled) return;
      setSearchData({ companies, meetings, decisions, specItems });
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery, searchEnabled]);

  const handleNavigate = (...args) => {
    setOpen(false);
    onSearchChange("");
    onSearchNavigate?.(...args);
  };

  return (
    <header className="bg-bg border-b border-rule sticky top-0 z-30 no-print">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h1 className="shrink-0 flex items-baseline gap-2">
          <span className="text-xl text-ink" style={{ fontFamily: "var(--jp-serif)", fontWeight: 600 }}>
            住宅会社仕様比較ツール
          </span>
          <span className="font-serif-en text-xs uppercase text-wood-deep tracking-widest hidden sm:inline">
            House Journal
          </span>
        </h1>
        <button
          type="button"
          aria-label="設定"
          data-testid="settings-button"
          onClick={onSettingsClick}
          className="shrink-0 ml-auto sm:ml-0 sm:order-3 flex items-center gap-1.5 px-3 py-2 rounded-full border border-rule bg-bg hover:bg-paper hover:border-wood-deep text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2 ring-rust transition"
        >
          <span className="text-base leading-none" aria-hidden="true">⚙</span>
          <span className="hidden sm:inline text-sm" style={{ letterSpacing: "0.08em" }}>設定</span>
        </button>
        <div className="w-full sm:w-auto sm:flex-1 sm:max-w-xl sm:order-2 relative">
          <label htmlFor="global-search" className="sr-only">全体検索</label>
          <span aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none text-sm">🔍</span>
          <input
            id="global-search"
            type="search"
            data-testid="global-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => { if (debouncedQuery.trim().length > 0) setOpen(true); }}
            placeholder="会社・打ち合わせ・仕様項目を検索"
            disabled={saveDisabled}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-rule text-sm bg-bg placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 ring-rust disabled:bg-paper disabled:text-ink-soft/40"
          />
          {open && debouncedQuery.trim().length > 0 && searchData && (
            <GlobalSearchPanel
              data={searchData}
              query={debouncedQuery}
              onNavigate={handleNavigate}
              onClose={() => { setOpen(false); onSearchChange(""); setSearchData(null); }}
            />
          )}
        </div>
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

function BottomNavigation({ currentTab, onTabChange, onSettingsClick }) {
  const settingsActive = currentTab === "settings";
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 bg-bg border-t border-rule z-40 no-print"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0)",
        boxShadow: "0 -2px 12px rgba(26,24,22,0.08)",
      }}
      aria-label="モバイルナビゲーション"
    >
      <div className="grid grid-cols-6">
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
                "py-2.5 flex flex-col items-center text-[10px] gap-1 focus-visible:outline focus-visible:outline-2 ring-rust transition " +
                (active ? "text-rust" : "text-ink-soft hover:text-ink")
              }
              style={{
                fontFamily: "var(--jp-serif)",
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.04em",
              }}
            >
              <span className="text-lg" aria-hidden="true">{tab.icon}</span>
              <span className="truncate max-w-full px-0.5">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={settingsActive}
          aria-label="設定"
          data-testid="bottom-tab-settings"
          onClick={onSettingsClick}
          className={
            "py-2.5 flex flex-col items-center text-[10px] gap-1 focus-visible:outline focus-visible:outline-2 ring-rust transition " +
            (settingsActive ? "text-rust" : "text-ink-soft hover:text-ink")
          }
          style={{
            fontFamily: "var(--jp-serif)",
            fontWeight: settingsActive ? 600 : 500,
            letterSpacing: "0.04em",
          }}
        >
          <span className="text-lg" aria-hidden="true">⚙</span>
          <span>設定</span>
        </button>
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

  const [previousTab, setPreviousTab] = useState("dashboard");
  const handleSettingsClick = useCallback(() => {
    if (currentTab !== "settings") {
      setPreviousTab(currentTab);
      setCurrentTab("settings");
    }
  }, [currentTab]);
  const handleSettingsClose = useCallback(() => {
    setCurrentTab(previousTab || "dashboard");
  }, [previousTab]);

  if (bootPhase) return <StorageBootstrapStatus phase={bootPhase} />;

  const saveDisabled = resolvedStorageMode === "none";
  const handleTabNavigate = (tab) => setCurrentTab(tab);
  // 検索パネルからのナビゲーションは現状タブ切替のみ (詳細遷移はSprint 7-Bで)
  const handleSearchNavigate = (tab) => setCurrentTab(tab);

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
        searchEnabled={resolvedStorageMode !== "none"}
        onSearchNavigate={handleSearchNavigate}
      />
      <TabNavigation currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="max-w-7xl mx-auto px-4 py-6" data-testid="main-content">
        {currentTab === "dashboard" && <DashboardView onNavigate={handleTabNavigate} />}
        {currentTab === "companies" && <CompaniesView saveDisabled={saveDisabled} />}
        {currentTab === "spec-comparison" && <SpecComparisonView saveDisabled={saveDisabled} />}
        {currentTab === "meetings" && <MeetingsView saveDisabled={saveDisabled} />}
        {currentTab === "change-logs" && <ChangeLogsView />}
        {currentTab === "settings" && (
          <SettingsView saveDisabled={saveDisabled} onClose={handleSettingsClose} />
        )}
        {currentTab !== "dashboard" && currentTab !== "companies"
          && currentTab !== "spec-comparison" && currentTab !== "meetings"
          && currentTab !== "change-logs" && currentTab !== "settings" && (
          <TabPlaceholder tabId={currentTab} />
        )}
      </main>

      <BottomNavigation currentTab={currentTab} onTabChange={setCurrentTab} onSettingsClick={handleSettingsClick} />
    </div>
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
