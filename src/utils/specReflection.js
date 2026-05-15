// =============================================================================
// src/utils/specReflection.js
// 仕様反映フロー (アトミック処理 + ChangeLog 自動生成)
// 設計参照: docs/Spec.md §4-6 (仕様反映フロー), E2 (後勝ちルール), E12 (失敗時ロールバック)
// 対応テストケース: TC_080, TC_081, TC_082
// =============================================================================

import { STORAGE_KEYS } from "./constants.js";
import { loadSpecItems, saveSpecItems, setSpecValue, getSpecValue } from "./specItem.js";
import { loadChangeLogs, saveChangeLogs, buildChangeLog } from "./changeLog.js";

/**
 * 反映前 SpecItem と Decision を比較して、反映後の SpecItem を生成 (純粋関数)
 * Decision.specCompanyId に対する value を上書きする。
 *
 * @param {Object} specItem  対象 SpecItem
 * @param {Object} decision  { specCompanyId, specValue, meetingId }
 * @returns {Object} 反映後 SpecItem
 */
export function computeNewSpecItem(specItem, decision) {
  return setSpecValue(specItem, decision.specCompanyId, decision.specValue, decision.meetingId);
}

/**
 * deepClone: 単純なオブジェクトの再帰コピー (テスト用バックアップに使用)
 */
function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * reflectToSpec: 仕様反映アトミック処理
 *
 * 動作:
 *   1. 反映前の specItem を deepClone でバックアップ
 *   2. 反映後の specItem を計算
 *   3. ChangeLog を生成
 *   4. SpecItem と ChangeLog を順序保存 (saveSpecItems → saveChangeLogs)
 *   5. いずれかの保存が失敗した場合、ストレージを反映前の状態にロールバック
 *      ※ Promise.all を使うと両方が成功/失敗するわけではないため
 *        順次保存 (await) して個別にエラーをキャッチする
 *
 * @param {Object} storage   ストレージ抽象
 * @param {Object} decision  { specItemId, specCompanyId, specValue, meetingId }
 * @param {string} [reason]  変更理由 (ChangeLog.reason)
 * @returns {Promise<{specItem, changeLog}>}
 *
 * 失敗時:
 *   - storage がスローした場合、Promise は reject する
 *   - SpecItem は失敗前の状態に戻る (再書き込みで復元)
 *   - ChangeLog は保存されない (1段目失敗時) または取り消される (2段目失敗時)
 *
 * 対応 TC: TC_080 (正常系), TC_081 (失敗時ロールバック), TC_082 (後勝ち2件記録)
 */
export async function reflectToSpec(storage, decision, reason = undefined) {
  if (!decision?.specItemId) throw new Error("decision.specItemId is required");
  if (!decision?.specCompanyId) throw new Error("decision.specCompanyId is required");

  // 反映前の状態を読み込み (specItem + changeLogs)
  const specItemsBefore = await loadSpecItems(storage);
  const changeLogsBefore = await loadChangeLogs(storage);

  const specItem = specItemsBefore.find((i) => i.id === decision.specItemId);
  if (!specItem) throw new Error(`SpecItem not found: ${decision.specItemId}`);

  const specItemBackup = deepClone(specItem);
  const previous = getSpecValue(specItemBackup, decision.specCompanyId);
  const previousValue = previous?.value ?? "";

  // 反映後 SpecItem (+ ChangeLog) を計算
  const newSpecItem = computeNewSpecItem(specItem, decision);
  const newSpecItems = specItemsBefore.map((i) => (i.id === newSpecItem.id ? newSpecItem : i));
  const changeLog = buildChangeLog({
    specItemId: decision.specItemId,
    companyId: decision.specCompanyId,
    previousValue,
    newValue: decision.specValue ?? "",
    meetingId: decision.meetingId,
    reason,
  });

  // フェーズ1: SpecItem 保存
  try {
    await saveSpecItems(storage, newSpecItems);
  } catch (e) {
    // SpecItem 保存に失敗 → ロールバック不要 (元の状態のまま) / ChangeLog は書き込まない
    e.specReflectionPhase = "specItem";
    throw e;
  }

  // フェーズ2: ChangeLog 追加保存
  try {
    await saveChangeLogs(storage, [...changeLogsBefore, changeLog]);
  } catch (e) {
    // ChangeLog 保存に失敗 → SpecItem を元に戻す (ロールバック)
    try {
      await saveSpecItems(storage, specItemsBefore);
    } catch (rollbackErr) {
      // ロールバック自体も失敗 → 元エラーに付加情報を載せて伝播
      e.rollbackFailed = true;
      e.rollbackError = rollbackErr;
    }
    e.specReflectionPhase = "changeLog";
    throw e;
  }

  return { specItem: newSpecItem, changeLog };
}

/**
 * UI 用ヘルパー: Decision から「反映可能か」を判定
 * specItemId / specCompanyId / specValue が揃っていれば反映可能
 */
export function canReflect(decision) {
  return Boolean(
    decision?.specItemId &&
    decision?.specCompanyId &&
    decision?.specValue !== undefined &&
    decision?.specValue !== null
  );
}
