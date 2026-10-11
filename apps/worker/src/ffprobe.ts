import { execFileSync, spawnSync } from "node:child_process";

export interface MediaInfo { durationMs: number; width?: number; height?: number; fps?: number; hasAudio: boolean; videoCodec?: string }

export function probe(file: string): MediaInfo {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8" }));
  const v = j.streams.find((s: any) => s.codec_type === "video");
  const [n, d] = (v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  return {
    durationMs: Math.round(Number(j.format.duration) * 1000),
    width: v?.width, height: v?.height, fps: d ? n / d : undefined, videoCodec: v?.codec_name,
    hasAudio: j.streams.some((s: any) => s.codec_type === "audio"),
  };
}

function r128(file: string) {
  const r = spawnSync("ffmpeg", ["-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const out = r.stderr, sum = out.slice(out.lastIndexOf("Summary:"));
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1];
  const peak = /Peak:\s+(-?[\d.]+) dBFS/.exec(sum)?.[1];
  return { lufs: lufs ? Number(lufs) : NaN, truePeak: peak ? Number(peak) : NaN };
}

/** Громкость и true peak итогового файла (EBU R128). */
export const measureLoudness = r128;

/** Двухпроходная нормализация звука до −16 LUFS / −1,5 dBTP; видео копируется без перекодирования. */
export function normalizeAudio(input: string, output: string, targetLufs = -16, tp = -1.5) {
  const m = spawnSync("ffmpeg", ["-nostats", "-i", input, "-af", `loudnorm=I=${targetLufs}:TP=${tp}:LRA=11:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf("{"), m.stderr.lastIndexOf("}") + 1));
  const f = `loudnorm=I=${targetLufs}:TP=${tp}:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-c:v", "copy", "-af", f, "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
}
