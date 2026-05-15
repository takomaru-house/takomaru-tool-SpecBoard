// Vitest 共通セットアップ
// 各テストファイル実行前にロードされる

import React from "react";
import * as ReactDOM from "react-dom";
import { beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// app.jsx は `const { useState, ... } = React;` でグローバル React を期待するため、
// テスト環境でも globalThis に注入する
globalThis.React = React;
globalThis.ReactDOM = ReactDOM;

beforeEach(() => {
  // 各テストでストレージ・グローバル状態のクリーンアップは各 fixture で実施
});

afterEach(() => {
  // React Testing Library がレンダリングした DOM をクリーンアップ
  cleanup();
});
