import { Style, TimelinePlan, TimelinePlanSchema, Transcript, insertTexts } from "@aa/schema";
import { MIN_SCENE_FRAMES } from "./planner";

export interface ValidationContext {
  transcript: Transcript;
  style: Style;
  /** Длительности известных ассетов в мс. */
  assetDurationsMs: Record<string, number>;
  requiredPhrases?: string[];
  /** Утверждённые пользователем тексты и цифры (задание, тезисы): единственный источник фактов для вставок. */
  approvedTexts?: string[];
}
export interface Issue { code: string; message: string; sceneId?: string }

export function validatePlan(raw: unknown, ctx: ValidationContext): Issue[] {
  const parsed = TimelinePlanSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => ({ code: "schema", message: `${i.path.join(".")}: ${i.message}` }));
  const p: TimelinePlan = parsed.data;
  const issues: Issue[] = [];
  const add = (code: string, message: string, sceneId?: string) => issues.push({ code, message, sceneId });

  // непрерывное покрытие сцен
  let cursor = 0;
  for (const s of p.visualScenes) {
    if (s.startFrame !== cursor) add("coverage", `Разрыв или наложение: ожидался кадр ${cursor}, получен ${s.startFrame}`, s.sceneId);
    cursor = s.startFrame + s.durationFrames;
    if (s.durationFrames < MIN_SCENE_FRAMES && p.visualScenes.length > 1) add("min_scene", "Сцена короче 1,5 с", s.sceneId);
    if (!ctx.style.allowedCompositions.includes(s.composition)) add("composition", `Композиция ${s.composition} запрещена стилем`, s.sceneId);
    if (s.visual) {
      const dur = ctx.assetDurationsMs[s.visual.assetId];
      if (dur === undefined) add("asset", `Неизвестный ассет ${s.visual.assetId}`, s.sceneId);
      else if (s.visual.sourceOutMs > dur || s.visual.sourceInMs >= s.visual.sourceOutMs) add("asset_range", "Интервал вне длительности файла", s.sceneId);
      else if (s.visual.sourceOutMs - s.visual.sourceInMs < (s.durationFrames * 1000) / p.fps - 40) add("broll_short", "Перебивка короче сцены", s.sceneId);
    }
  }
  if (cursor !== p.totalFrames) add("coverage", `Сцены покрывают ${cursor} кадров из ${p.totalFrames}`);

  // sourceMap
  let c2 = 0;
  const segIds = new Set(p.audioSegments.map((a) => a.id));
  for (const m of p.sourceMap) {
    if (m.startFrame !== c2) add("sourcemap", `sourceMap: разрыв на кадре ${c2}`);
    c2 = m.endFrame;
    if (!segIds.has(m.segmentId)) add("sourcemap", `sourceMap ссылается на ${m.segmentId}`);
    if (m.sourceOutMs > ctx.transcript.durationMs) add("sourcemap", "Интервал речи вне длительности исходника");
  }
  if (c2 !== p.totalFrames) add("sourcemap", "sourceMap не покрывает ролик");

  // речь и слова
  const wordIds = new Set(ctx.transcript.words.map((w) => w.id));
  const usedWords = new Set(p.audioSegments.flatMap((a) => a.wordIds));
  for (const id of usedWords) if (!wordIds.has(id)) add("word", `Неизвестное слово ${id}`);
  for (const c of p.captions) {
    for (const id of c.wordIds) if (!usedWords.has(id)) add("caption", `Подпись содержит слово ${id}, которого нет в речи`);
    if (c.lines.some((l) => l.length > ctx.style.captions.maxCharsPerLine)) add("caption", "Строка подписи длиннее лимита");
  }
  const sceneSegs = p.visualScenes.flatMap((s) => s.speechSegmentIds);
  if (sceneSegs.length !== segIds.size || sceneSegs.some((id) => !segIds.has(id))) add("speech", "Сцены не покрывают речь один раз");
  for (const s of p.visualScenes)
    for (const f of s.overlay?.factRefs ?? []) if (!wordIds.has(f)) add("fact", `Текст графики ссылается на несуществующую фразу ${f}`, s.sceneId);

  // вставки: только графическая композиция; числа берутся из речи или утверждённых текстов
  for (const sc of p.visualScenes) {
    if (!sc.insert) continue;
    if (sc.composition !== "graphic_full") add("insert", "Вставка допустима только в сцене graphic_full", sc.sceneId);
    const source = [...sc.insert.factRefs.map((id) => ctx.transcript.words.find((w) => w.id === id)?.text ?? ""), ...(ctx.approvedTexts ?? [])].join(" ");
    for (const f of sc.insert.factRefs) if (!wordIds.has(f)) add("fact", `Вставка ссылается на несуществующее слово ${f}`, sc.sceneId);
    for (const n of insertTexts(sc.insert.spec).join(" ").match(/\d+(?:[.,]\d+)?/g) ?? [])
      if (!source.includes(n)) add("fact_number", `Число «${n}» во вставке не найдено в речи или утверждённом задании`, sc.sceneId);
  }

  // обязательные тезисы
  const spoken = ctx.transcript.words.filter((w) => usedWords.has(w.id)).map((w) => w.text.toLowerCase()).join(" ");
  for (const ph of ctx.requiredPhrases ?? []) if (!spoken.includes(ph.toLowerCase())) add("required", `Обязательный тезис пропал: «${ph}»`);
  return issues;
}
