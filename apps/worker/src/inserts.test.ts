import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InsertJob, insertCacheKey, renderInsert } from "./inserts";

const brand = { primary: "#14213d", accent: "#fca311", text: "#ffffff", background: "#000000", fontFamily: "DejaVu Sans" };
const job: InsertJob = { sceneId: "scene_02", spec: { kind: "title", data: { text: "Три ошибки" } }, params: { intensity: "calm" }, brand, durationFrames: 60 };

describe("ключ кэша вставки", () => {
  it("стабилен и не зависит от порядка полей", () => {
    const a = insertCacheKey(job);
    const b = insertCacheKey({ ...job, brand: { fontFamily: brand.fontFamily, background: brand.background, text: brand.text, accent: brand.accent, primary: brand.primary } });
    expect(a).toBe(b);
  });
  it("меняется от текста, длительности, стиля и параметров; от ID сцены не зависит", () => {
    const k = insertCacheKey(job);
    expect(insertCacheKey({ ...job, spec: { kind: "title", data: { text: "Три ошибки!" } } })).not.toBe(k);
    expect(insertCacheKey({ ...job, durationFrames: 61 })).not.toBe(k);
    expect(insertCacheKey({ ...job, brand: { ...brand, accent: "#000000" } })).not.toBe(k);
    expect(insertCacheKey({ ...job, params: { intensity: "dynamic" } })).not.toBe(k);
    expect(insertCacheKey({ ...job, sceneId: "scene_09" })).toBe(k);
  });
});

// Медленный интеграционный тест: настоящий рендер HyperFrames (HF_INTEGRATION=1)
describe.skipIf(!process.env.HF_INTEGRATION)("рендер HyperFrames", () => {
  it("кэш, точная длительность и сохранение предыдущей вставки при сбое", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aa-cache-"));
    try {
      const first = await renderInsert(job, dir);
      expect(first.ok && !first.cacheHit).toBe(true);
      const again = await renderInsert(job, dir);
      expect(again.cacheHit).toBe(true);
      expect(again.file).toBe(first.file);
      const changed = { ...job, spec: { kind: "title" as const, data: { text: "Другой текст" } } };
      const failed = await renderInsert(changed, dir, { timeoutMs: 1 });
      expect(failed.ok).toBe(false);
      expect(failed.usedPrevious).toBe(true);
      expect(failed.file).toBe(first.file);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120_000);
});
