import { AudioSegment, PAUSE_MODES, SPEECH_PADDING_MS, SourceMapEntry, Transcript, Word } from "@aa/schema";
import { msToFrames } from "./time";

export type PauseMode = keyof typeof PAUSE_MODES;

export interface CleanOptions {
  mode: PauseMode;
  /** Слова, исключённые пользователем (оговорки, дубли). */
  excludedWordIds?: ReadonlySet<string>;
}

/**
 * Строит утверждённую последовательность речи: убирает длинные паузы, оставляя
 * заданный остаток, и сохраняет запас SPEECH_PADDING_MS у границ слов,
 * не заходя на соседние слова.
 */
export function buildAudioSegments(t: Transcript, opts: CleanOptions): AudioSegment[] {
  const { thresholdMs, keepMs } = PAUSE_MODES[opts.mode];
  const excluded = opts.excludedWordIds ?? new Set<string>();
  const all = t.words;
  const idx = new Map(all.map((w, i) => [w.id, i]));
  const kept = all.filter((w) => !excluded.has(w.id));
  if (!kept.length) return [];

  const groups: Word[][] = [[kept[0]]];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1], b = kept[i];
    const hasExcludedBetween = idx.get(b.id)! - idx.get(a.id)! > 1;
    const gap = b.startMs - a.endMs;
    if (hasExcludedBetween || gap > thresholdMs) groups.push([b]);
    else groups[groups.length - 1].push(b);
  }

  return groups.map((g, n) => {
    const first = g[0], last = g[g.length - 1];
    const prevEnd = idx.get(first.id)! > 0 ? all[idx.get(first.id)! - 1].endMs : 0;
    const nextStart = idx.get(last.id)! < all.length - 1 ? all[idx.get(last.id)! + 1].startMs : t.durationMs;
    const pad = Math.max(SPEECH_PADDING_MS, Math.round(keepMs / 2));
    const sourceInMs = Math.max(0, Math.max(first.startMs - pad, prevEnd));
    const sourceOutMs = Math.min(t.durationMs, Math.min(last.endMs + pad, nextStart));
    return { id: `speech_${String(n + 1).padStart(2, "0")}`, assetId: t.assetId, sourceInMs, sourceOutMs, wordIds: g.map((w) => w.id) };
  });
}

/** Склеивает сегменты встык; границы в кадрах — [start, end). Накопление ведётся в кадрах, дрейфа нет. */
export function buildSourceMap(segments: AudioSegment[], fps: number): { map: SourceMapEntry[]; totalFrames: number } {
  const map: SourceMapEntry[] = [];
  let cursor = 0;
  for (const s of segments) {
    const frames = Math.max(1, msToFrames(s.sourceOutMs - s.sourceInMs, fps));
    map.push({ segmentId: s.id, startFrame: cursor, endFrame: cursor + frames, sourceInMs: s.sourceInMs, sourceOutMs: s.sourceOutMs });
    cursor += frames;
  }
  return { map, totalFrames: cursor };
}

/** Время слова в итоговых кадрах или null, если слово исключено. */
export function wordFrameRange(w: Word, map: SourceMapEntry[], fps: number): [number, number] | null {
  const e = map.find((m) => w.startMs >= m.sourceInMs && w.startMs < m.sourceOutMs);
  if (!e) return null;
  const start = e.startFrame + msToFrames(w.startMs - e.sourceInMs, fps);
  const end = Math.min(e.endFrame, e.startFrame + Math.max(1, msToFrames(Math.min(w.endMs, e.sourceOutMs) - e.sourceInMs, fps)));
  return [Math.min(start, e.endFrame - 1), Math.max(end, start + 1)];
}
