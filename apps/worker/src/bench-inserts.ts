// Сравнение: те же 5 вставок на HyperFrames и на Remotion — время, размер, кадры для визуальной проверки.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { InsertSpec } from "@aa/schema";
import { renderInsert } from "./inserts";
import { probe } from "./ffprobe";

const root = resolve(import.meta.dirname, "../../..");
const out = resolve(root, "out/bench");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const browserExecutable = process.env.BROWSER_EXECUTABLE ?? ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"].find(existsSync);
const brand = { primary: "#14213d", accent: "#fca311", text: "#ffffff", background: "#000000", fontFamily: "DejaVu Sans, sans-serif" };
const FRAMES = 120; // 4 с
const specs: InsertSpec[] = [
  { kind: "big_number", data: { value: "20%", label: "Первый взнос", caption: "от двадцати процентов" } },
  { kind: "list", data: { title: "3 ошибки покупателя", items: ["Спешка", "Скидки", "Договор"] } },
  { kind: "comparison", data: { left: { title: "Аренда" }, right: { title: "Ипотека" } } },
  { kind: "title", data: { kicker: "Блок 2", text: "Как выбрать район без ошибок" } },
  { kind: "steps", data: { steps: ["Загрузите материалы", "Утвердите план", "Скачайте ролик"] } },
];

const serveUrl = await bundle({ entryPoint: resolve(root, "packages/remotion/src/entry.ts"),
  webpackOverride: (c) => ({ ...c, resolve: { ...c.resolve, alias: { ...(c.resolve?.alias as object), "@aa/schema": resolve(root, "packages/schema/src/index.ts") } } }) });

const rows: Record<string, unknown>[] = [];
for (const spec of specs) {
  // HyperFrames (холодный рендер: свежий каталог кэша)
  const hf = await renderInsert({ sceneId: `b_${spec.kind}`, spec, params: { intensity: "calm" }, brand, durationFrames: FRAMES }, `${out}/cache`);
  // Remotion
  const inputProps = { spec, brand, intensity: "calm", frames: FRAMES };
  const comp = await selectComposition({ serveUrl, id: "InsertBench", inputProps, browserExecutable, chromiumOptions: { gl: "swangle" } });
  const rf = `${out}/remotion_${spec.kind}.mp4`;
  const t0 = Date.now();
  await renderMedia({ composition: comp, serveUrl, codec: "h264", outputLocation: rf, inputProps, crf: 18, pixelFormat: "yuv420p", concurrency: 2, browserExecutable, chromiumOptions: { gl: "swangle" }, logLevel: "error" });
  const remotionMs = Date.now() - t0;
  for (const [name, file] of [["hf", hf.file], ["rem", rf]] as const) {
    if (!file) continue;
    for (const t of [0.5, 3]) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=360:-1", `${out}/${spec.kind}_${name}_${t}.png`]);
  }
  rows.push({ kind: spec.kind, hfOk: hf.ok, hfMs: hf.renderMs, hfFrames: hf.file ? Math.round((probe(hf.file).durationMs * 30) / 1000) : null, hfKB: hf.file ? Math.round(statSync(hf.file).size / 1024) : null, hfError: hf.error, remotionMs, remotionKB: Math.round(statSync(rf).size / 1024) });
  console.log(rows.at(-1));
}
// сводные листы кадров: слева HyperFrames, справа Remotion
for (const t of [0.5, 3]) {
  const args = ["-y", "-loglevel", "error"];
  specs.forEach((s) => args.push("-i", `${out}/${s.kind}_hf_${t}.png`, "-i", `${out}/${s.kind}_rem_${t}.png`));
  args.push("-filter_complex", `hstack=inputs=${specs.length * 2}`, `${out}/sheet_${t}.png`);
  execFileSync("ffmpeg", args);
}
writeFileSync(`${out}/results.json`, JSON.stringify(rows, null, 2));
