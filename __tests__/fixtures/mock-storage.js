// =============================================================================
// __tests__/fixtures/mock-storage.js
// window.storage / localStorage モックファクトリ
// 設計参照: 02-テスト/05-テストスクリプト.md
// =============================================================================

/**
 * シンプルな key/value ストレージモック
 *
 * @param {Object} options
 * @param {boolean} [options.available=true]  操作可能か (false で全操作が例外スロー)
 * @param {string}  [options.throwOn]         "setItem" | "getItem" | "removeItem" 指定でその操作のみ例外
 * @param {string}  [options.error="Error"]   throwOn で投げるエラー名
 * @param {number}  [options.capacity]        バイト容量上限 (超過時 QuotaExceededError)
 * @param {boolean} [options.async=true]      true なら Promise を返す (window.storage 模倣)
 */
export function mockStorage({
  available = true,
  throwOn = null,
  error = "Error",
  capacity = Infinity,
  async = true,
} = {}) {
  const store = new Map();
  let usedBytes = 0;

  function maybeThrow(op) {
    if (!available) {
      const err = new Error(`Storage unavailable (${op})`);
      err.name = error || "Error";
      throw err;
    }
    if (throwOn === op) {
      const err = new Error(`Simulated ${error} on ${op}`);
      err.name = error;
      throw err;
    }
  }

  function setItemSync(key, value) {
    maybeThrow("setItem");
    const newBytes = String(value).length;
    const prevBytes = store.has(key) ? String(store.get(key)).length : 0;
    if (usedBytes - prevBytes + newBytes > capacity) {
      const err = new Error("Quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    }
    usedBytes += newBytes - prevBytes;
    store.set(key, String(value));
  }
  function getItemSync(key) {
    maybeThrow("getItem");
    return store.has(key) ? store.get(key) : null;
  }
  function removeItemSync(key) {
    maybeThrow("removeItem");
    if (store.has(key)) {
      usedBytes -= String(store.get(key)).length;
      store.delete(key);
    }
  }

  if (async) {
    return {
      getItem:    (k) => Promise.resolve().then(() => getItemSync(k)),
      setItem:    (k, v) => Promise.resolve().then(() => setItemSync(k, v)),
      removeItem: (k) => Promise.resolve().then(() => removeItemSync(k)),
      _debugStore: store,
    };
  }
  return {
    getItem: getItemSync,
    setItem: setItemSync,
    removeItem: removeItemSync,
    get length() { return store.size; },
    key(i) { return Array.from(store.keys())[i] || null; },
    clear() { store.clear(); usedBytes = 0; },
    _debugStore: store,
  };
}

/**
 * グローバル window.storage と localStorage をモックに差し替える
 * テスト終了時は restoreGlobalStorage() で復元する
 *
 * @param {Object} options
 * @param {Object} [options.windowStorage]   mockStorage の戻り値 (省略時はデフォルト)
 * @param {Object} [options.localStorage]    localStorage モック (省略時はそのまま)
 */
export function installGlobalStorage({ windowStorage, localStorage: ls } = {}) {
  const original = {
    windowStorage: globalThis.window?.storage,
    hasWindowStorage: globalThis.window && "storage" in globalThis.window,
  };
  if (!globalThis.window) globalThis.window = {};
  if (windowStorage) globalThis.window.storage = windowStorage;
  else delete globalThis.window.storage;

  if (ls !== undefined) {
    original.localStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: ls,
    });
  }
  return original;
}

export function restoreGlobalStorage(original) {
  if (!original) return;
  if (original.hasWindowStorage) {
    globalThis.window.storage = original.windowStorage;
  } else if (globalThis.window) {
    delete globalThis.window.storage;
  }
  if (original.localStorage !== undefined) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: original.localStorage,
    });
  }
}
