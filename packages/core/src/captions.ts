import { Caption, SourceMapEntry, Transcript } from "@aa/schema";
import { wordFrameRange } from "./speech";

/** Разбивает слова на блоки до maxLines строк по maxChars символов; слова не режутся. */
export function buildCaptions(t: Transcript, map: SourceMapEntry[], fps: number, maxChars = 32, maxLines = 2): Caption[] {
  const out: Caption[] = [];
  let lines: string[] = [], cur = "", ids: string[] = [], start = -1, end = 0;
  const flush = () => {
    if (cur) lines.push(cur);
    if (lines.length) out.push({ startFrame: start, endFrame: Math.max(end, start + 1), lines, wordIds: ids });
    lines = []; cur = ""; ids = []; start = -1;
  };
  for (const w of t.words) {
    const r = wordFrameRange(w, map, fps);
    if (!r) continue;
    const next = cur ? `${cur} ${w.text}` : w.text;
    if (next.length > maxChars && cur) {
      lines.push(cur); cur = w.text;
      if (lines.length >= maxLines) { const carry = { text: cur }; cur = ""; flush(); cur = carry.text; }
    } else cur = next;
    if (start < 0) start = r[0];
    ids.push(w.id); end = r[1];
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  // следующая подпись не начинается раньше конца предыдущей
  for (let i = 1; i < out.length; i++) if (out[i].startFrame < out[i - 1].endFrame) out[i - 1].endFrame = out[i].startFrame;
  return out.filter((c) => c.endFrame > c.startFrame);
}
