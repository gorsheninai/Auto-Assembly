import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";
import type { Scene, Style, TimelinePlan } from "@aa/schema";

export interface VideoProps {
  plan: TimelinePlan;
  style: Style;
  /** assetId -> имя файла в public-каталоге */
  files: Record<string, string>;
  [k: string]: unknown;
}

const ms2f = (ms: number, fps: number) => Math.round((ms * fps) / 1000);
// Безопасная область важного текста для 1080×1920 (ТЗ п. 12)
const SAFE = { x: 90, y: 180, w: 810, h: 1350 };

export const Video: React.FC<VideoProps> = ({ plan, style, files }) => {
  const { fps } = plan;
  const font = style.brand.fontFamily;
  return (
    <AbsoluteFill style={{ background: style.brand.background, fontFamily: font }}>
      {/* Основная речь: каждый сегмент — кусок исходника, склеенный встык */}
      {plan.sourceMap.map((m) => {
        const seg = plan.audioSegments.find((a) => a.id === m.segmentId)!;
        return (
          <Sequence key={m.segmentId} from={m.startFrame} durationInFrames={m.endFrame - m.startFrame}>
            <OffthreadVideo src={staticFile(files[seg.assetId])} startFrom={ms2f(m.sourceInMs, fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        );
      })}
      {plan.visualScenes.map((s) => (
        <Sequence key={s.sceneId} from={s.startFrame} durationInFrames={s.durationFrames}>
          <SceneLayer scene={s} files={files} style={style} fps={fps} />
        </Sequence>
      ))}
      {plan.captions.map((c, i) => (
        <Sequence key={i} from={c.startFrame} durationInFrames={c.endFrame - c.startFrame}>
          <div style={{ position: "absolute", left: SAFE.x, width: SAFE.w, top: 1380, textAlign: "center" }}>
            <span style={{ background: "rgba(0,0,0,.65)", color: style.brand.text, fontSize: 56, fontWeight: 700, lineHeight: 1.3, padding: "6px 18px", borderRadius: 12, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
              {c.lines.map((l, j) => (<React.Fragment key={j}>{j > 0 && <br />}{l}</React.Fragment>))}
            </span>
          </div>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

const SceneLayer: React.FC<{ scene: Scene; files: Record<string, string>; style: Style; fps: number }> = ({ scene, files, style, fps }) => {
  if (scene.composition === "broll_full" && scene.visual) {
    return <OffthreadVideo muted src={staticFile(files[scene.visual.assetId])} startFrom={ms2f(scene.visual.sourceInMs, fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }
  if (scene.composition === "graphic_full" && scene.overlay) {
    // подгоняем размер, чтобы самое длинное слово помещалось в безопасную область (ширина буквы ≈ 0,66 кегля у жирного кириллического шрифта)
    const longest = Math.max(...scene.overlay.text.split(/\s+/).map((w) => w.length));
    const size = Math.max(48, Math.min(96, Math.floor(SAFE.w / (longest * 0.66))));
    return (
      <AbsoluteFill style={{ background: style.brand.primary, justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: SAFE.w, color: style.brand.text, fontSize: size, fontWeight: 800, textAlign: "center", lineHeight: 1.15 }}>{scene.overlay.text}</div>
        <div style={{ position: "absolute", bottom: 420, width: 240, height: 12, background: style.brand.accent, borderRadius: 6 }} />
      </AbsoluteFill>
    );
  }
  if (scene.composition === "speaker_graphic" && scene.overlay) {
    return (
      <div style={{ position: "absolute", left: SAFE.x, top: SAFE.y, background: style.brand.accent, color: style.brand.text, fontSize: 72, fontWeight: 800, padding: "18px 32px", borderRadius: 20 }}>{scene.overlay.text}</div>
    );
  }
  return null;
};
