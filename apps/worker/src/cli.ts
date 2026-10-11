import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { MockStt } from "@aa/adapters";
import { planTimeline, validatePlan } from "@aa/core";
import { Style, StyleSchema, TimelinePlanSchema } from "@aa/schema";
import { renderInsert } from "./inserts";
import { measureLoudness, normalizeAudio, probe } from "./ffprobe";

const root = resolve(import.meta.dirname, "../../..");
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

const speaker = resolve(arg("speaker", `${root}/fixtures/speaker.mp4`));
const broll = resolve(arg("broll", `${root}/fixtures/broll.mp4`));
const transcriptJson = resolve(arg("transcript", `${root}/fixtures/speech.json`));
const outFile = resolve(arg("out", `${root}/out/result.mp4`));
const browserExecutable = process.env.BROWSER_EXECUTABLE ?? (existsSync("/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell") ? "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell" : undefined);
const rawFile = resolve(`${root}/out/raw.mp4`);
const work = resolve(`${root}/out/work`);

const style: Style = StyleSchema.parse({
  id: "calm_expert", version: "1", pauseMode: "normal",
  brand: { primary: "#14213d", accent: "#fca311", text: "#ffffff", background: "#000000", fontFamily: "DejaVu Sans, sans-serif" },
  captions: { enabled: true },
  allowedCompositions: ["speaker_full", "graphic_full", "broll_full", "speaker_graphic"],
});

const t0 = Date.now();
const lap = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

for (const f of [speaker, broll, transcriptJson]) if (!existsSync(f)) throw new Error(`Нет файла ${f}. Запустите: pnpm fixture`);
const speakerInfo = probe(speaker), brollInfo = probe(broll);
lap(`ffprobe: спикер ${speakerInfo.durationMs} мс, перебивка ${brollInfo.durationMs} мс`);

const transcript = await new MockStt(transcriptJson).transcribe({ assetId: "speaker", filePath: speaker });
const word = (t: string) => transcript.words.find((w) => w.text.toLowerCase().startsWith(t))?.id;
const inserts = process.argv.includes("--no-inserts") ? [] : [
  { sceneIndex: 1, spec: { kind: "big_number" as const, data: { value: "20%", label: "Первый взнос", caption: "от двадцати процентов" } }, factRefs: [word("двадцати")!] },
  { sceneIndex: 2, spec: { kind: "list" as const, data: { title: "3 ошибки покупателя", items: ["Спешка", "Скидки", "Договор"] } }, factRefs: [word("три")!, word("спешка")!] },
  { sceneIndex: 3, spec: { kind: "comparison" as const, data: { left: { title: "Аренда" }, right: { title: "Ипотека" } } }, factRefs: [word("аренда")!, word("ипотека")!] },
];
const approvedTexts = ["Первый взнос — от 20%", "3 ошибки покупателя"];
const plan = TimelinePlanSchema.parse(planTimeline({ transcript, style, inserts, broll: [{ assetId: "broll", durationMs: brollInfo.durationMs }], sceneSeconds: [1, 3] }));
const issues = validatePlan(plan, { transcript, style, assetDurationsMs: { speaker: speakerInfo.durationMs, broll: brollInfo.durationMs }, approvedTexts });
mkdirSync(resolve(root, "out"), { recursive: true });
writeFileSync(resolve(root, "out/plan.json"), JSON.stringify(plan, null, 2));
lap(`план: ${plan.visualScenes.length} сцен, ${plan.totalFrames} кадров (${(plan.totalFrames / plan.fps).toFixed(1)} с), замечаний: ${issues.length}`);
if (issues.length) { console.error(issues); process.exit(1); }

// Вставки HyperFrames: отдельные MP4 по сценам, кэш по содержанию; ошибка одной не останавливает ролик
const insertFiles: Record<string, string> = {};
const insertReport: unknown[] = [];
for (const sc of plan.visualScenes) {
  if (!sc.insert) continue;
  const r = await renderInsert({ sceneId: sc.sceneId, spec: sc.insert.spec, params: sc.insert.params, brand: style.brand, durationFrames: sc.durationFrames }, resolve(root, "out/insert-cache"));
  insertReport.push({ scene: sc.sceneId, kind: sc.insert.spec.kind, frames: sc.durationFrames, ok: r.ok, cacheHit: r.cacheHit, renderMs: r.renderMs, error: r.error });
  if (r.file) insertFiles[sc.sceneId] = r.file;
  if (!r.ok) sc.warnings.push(`Вставка не создана: ${r.error}${r.usedPrevious ? " — использована предыдущая версия" : " — показан основной кадр"}`);
  lap(`вставка ${sc.sceneId} (${sc.insert.spec.kind}): ${r.ok ? (r.cacheHit ? "из кэша" : `${(r.renderMs / 1000).toFixed(1)} с`) : "ОШИБКА " + r.error}`);
}
rmSync(work, { recursive: true, force: true });
mkdirSync(`${work}/public`, { recursive: true });
for (const [src, name] of [[speaker, "speaker.mp4"], [broll, "broll.mp4"]]) { try { linkSync(src, `${work}/public/${name}`); } catch { copyFileSync(src, `${work}/public/${name}`); } }
const insertNames: Record<string, string> = {};
for (const [sceneId, f] of Object.entries(insertFiles)) { insertNames[sceneId] = `insert_${sceneId}.mp4`; try { linkSync(f, `${work}/public/${insertNames[sceneId]}`); } catch { copyFileSync(f, `${work}/public/${insertNames[sceneId]}`); } }
const files = { speaker: "speaker.mp4", broll: "broll.mp4" };

const serveUrl = await bundle({ entryPoint: resolve(root, "packages/remotion/src/entry.ts"), publicDir: `${work}/public`,
  webpackOverride: (c) => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias as object), "@aa/schema": resolve(root, "packages/schema/src/index.ts") } } }) });
lap("бандл собран");
const inputProps = { plan, style, files, inserts: insertNames };
const composition = await selectComposition({ serveUrl, browserExecutable, chromiumOptions: { gl: "swangle" }, id: "Main", inputProps });
await renderMedia({ composition, browserExecutable, chromiumOptions: { gl: "swangle" }, serveUrl, codec: "h264", outputLocation: rawFile, inputProps, crf: 18, audioBitrate: "192k", pixelFormat: "yuv420p", concurrency: 2,
  onProgress: ({ progress }) => { if (Math.round(progress * 100) % 25 === 0) process.stdout.write(`\r  рендер ${Math.round(progress * 100)}%`); } });
console.log();
lap("рендер завершён");

normalizeAudio(rawFile, outFile);
lap("звук нормализован");
const r = probe(outFile), l = measureLoudness(outFile);
console.log(JSON.stringify(insertReport, null, 1));
console.log(JSON.stringify({ file: basename(outFile), ...r, expectedMs: Math.round((plan.totalFrames / plan.fps) * 1000), ...l }, null, 2));
