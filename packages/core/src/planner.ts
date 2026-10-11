import { AudioSegment, Composition, InsertParams, InsertSpec, Scene, Style, TimelinePlan, Transcript, FPS, insertTexts } from "@aa/schema";
import { buildAudioSegments, buildSourceMap } from "./speech";
import { buildCaptions } from "./captions";

export interface BrollAsset { assetId: string; durationMs: number }
/** Запрос вставки от монтажного ИИ: в какую по счёту сцену и с каким содержанием. */
export interface InsertRequest { sceneIndex: number; spec: InsertSpec; params?: InsertParams; factRefs?: string[] }
export interface PlanInput {
  inserts?: InsertRequest[];
  transcript: Transcript;
  style: Style;
  broll?: BrollAsset[];
  excludedWordIds?: ReadonlySet<string>;
  /** Целевая длительность сцены, секунды [min, max]. */
  sceneSeconds?: [number, number];
  fps?: number;
}

const TEMPLATE: Record<Composition, string> = {
  speaker_full: "speaker_full_v1",
  speaker_graphic: "speaker_number_v1",
  graphic_full: "quote_full_v1",
  broll_full: "broll_full_v1",
};
export const MIN_SCENE_FRAMES = 45; // 1,5 с

/**
 * Детерминированный планировщик-заглушка. Слово в слово использует транскрипт,
 * ничего не придумывает; тот же интерфейс позже займёт LLM-планировщик.
 */
export function planTimeline(input: PlanInput): TimelinePlan {
  const fps = input.fps ?? FPS;
  const { transcript: t, style } = input;
  const [minS, maxS] = input.sceneSeconds ?? [4, 8];
  const segments = buildAudioSegments(t, { mode: style.pauseMode, excludedWordIds: input.excludedWordIds });
  if (!segments.length) throw new Error("В транскрипте нет речи для монтажа");
  const { map, totalFrames } = buildSourceMap(segments, fps);

  // группируем сегменты в блоки длиной >= minS
  const blocks: AudioSegment[][] = [[]];
  let blockFrames = 0;
  map.forEach((m, i) => {
    blocks[blocks.length - 1].push(segments[i]);
    blockFrames += m.endFrame - m.startFrame;
    if (blockFrames >= Math.max(minS * fps, MIN_SCENE_FRAMES)) { blocks.push([]); blockFrames = 0; }
  });
  if (!blocks[blocks.length - 1].length) blocks.pop();
  // короткий хвост присоединяем к предыдущему блоку
  if (blocks.length > 1) {
    const tail = blocks[blocks.length - 1].reduce((s, g) => s + frames(map, g.id), 0);
    if (tail < MIN_SCENE_FRAMES) blocks[blocks.length - 2].push(...blocks.pop()!);
  }

  const allowed = style.allowedCompositions;
  const broll = input.broll ?? [];
  const wordsById = new Map(t.words.map((w) => [w.id, w]));
  const scenes: Scene[] = [];
  let cursor = 0, brollIdx = 0;
  blocks.forEach((block, i) => {
    const dur = block.reduce((s, g) => s + frames(map, g.id), 0);
    let comp: Composition = i === 0 ? "speaker_full" : cycle(allowed, i);
    const warnings: string[] = [];
    let visual: Scene["visual"];
    if (comp === "broll_full") {
      const asset = broll.length ? broll[brollIdx++ % broll.length] : undefined;
      if (asset && asset.durationMs >= (dur * 1000) / fps) visual = { assetId: asset.assetId, sourceInMs: 0, sourceOutMs: Math.round((dur * 1000) / fps) };
      else { comp = "speaker_full"; warnings.push("Нет подходящей перебивки — оставлен спикер"); }
    }
    let overlay: Scene["overlay"];
    if (comp === "graphic_full" || comp === "speaker_graphic") {
      const ids = block.flatMap((g) => g.wordIds).slice(0, 5);
      overlay = { text: ids.map((id) => wordsById.get(id)!.text).join(" "), factRefs: ids };
    }
    const req = input.inserts?.find((r) => r.sceneIndex === i);
    let insert: Scene["insert"];
    if (req) {
      comp = "graphic_full"; visual = undefined;
      overlay = { text: insertTexts(req!.spec)[0], factRefs: req!.factRefs ?? [] };
      insert = { spec: req!.spec, params: req!.params ?? { intensity: "calm" }, factRefs: req!.factRefs ?? [] };
    }
    if (dur > maxS * fps) warnings.push("Сцена длиннее целевого диапазона");
    scenes.push({
      sceneId: `scene_${String(i + 1).padStart(2, "0")}`, startFrame: cursor, durationFrames: dur,
      composition: comp, templateId: insert ? `insert_${insert.spec.kind}_v1` : TEMPLATE[comp], speechSegmentIds: block.map((g) => g.id),
      visual, overlay, insert, captionWordIds: block.flatMap((g) => g.wordIds), locks: [], warnings,
    });
    cursor += dur;
  });

  const assetIds = [...new Set([t.assetId, ...scenes.flatMap((s) => (s.visual ? [s.visual.assetId] : []))])];
  return {
    schemaVersion: "1.0", fps, totalFrames, audioSegments: segments, sourceMap: map, visualScenes: scenes,
    captions: style.captions.enabled ? buildCaptions(t, map, fps, style.captions.maxCharsPerLine, style.captions.maxLines) : [],
    dependencies: { assetIds, styleVersion: style.version, templateVersion: "1" },
  };
}

const frames = (map: { segmentId: string; startFrame: number; endFrame: number }[], id: string) => {
  const e = map.find((m) => m.segmentId === id)!; return e.endFrame - e.startFrame;
};
const cycle = (allowed: Composition[], i: number) => allowed[i % allowed.length];
