import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { InsertSpec, Style } from "@aa/schema";

export interface InsertBenchProps { spec: InsertSpec; brand: Style["brand"]; intensity: "calm" | "dynamic"; [k: string]: unknown }

/** Аналог вставок HyperFrames на Remotion — только для сравнения скорости и вида. */
export const InsertBench: React.FC<InsertBenchProps> = ({ spec, brand, intensity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const K = intensity === "dynamic" ? 0.65 : 1;
  const ease = Easing.out(Easing.cubic);
  const at = (t: number, d = 0.5) => interpolate(f, [t * K * fps, (t + d) * K * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = (t: number, dy = 40) => ({ opacity: at(t), transform: `translateY(${(1 - at(t)) * dy}px)` });
  const txt: React.CSSProperties = { fontWeight: 800, lineHeight: 1.12, width: 900, textAlign: "center" };
  const fitSize = (s: string, max: number, min: number) => Math.max(min, Math.min(max, Math.floor(900 / (Math.max(...s.split(/\s+/).map((w) => w.length)) * 0.66))));
  const card: React.CSSProperties = { display: "flex", alignItems: "center", gap: 28, width: 900, padding: "26px 34px", borderRadius: 28, background: "rgba(255,255,255,.1)", marginTop: 22 };
  const dot: React.CSSProperties = { width: 76, height: 76, borderRadius: 38, background: brand.accent, color: brand.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, fontWeight: 800, flex: "none" };
  let body: React.ReactNode = null;
  if (spec.kind === "big_number") body = (<>
    <div style={{ ...txt, color: brand.accent, fontSize: fitSize(spec.data.value, 380, 120), opacity: at(0, 0.7), transform: `scale(${0.6 + 0.4 * at(0, 0.7)})` }}>{spec.data.value}</div>
    <div style={{ height: 14, width: 240 * at(0.35), background: brand.accent, borderRadius: 7, margin: "36px 0 44px" }} />
    <div style={{ ...txt, fontSize: fitSize(spec.data.label, 76, 44), ...fade(0.5) }}>{spec.data.label}</div>
    {spec.data.caption && <div style={{ ...txt, fontWeight: 500, fontSize: 44, marginTop: 28, ...fade(0.8, 30), opacity: 0.75 * at(0.8) }}>{spec.data.caption}</div>}
  </>);
  if (spec.kind === "list") body = (<>
    <div style={{ ...txt, fontSize: fitSize(spec.data.title, 84, 48), marginBottom: 34, ...fade(0, -40) }}>{spec.data.title}</div>
    {spec.data.items.map((it, i) => (<div key={i} style={{ ...card, opacity: at(0.35 + 0.28 * i), transform: `translateX(${(1 - at(0.35 + 0.28 * i)) * -80}px)` }}><div style={dot}>{i + 1}</div><div style={{ ...txt, textAlign: "left", fontSize: 54, flex: 1, fontWeight: 700 }}>{it}</div></div>))}
  </>);
  if (spec.kind === "comparison") {
    const panel = (s: { title: string; value?: string }, bg: string, fg: string, t: number, dy: number) => (
      <div style={{ width: 900, padding: "44px 40px", borderRadius: 36, background: bg, color: fg, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, opacity: at(t), transform: `translateY(${(1 - at(t)) * dy}px)` }}>
        <div style={{ ...txt, fontSize: fitSize(s.title, 84, 44) }}>{s.title}</div>{s.value && <div style={{ ...txt, fontSize: 120 }}>{s.value}</div>}
      </div>);
    body = (<>{panel(spec.data.left, "rgba(255,255,255,.12)", brand.text, 0, -70)}<div style={{ ...dot, margin: "-6px 0", transform: `scale(${at(0.45, 0.35)})` }}>/</div>{panel(spec.data.right, brand.accent, brand.primary, 0.25, 70)}</>);
  }
  if (spec.kind === "title") body = (<>
    {spec.data.kicker && <div style={{ ...txt, fontSize: 44, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: brand.accent, marginBottom: 34, ...fade(0, -30) }}>{spec.data.kicker}</div>}
    <div style={{ ...txt, fontSize: fitSize(spec.data.text, 120, 56), ...fade(0.15, 50) }}>{spec.data.text}</div>
    <div style={{ height: 14, width: 240 * at(0.6), background: brand.accent, borderRadius: 7, marginTop: 48 }} />
  </>);
  if (spec.kind === "steps") body = (<>
    {spec.data.steps.map((s, i) => (<div key={i} style={{ ...card, background: "transparent", marginTop: 70, padding: "0 20px", opacity: at(0.25 + 0.3 * i), transform: `translateX(${(1 - at(0.25 + 0.3 * i)) * -60}px)` }}><div style={dot}>{i + 1}</div><div style={{ ...txt, textAlign: "left", fontSize: 60, flex: 1, fontWeight: 700 }}>{s}</div></div>))}
  </>);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${brand.primary} 0%, #0d1530 100%)`, fontFamily: brand.fontFamily, color: brand.text }}>
      <div style={{ position: "absolute", left: 90, top: 200, width: 900, height: 1100, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>{body}</div>
    </AbsoluteFill>
  );
};
