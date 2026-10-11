import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { FPS, HEIGHT, InsertParams, InsertSpec, Style, WIDTH } from "@aa/schema";
import { INSERT_TEMPLATE_VERSION, buildInsertHtml } from "@aa/inserts";
import { probe } from "./ffprobe";

const run = promisify(execFile);
const require_ = createRequire(import.meta.url);
const HF_VERSION: string = require_("hyperframes/package.json").version;
const GSAP_FILE = require_.resolve("gsap/dist/gsap.min.js");
const HF_BIN = resolve(import.meta.dirname, "../../../node_modules/.bin/hyperframes");

export interface InsertJob {
  sceneId: string;
  spec: InsertSpec;
  params: InsertParams;
  brand: Style["brand"];
  durationFrames: number;
  fps?: number;
  /** Файл шрифта из сохранённой версии бренд-кита (TTF/OTF/WOFF2). */
  fontFile?: string;
}
export interface InsertResult {
  ok: boolean;
  file?: string;
  cacheHit: boolean;
  renderMs: number;
  key: string;
  /** Использована предыдущая успешная версия вставки этой сцены. */
  usedPrevious?: boolean;
  error?: string;
}

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** Ключ кэша: шаблон, содержание, стиль, материалы, длительность и версии движка. */
export function insertCacheKey(job: InsertJob): string {
  const fontHash = job.fontFile ? sha(readFileSync(job.fontFile)) : null;
  return sha(canonical({
    kind: job.spec.kind, tpl: INSERT_TEMPLATE_VERSION, hf: HF_VERSION, data: job.spec.data, params: job.params,
    brand: job.brand, frames: job.durationFrames, fps: job.fps ?? FPS, size: [WIDTH, HEIGHT], fontHash,
  }));
}

export async function renderInsert(job: InsertJob, cacheDir: string, opts: { timeoutMs?: number; workers?: number } = {}): Promise<InsertResult> {
  const fps = job.fps ?? FPS;
  const key = insertCacheKey(job);
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${key}.mp4`);
  const lastPtr = join(cacheDir, `last-${job.sceneId}.txt`);
  if (existsSync(cached)) {
    writeFileSync(lastPtr, key);
    return { ok: true, file: cached, cacheHit: true, renderMs: 0, key };
  }

  const t0 = Date.now();
  const dir = mkdtempSync(join(tmpdir(), "aa-insert-"));
  try {
    let fontName: string | undefined;
    if (job.fontFile) {
      fontName = `${sha(readFileSync(job.fontFile)).slice(0, 16)}${extname(job.fontFile).toLowerCase()}`;
      mkdirSync(join(dir, "assets"));
      copyFileSync(job.fontFile, join(dir, "assets", fontName));
    }
    copyFileSync(GSAP_FILE, join(dir, "gsap.min.js"));
    writeFileSync(join(dir, "index.html"), buildInsertHtml({ kind: job.spec.kind, durationSeconds: job.durationFrames / fps, fontFile: fontName }));
    writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }));
    const brand = { ...job.brand, fontFamily: fontName ? `BrandFont, ${job.brand.fontFamily}` : job.brand.fontFamily };
    writeFileSync(join(dir, "vars.json"), JSON.stringify({ payload: JSON.stringify({ brand, params: job.params, data: job.spec.data }) }));

    const out = join(dir, "out.mp4");
    // execFile без оболочки: пользовательские данные идут только в vars.json
    await run(HF_BIN, ["render", dir, "-o", out, "--variables-file", join(dir, "vars.json"), "--fps", String(fps), "--resolution", "portrait", "--format", "mp4", "--video-bitrate", "10M", "--workers", String(opts.workers ?? 2), "--strict", "--quiet"],
      { timeout: opts.timeoutMs ?? 180_000, env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" }, maxBuffer: 32 << 20 });

    const info = probe(out);
    const frames = Math.round(((info.durationMs ?? 0) * fps) / 1000);
    if (info.width !== WIDTH || info.height !== HEIGHT) throw new Error(`Размер вставки ${info.width}×${info.height}, ожидалось ${WIDTH}×${HEIGHT}`);
    if (Math.abs(frames - job.durationFrames) > 1) throw new Error(`Длительность вставки ${frames} кадров, ожидалось ${job.durationFrames}`);

    renameOrCopy(out, cached);
    writeFileSync(lastPtr, key);
    return { ok: true, file: cached, cacheHit: false, renderMs: Date.now() - t0, key };
  } catch (e: any) {
    const error = String(e?.stderr || e?.message || e).split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400);
    // при ошибке — предыдущая успешная вставка этой сцены, иначе вызывающий покажет основной кадр
    if (existsSync(lastPtr)) {
      const prev = join(cacheDir, `${readFileSync(lastPtr, "utf8").trim()}.mp4`);
      if (existsSync(prev)) return { ok: false, file: prev, usedPrevious: true, cacheHit: false, renderMs: Date.now() - t0, key, error };
    }
    return { ok: false, cacheHit: false, renderMs: Date.now() - t0, key, error };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function renameOrCopy(a: string, b: string) {
  try { renameSync(a, b); } catch { copyFileSync(a, b); }
}
