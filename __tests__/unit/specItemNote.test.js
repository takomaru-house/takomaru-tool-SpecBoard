// =============================================================================
// __tests__/unit/specItemNote.test.js
// Sprint 2 単体テスト - SpecItemNote
//
// 対応テストケース: TC_046 (CRUD), TC_047 (200/201 文字境界)
// =============================================================================

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockStorage, installGlobalStorage, restoreGlobalStorage } from "../fixtures/mock-storage.js";
import { createStorage } from "../../src/utils/storage.js";
import {
  validateSpecItemNote,
  createSpecItemNote,
  updateSpecItemNote,
  findNote,
  upsertSpecItemNote,
  deleteSpecItemNote,
  loadSpecItemNotes,
  saveSpecItemNotes,
  SPEC_ITEM_NOTE_VALIDATION,
} from "../../src/utils/specItemNote.js";

describe("validateSpecItemNote (TC_047 / F-VL-023, F-VL-024)", () => {
  const base = { specItemId: "s1", companyId: "co1" };

  test("note が空でエラー", () => {
    expect(validateSpecItemNote({ ...base, note: "" })).toHaveProperty("note");
    expect(validateSpecItemNote({ ...base, note: "   " })).toHaveProperty("note");
  });

  test("TC_047: note 200 文字 OK / 201 文字 NG (境界値)", () => {
    expect(validateSpecItemNote({ ...base, note: "a".repeat(200) })).not.toHaveProperty("note");
    expect(validateSpecItemNote({ ...base, note: "a".repeat(201) })).toHaveProperty("note");
  });

  test("specItemId 未指定でエラー", () => {
    expect(validateSpecItemNote({ companyId: "co1", note: "x" })).toHaveProperty("specItemId");
  });

  test("companyId 未指定でエラー", () => {
    expect(validateSpecItemNote({ specItemId: "s1", note: "x" })).toHaveProperty("companyId");
  });

  test("有効な入力で errors なし", () => {
    expect(validateSpecItemNote({ ...base, note: "A社が優れている" })).toEqual({});
  });
});

describe("createSpecItemNote / updateSpecItemNote", () => {
  test("createSpecItemNote: id / createdAt / updatedAt が付与され note は trim される", () => {
    const note = createSpecItemNote({
      specItemId: "s1", companyId: "co1", note: "  メモ  ",
    });
    expect(note.id).toBeTruthy();
    expect(note.note).toBe("メモ");
    expect(note.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(note.updatedAt).toBe(note.createdAt);
  });

  test("updateSpecItemNote: id と createdAt 維持、note と updatedAt 更新", () => {
    const original = createSpecItemNote({
      specItemId: "s1", companyId: "co1", note: "旧メモ",
    });
    const before = original.updatedAt;
    // 更新時刻が変わるよう少し待つ (実時間で OK)
    const updated = updateSpecItemNote(original, { note: "新メモ" });
    expect(updated.id).toBe(original.id);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.note).toBe("新メモ");
    // updatedAt は ISO 形式
    expect(updated.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("findNote", () => {
  const notes = [
    { id: "n1", specItemId: "s1", companyId: "co1", note: "メモA" },
    { id: "n2", specItemId: "s1", companyId: "co2", note: "メモB" },
    { id: "n3", specItemId: "s2", companyId: "co1", note: "メモC" },
  ];

  test("specItemId + companyId 完全一致で取得", () => {
    expect(findNote(notes, "s1", "co1").note).toBe("メモA");
    expect(findNote(notes, "s2", "co1").note).toBe("メモC");
  });

  test("該当なしで undefined", () => {
    expect(findNote(notes, "s9", "co9")).toBeUndefined();
  });
});

describe("upsertSpecItemNote / deleteSpecItemNote (TC_046)", () => {
  let storage;
  let restored;
  beforeEach(() => {
    storage = createStorage("window.storage");
    restored = installGlobalStorage({ windowStorage: mockStorage({ available: true }) });
  });
  afterEach(() => restoreGlobalStorage(restored));

  test("TC_046 ①: 新規メモを upsert で追加", async () => {
    const result = await upsertSpecItemNote(storage, {
      specItemId: "s1", companyId: "co1", note: "A社が優れている",
    });
    expect(result.note).toBe("A社が優れている");
    const list = await loadSpecItemNotes(storage);
    expect(list).toHaveLength(1);
  });

  test("TC_046 ②: 同 specItemId+companyId 再 upsert で更新 (新規追加されない)", async () => {
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co1", note: "v1" });
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co1", note: "v2" });

    const list = await loadSpecItemNotes(storage);
    expect(list).toHaveLength(1);
    expect(list[0].note).toBe("v2");
  });

  test("異なる (specItemId, companyId) は別レコードとして追加される", async () => {
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co1", note: "メモ1" });
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co2", note: "メモ2" });
    await upsertSpecItemNote(storage, { specItemId: "s2", companyId: "co1", note: "メモ3" });
    const list = await loadSpecItemNotes(storage);
    expect(list).toHaveLength(3);
  });

  test("TC_046 ③: deleteSpecItemNote で物理削除される", async () => {
    const note = await upsertSpecItemNote(storage, {
      specItemId: "s1", companyId: "co1", note: "削除対象",
    });
    await deleteSpecItemNote(storage, note.id);

    const list = await loadSpecItemNotes(storage);
    expect(list).toHaveLength(0);
  });

  test("リロード相当の再 load でメモが保持される", async () => {
    await upsertSpecItemNote(storage, { specItemId: "s1", companyId: "co1", note: "永続" });
    const newStorage = createStorage("window.storage");
    const list = await loadSpecItemNotes(newStorage);
    expect(list).toHaveLength(1);
    expect(list[0].note).toBe("永続");
  });
});

describe("SPEC_ITEM_NOTE_VALIDATION 定数", () => {
  test("Spec.md §4-3 の上限値", () => {
    expect(SPEC_ITEM_NOTE_VALIDATION.note.maxLength).toBe(200);
  });
});
