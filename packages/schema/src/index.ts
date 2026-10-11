import { z } from "zod";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Слово транскрипта; время в миллисекундах исходника. */
export const WordSchema = z.object({
  id: z.string(),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  confidence: z.number().min(0).max(1).default(1),
});
export type Word = z.infer<typeof WordSchema>;

export const TranscriptSchema = z.object({
  assetId: z.string(),
  language: z.string().default("ru"),
  durationMs: z.number().int().positive(),
  words: z.array(WordSchema),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

/** Интервал исходника, который остаётся в ролике. Время в мс. */
export const AudioSegmentSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  sourceInMs: z.number().int().nonnegative(),
  sourceOutMs: z.number().int().positive(),
  wordIds: z.array(z.string()),
});
export type AudioSegment = z.infer<typeof AudioSegmentSchema>;

/** Соответствие исходного и итогового времени: [startFrame, endFrame) в итоговых кадрах. */
export const SourceMapEntrySchema = z.object({
  segmentId: z.string(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  sourceInMs: z.number().int().nonnegative(),
  sourceOutMs: z.number().int().positive(),
});
export type SourceMapEntry = z.infer<typeof SourceMapEntrySchema>;

export const CompositionSchema = z.enum(["speaker_full", "speaker_graphic", "graphic_full", "broll_full"]);
export type Composition = z.infer<typeof CompositionSchema>;

// ---- Анимированные вставки (HyperFrames) ----
const short = (n: number) => z.string().trim().min(1).max(n);
export const InsertSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("big_number"), data: z.object({ value: short(16), label: short(60), caption: short(80).optional() }) }),
  z.object({ kind: z.literal("list"), data: z.object({ title: short(60), items: z.array(short(48)).min(2).max(4) }) }),
  z.object({
    kind: z.literal("comparison"),
    data: z.object({ left: z.object({ title: short(28), value: short(24).optional() }), right: z.object({ title: short(28), value: short(24).optional() }) }),
  }),
  z.object({ kind: z.literal("title"), data: z.object({ text: short(70), kicker: short(40).optional() }) }),
  z.object({ kind: z.literal("steps"), data: z.object({ steps: z.array(short(30)).length(3) }) }),
]);
export type InsertSpec = z.infer<typeof InsertSpecSchema>;
export type InsertKind = InsertSpec["kind"];
export const INSERT_KINDS: InsertKind[] = ["big_number", "list", "comparison", "title", "steps"];

export const InsertParamsSchema = z.object({ intensity: z.enum(["calm", "dynamic"]).default("calm") });
export type InsertParams = z.infer<typeof InsertParamsSchema>;

/** Весь видимый текст вставки — для проверки фактов и запасного отображения. */
export function insertTexts(spec: InsertSpec): string[] {
  switch (spec.kind) {
    case "big_number": return [spec.data.value, spec.data.label, ...(spec.data.caption ? [spec.data.caption] : [])];
    case "list": return [spec.data.title, ...spec.data.items];
    case "comparison": return [spec.data.left.title, spec.data.left.value, spec.data.right.title, spec.data.right.value].filter((x): x is string => !!x);
    case "title": return [spec.data.text, ...(spec.data.kicker ? [spec.data.kicker] : [])];
    case "steps": return spec.data.steps;
  }
}

export const SceneSchema = z.object({
  sceneId: z.string(),
  startFrame: z.number().int().nonnegative(),
  durationFrames: z.number().int().positive(),
  composition: CompositionSchema,
  templateId: z.string(),
  speechSegmentIds: z.array(z.string()),
  visual: z.object({ assetId: z.string(), sourceInMs: z.number().int().nonnegative(), sourceOutMs: z.number().int().positive() }).optional(),
  overlay: z.object({ text: z.string(), factRefs: z.array(z.string()) }).optional(),
  /** Анимированная вставка: рендерится HyperFrames в отдельный MP4, Remotion только размещает её. */
  insert: z.object({ spec: InsertSpecSchema, params: InsertParamsSchema.default({ intensity: "calm" }), factRefs: z.array(z.string()).default([]) }).optional(),
  captionWordIds: z.array(z.string()).default([]),
  locks: z.array(z.enum(["speech", "visual", "graphic", "sound"])).default([]),
  warnings: z.array(z.string()).default([]),
});
export type Scene = z.infer<typeof SceneSchema>;

export const CaptionSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  lines: z.array(z.string()).max(2),
  wordIds: z.array(z.string()),
});
export type Caption = z.infer<typeof CaptionSchema>;

export const TimelinePlanSchema = z.object({
  schemaVersion: z.literal("1.0"),
  fps: z.number().int().positive(),
  totalFrames: z.number().int().positive(),
  audioSegments: z.array(AudioSegmentSchema).min(1),
  sourceMap: z.array(SourceMapEntrySchema).min(1),
  visualScenes: z.array(SceneSchema).min(1),
  captions: z.array(CaptionSchema),
  dependencies: z.object({ assetIds: z.array(z.string()), styleVersion: z.string(), templateVersion: z.string() }),
});
export type TimelinePlan = z.infer<typeof TimelinePlanSchema>;

export const StyleSchema = z.object({
  id: z.string(),
  version: z.string(),
  pauseMode: z.enum(["gentle", "normal", "tight"]),
  brand: z.object({ primary: z.string(), accent: z.string(), text: z.string(), background: z.string(), fontFamily: z.string() }),
  captions: z.object({ enabled: z.boolean(), maxCharsPerLine: z.number().int().positive().default(32), maxLines: z.number().int().min(1).max(2).default(2) }),
  allowedCompositions: z.array(CompositionSchema).min(1),
});
export type Style = z.infer<typeof StyleSchema>;

export const PAUSE_MODES = {
  gentle: { thresholdMs: 800, keepMs: 350 },
  normal: { thresholdMs: 600, keepMs: 250 },
  tight: { thresholdMs: 450, keepMs: 150 },
} as const;
export const SPEECH_PADDING_MS = 80;
