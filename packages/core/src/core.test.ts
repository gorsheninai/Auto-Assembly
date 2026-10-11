import { describe, expect, it } from "vitest";
import { Style, Transcript } from "@aa/schema";
import { buildAudioSegments, buildSourceMap, planTimeline, validatePlan, buildCaptions } from "./index";

const mk = (id: number, text: string, s: number, e: number) => ({ id: `w_${id}`, text, startMs: s, endMs: e, confidence: 1 });
const transcript: Transcript = {
  assetId: "a1", language: "ru", durationMs: 12000,
  words: [mk(1, "Привет,", 500, 900), mk(2, "друзья.", 950, 1500), // пауза 2000
    mk(3, "Сегодня", 3500, 4000), mk(4, "расскажу", 4050, 4600), mk(5, "три", 4650, 4900), mk(6, "шага.", 4950, 5500),
    mk(7, "Первый", 8000, 8500), mk(8, "шаг.", 8550, 9000)],
};
const style: Style = {
  id: "calm", version: "1", pauseMode: "normal",
  brand: { primary: "#111", accent: "#e53", text: "#fff", background: "#000", fontFamily: "DejaVu Sans" },
  captions: { enabled: true, maxCharsPerLine: 32, maxLines: 2 },
  allowedCompositions: ["speaker_full", "graphic_full", "broll_full"],
};

describe("чистка пауз", () => {
  it("режет паузы длиннее порога и не заходит на соседние слова", () => {
    const seg = buildAudioSegments(transcript, { mode: "normal" });
    expect(seg).toHaveLength(3);
    expect(seg[0].sourceOutMs).toBeLessThanOrEqual(3500);
    expect(seg[1].sourceInMs).toBeGreaterThanOrEqual(1500);
    expect(seg[0].sourceOutMs - 1500).toBeGreaterThanOrEqual(80);
  });
  it("исключённое слово разрывает сегмент и не попадает в запас", () => {
    const seg = buildAudioSegments(transcript, { mode: "normal", excludedWordIds: new Set(["w_4"]) });
    const ids = seg.flatMap((s) => s.wordIds);
    expect(ids).not.toContain("w_4");
    const s = seg.find((x) => x.wordIds.includes("w_3"))!;
    expect(s.sourceOutMs).toBeLessThanOrEqual(4050);
  });
  it("sourceMap непрерывна", () => {
    const { map, totalFrames } = buildSourceMap(buildAudioSegments(transcript, { mode: "normal" }), 30);
    expect(map[0].startFrame).toBe(0);
    map.slice(1).forEach((m, i) => expect(m.startFrame).toBe(map[i].endFrame));
    expect(map.at(-1)!.endFrame).toBe(totalFrames);
  });
});

describe("план", () => {
  const ctx = { transcript, style, assetDurationsMs: { a1: 12000, b1: 20000 } };
  it("валиден и сохраняет обязательные тезисы", () => {
    const plan = planTimeline({ transcript, style, broll: [{ assetId: "b1", durationMs: 20000 }], sceneSeconds: [2, 5] });
    expect(validatePlan(plan, { ...ctx, requiredPhrases: ["три шага"] })).toEqual([]);
  });
  it("без перебивок вместо пустой сцены остаётся спикер с предупреждением", () => {
    const plan = planTimeline({ transcript, style, sceneSeconds: [1.5, 3] });
    expect(plan.visualScenes.every((s) => s.composition !== "broll_full")).toBe(true);
    expect(validatePlan(plan, ctx)).toEqual([]);
  });
  it("ловит удалённый обязательный тезис и запрещённую композицию", () => {
    const plan = planTimeline({ transcript, style, excludedWordIds: new Set(["w_5"]) });
    expect(validatePlan(plan, { ...ctx, requiredPhrases: ["три шага"] }).some((i) => i.code === "required")).toBe(true);
    const bad = structuredClone(plan); bad.visualScenes[0].composition = "speaker_graphic";
    expect(validatePlan(bad, ctx).some((i) => i.code === "composition")).toBe(true);
  });
  it("ловит разрыв покрытия", () => {
    const long: Transcript = { ...transcript, durationMs: 30000, words: [mk(1, "Один", 500, 2500), mk(2, "два", 5000, 7000), mk(3, "три", 10000, 12000)] };
    const plan = planTimeline({ transcript: long, style, sceneSeconds: [1.5, 3] });
    expect(plan.visualScenes.length).toBeGreaterThan(1);
    plan.visualScenes[1].startFrame += 3;
    expect(validatePlan(plan, { ...ctx, transcript: long }).some((i) => i.code === "coverage")).toBe(true);
  });
});

describe("вставки", () => {
  const ins = (value: string) => ({ sceneIndex: 1, spec: { kind: "big_number" as const, data: { value, label: "Взнос" } }, factRefs: ["w_5"] });
  const long: Transcript = { ...transcript, durationMs: 30000, words: [mk(1, "Один", 500, 2500), mk(2, "два", 5000, 7000), mk(3, "три", 10000, 12000), mk(4, "четыре", 15000, 17000), mk(5, "двадцать", 20000, 22000)] };
  const ctx = { transcript: long, style, assetDurationsMs: { a1: 30000 } };
  it("число из утверждённого текста проходит, выдуманное — нет", () => {
    const ok = planTimeline({ transcript: long, style, sceneSeconds: [1.5, 3], inserts: [ins("20%")] });
    expect(ok.visualScenes[1].insert?.spec.kind).toBe("big_number");
    expect(validatePlan(ok, { ...ctx, approvedTexts: ["взнос 20%"] })).toEqual([]);
    expect(validatePlan(ok, ctx).some((i) => i.code === "fact_number")).toBe(true);
    const bad = planTimeline({ transcript: long, style, sceneSeconds: [1.5, 3], inserts: [ins("50%")] });
    expect(validatePlan(bad, { ...ctx, approvedTexts: ["взнос 20%"] }).some((i) => i.code === "fact_number")).toBe(true);
  });
  it("вставка вне graphic_full отклоняется", () => {
    const p = planTimeline({ transcript: long, style, sceneSeconds: [1.5, 3], inserts: [ins("20%")] });
    p.visualScenes[1].composition = "speaker_full";
    expect(validatePlan(p, { ...ctx, approvedTexts: ["20%"] }).some((i) => i.code === "insert")).toBe(true);
  });
});

describe("субтитры", () => {
  it("не длиннее 2 строк по 32 символа, слова не режутся", () => {
    const { map } = buildSourceMap(buildAudioSegments(transcript, { mode: "normal" }), 30);
    const caps = buildCaptions(transcript, map, 30);
    for (const c of caps) { expect(c.lines.length).toBeLessThanOrEqual(2); c.lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(32)); }
    expect(caps.flatMap((c) => c.wordIds)).toHaveLength(8);
    caps.slice(1).forEach((c, i) => expect(c.startFrame).toBeGreaterThanOrEqual(caps[i].endFrame));
  });
});
