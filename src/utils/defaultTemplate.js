// =============================================================================
// src/utils/defaultTemplate.js
// 標準仕様テンプレート (DEFAULT_TEMPLATE) と既存ユーザー向け差分補填ロジック
// 設計参照: docs/Spec.md §4-11 / §4-11-1, 02-テスト/03-テスト観点.md F-SC-015 / F-SC-016
// 対応テストケース: TC_048 / TC_048b / TC_048c
//
// 注意: app.jsx には同等のインライン実装 (DEFAULT_TEMPLATE / fillMissingDefaultTemplate) が
// 存在する。CLAUDE.md の「単一JSXファイル / import文禁止」ルールに従い、両者を手動で同期する。
// =============================================================================

export const DEFAULT_TEMPLATE = [
  { category: "コスト",
    items: ["坪単価", "本体工事費", "付帯工事費（地盤改良・外構等）", "諸経費", "標準総額目安", "値引き条件"] },
  { category: "設計・間取り",
    items: ["自由設計の範囲", "設計士の専任", "打合せ回数", "設計料", "平屋・2階・3階対応"] },
  { category: "断熱",
    items: ["断熱工法", "断熱材の種類", "床断熱材", "壁断熱材", "天井・屋根断熱材", "断熱等性能等級（UA値）", "C値（気密性能）"] },
  { category: "省エネ・環境",
    items: ["一次エネルギー消費量等級", "ZEH対応", "換気方式", "太陽光発電（kW）", "蓄電池"] },
  { category: "開口部（窓）",
    items: ["サッシの種類", "ガラスの種類", "玄関ドアの種類"] },
  { category: "構造",
    items: ["工法", "耐震等級", "制震装置", "基礎の種類", "地盤保証", "シロアリ保証"] },
  { category: "設備（水回り）",
    items: ["キッチン", "浴室", "洗面台", "トイレ", "給湯器", "食洗機"] },
  { category: "空調・電気",
    items: ["床暖房", "全館空調", "エアコン標準台数", "コンセント・LAN配線"] },
  { category: "外装・内装",
    items: ["外壁材", "屋根材", "床材", "天井高", "標準収納"] },
  { category: "保証・アフターサービス",
    items: ["初期保証年数", "長期保証の条件", "構造躯体保証", "防水保証", "設備保証", "定期点検の頻度"] },
  { category: "会社情報",
    items: ["創業年", "施工棟数", "住宅完成保証", "モデルハウス所在地", "引渡しまでの期間"] },
];

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 既存カテゴリ・仕様項目に対して DEFAULT_TEMPLATE の差分のみを末尾追加する純粋関数。
 * - カテゴリは normalizedName (trim + lowercase) で同定し、未存在なら新規追加
 * - 仕様項目は同カテゴリ内の name (trim 一致) で同定し、未存在なら末尾に追加
 * - deletedAt 付きは「未存在」として扱う (旧 ID は復活させない)
 * - 既存の id / sortOrder / values は変更しない
 *
 * @param {Array} existingCategories
 * @param {Array} existingSpecItems
 * @param {Object} [opts]
 * @param {string} [opts.now] ISO 文字列 (テスト用に注入可)
 * @returns {{ categories: Array, specItems: Array, addedCategories: number, addedItems: number }}
 *
 * 対応 TC: TC_048b (差分追加) / TC_048c (冪等性)
 */
export function applyMissingDefaultTemplate(existingCategories = [], existingSpecItems = [], opts = {}) {
  const now = opts.now ?? new Date().toISOString();
  const nextCategories = [...existingCategories];
  const nextSpecItems  = [...existingSpecItems];

  const activeCategoryByNorm = new Map();
  for (const c of nextCategories) {
    if (!c.deletedAt) activeCategoryByNorm.set(c.normalizedName, c);
  }

  let nextCatSortOrder = nextCategories.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), -1) + 1;
  let addedCategories = 0;
  let addedItems = 0;

  for (const tmpl of DEFAULT_TEMPLATE) {
    const normName = tmpl.category.trim().toLowerCase();
    let cat = activeCategoryByNorm.get(normName);
    if (!cat) {
      cat = {
        id: newId(),
        name: tmpl.category,
        normalizedName: normName,
        sortOrder: nextCatSortOrder++,
        isDefault: true,
        createdAt: now,
      };
      nextCategories.push(cat);
      activeCategoryByNorm.set(normName, cat);
      addedCategories++;
    }
    const activeItemNames = new Set(
      nextSpecItems
        .filter((i) => i.categoryId === cat.id && !i.deletedAt)
        .map((i) => i.name.trim())
    );
    let itemSortOrder = nextSpecItems
      .filter((i) => i.categoryId === cat.id)
      .reduce((m, i) => Math.max(m, i.sortOrder ?? 0), -1) + 1;
    for (const itemName of tmpl.items) {
      if (activeItemNames.has(itemName.trim())) continue;
      nextSpecItems.push({
        id: newId(),
        categoryId: cat.id,
        name: itemName,
        sortOrder: itemSortOrder++,
        values: [],
        createdAt: now,
      });
      addedItems++;
    }
  }

  return { categories: nextCategories, specItems: nextSpecItems, addedCategories, addedItems };
}

/**
 * 空ストレージ用の初期テンプレートを構築する純粋関数。
 * @param {Object} [opts]
 * @param {string} [opts.now]
 * @returns {{ categories: Array, specItems: Array }}
 *
 * 対応 TC: TC_048
 */
export function buildInitialTemplate(opts = {}) {
  const now = opts.now ?? new Date().toISOString();
  const categories = [];
  const specItems = [];
  DEFAULT_TEMPLATE.forEach((tmpl, catIdx) => {
    const categoryId = newId();
    categories.push({
      id: categoryId,
      name: tmpl.category,
      normalizedName: tmpl.category.trim().toLowerCase(),
      sortOrder: catIdx,
      isDefault: true,
      createdAt: now,
    });
    tmpl.items.forEach((itemName, itemIdx) => {
      specItems.push({
        id: newId(),
        categoryId,
        name: itemName,
        sortOrder: itemIdx,
        values: [],
        createdAt: now,
      });
    });
  });
  return { categories, specItems };
}
