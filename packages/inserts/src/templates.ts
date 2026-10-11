import type { InsertKind } from "@aa/schema";

/** Версия набора шаблонов: входит в ключ кэша, меняется при любой правке вёрстки или анимации. */
export const INSERT_TEMPLATE_VERSION = "2";

/** Рамки безопасной области вставок (px, кадр 1080×1920). Низ оставлен под субтитры. */
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:var(--bg)}
#root{position:relative;width:1080px;height:1920px;font-family:var(--font);color:var(--text);background:linear-gradient(160deg,var(--primary) 0%,color-mix(in srgb,var(--primary) 70%,#000) 100%)}
#stage{position:absolute;left:90px;top:200px;width:900px;height:1100px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.bar{height:14px;width:240px;background:var(--accent);border-radius:7px;transform-origin:left center}
.txt{overflow-wrap:normal;word-break:normal;hyphens:manual;line-height:1.12;font-weight:800}
.card{display:flex;align-items:center;gap:28px;width:900px;padding:26px 34px;border-radius:28px;background:rgba(255,255,255,.1);text-align:left;margin-top:22px}
.dot{position:relative;z-index:1;flex:none;width:76px;height:76px;border-radius:50%;background:var(--accent);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:800}
.panel{width:900px;padding:44px 40px;border-radius:36px;display:flex;flex-direction:column;align-items:center;gap:14px}
`;

/** Общий скрипт: данные приходят JSON-строкой переменной и попадают в DOM только как textContent. */
const COMMON = `
const P = JSON.parse(window.__hyperframes.getVariables().payload);
const {brand, params, data} = P;
const R = document.getElementById("root"), S = document.getElementById("stage");
for (const [k, v] of Object.entries({"--primary":brand.primary,"--accent":brand.accent,"--text":brand.text,"--bg":brand.background,"--font":brand.fontFamily})) document.documentElement.style.setProperty(k, v);
const dyn = params.intensity === "dynamic", K = dyn ? 0.65 : 1, EASE = dyn ? "back.out(1.5)" : "power3.out";
const D = Number(R.getAttribute("data-duration"));
function el(tag, cls, text, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; (parent || S).appendChild(e); return e; }
function fit(e, max, min, maxH) { let s = max; e.style.fontSize = s + "px"; while (s > min && (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > maxH)) { s -= 2; e.style.fontSize = s + "px"; } }
const tl = gsap.timeline({ paused: true });
`;

const END = `
window.__timelines = window.__timelines || {};
window.__timelines["insert"] = tl;
tl.seek(0);
`;

const BODY: Record<InsertKind, string> = {
  big_number: `
const v = el("div","txt",data.value); v.style.cssText="width:900px;color:var(--accent);"; fit(v,380,120,420);
const bar = el("div","bar"); bar.style.margin="36px 0 44px";
const l = el("div","txt",data.label); l.style.cssText="width:900px;"; fit(l,76,44,260);
const c = data.caption ? el("div","txt",data.caption) : null; if (c) { c.style.cssText="width:900px;font-weight:500;opacity:.75;margin-top:28px;"; fit(c,44,30,160); }
tl.from(v,{opacity:0,scale:0.6,duration:0.7*K,ease:EASE},0);
tl.from(bar,{scaleX:0,duration:0.5*K,ease:"power2.out"},0.35*K);
tl.from(l,{opacity:0,y:40,duration:0.5*K,ease:EASE},0.5*K);
if (c) tl.from(c,{opacity:0,y:30,duration:0.5*K,ease:EASE},0.8*K);`,

  list: `
const t = el("div","txt",data.title); t.style.cssText="width:900px;margin-bottom:34px;"; fit(t,84,48,300);
tl.from(t,{opacity:0,y:-40,duration:0.5*K,ease:EASE},0);
data.items.forEach((it,i) => {
  const c = el("div","card"); const d = el("div","dot",String(i+1),c);
  const x = el("div","txt",it,c); x.style.cssText="flex:1;width:700px;font-weight:700;"; fit(x,54,32,150);
  tl.from(c,{opacity:0,x:-80,duration:0.5*K,ease:EASE},(0.35+0.28*i)*K);
});`,

  comparison: `
function panel(side, bg, fg, delay, from) {
  const p = el("div","panel"); p.style.background = bg; p.style.color = fg;
  const t = el("div","txt",side.title,p); t.style.cssText="width:820px;"; fit(t,84,44,220);
  if (side.value) { const v = el("div","txt",side.value,p); v.style.cssText="width:820px;font-size:120px;"; fit(v,150,60,200); }
  tl.from(p,{opacity:0,y:from,duration:0.6*K,ease:EASE},delay*K); return p;
}
panel(data.left,"rgba(255,255,255,.12)","var(--text)",0,-70);
const vs = el("div","dot","/"); vs.style.margin="-6px 0"; tl.from(vs,{scale:0,duration:0.35*K,ease:EASE},0.45*K);
panel(data.right,"var(--accent)","var(--primary)",0.25,70);`,

  title: `
if (data.kicker) { const k = el("div","txt",data.kicker); k.style.cssText="width:900px;font-size:44px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:34px;"; fit(k,44,28,120); tl.from(k,{opacity:0,y:-30,duration:0.4*K,ease:EASE},0); }
const t = el("div","txt",data.text); t.style.cssText="width:900px;"; fit(t,120,56,640);
const bar = el("div","bar"); bar.style.marginTop="48px";
tl.from(t,{opacity:0,y:50,duration:0.7*K,ease:EASE},0.15*K);
tl.from(bar,{scaleX:0,duration:0.5*K,ease:"power2.out"},0.6*K);`,

  steps: `
const cards = data.steps.map((st,i) => {
  const c = el("div","card"); c.style.margin="70px 0 0 0"; c.style.background="transparent"; c.style.padding="0 20px";
  el("div","dot",String(i+1),c); const x = el("div","txt",st,c); x.style.cssText="flex:1;width:700px;font-weight:700;"; fit(x,60,34,160);
  return c;
});
// соединительная линия строится по фактическому положению первой и последней точки
const dots = S.querySelectorAll(".dot"), sb = S.getBoundingClientRect(), d0 = dots[0].getBoundingClientRect(), d2 = dots[2].getBoundingClientRect();
const line = el("div",""); line.style.cssText = "position:absolute;width:10px;border-radius:5px;background:rgba(255,255,255,.25);transform-origin:top center;left:" + (d0.left - sb.left + d0.width/2 - 5) + "px;top:" + (d0.top - sb.top + d0.height/2) + "px;height:" + (d2.top - d0.top) + "px;";
tl.from(line,{scaleY:0,duration:0.9*K,ease:"power2.inOut"},0);
cards.forEach((c,i) => tl.from(c,{opacity:0,x:-60,duration:0.5*K,ease:EASE},(0.25+0.3*i)*K));`,
};

export interface BuildHtmlOptions {
  kind: InsertKind;
  durationSeconds: number;
  /** Имя файла шрифта внутри проекта (генерируется системой, не пользователем). */
  fontFile?: string;
}

/** Собирает самостоятельный HTML-проект вставки. Пользовательский текст в HTML не попадает. */
export function buildInsertHtml({ kind, durationSeconds, fontFile }: BuildHtmlOptions): string {
  if (!(durationSeconds > 0 && durationSeconds < 600)) throw new Error("Некорректная длительность вставки");
  if (fontFile && !/^[a-f0-9]{16}\.(ttf|otf|woff2)$/.test(fontFile)) throw new Error("Некорректное имя файла шрифта");
  const D = durationSeconds.toFixed(4);
  const fontFace = fontFile ? `@font-face{font-family:"BrandFont";src:url("assets/${fontFile}")}` : "";
  return `<!doctype html>
<html lang="ru" data-composition-variables='[{"id":"payload","type":"string","label":"Данные вставки (JSON)","default":"{}"}]'>
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<script src="gsap.min.js"></script>
<style>${fontFace}${CSS}</style>
</head>
<body>
<div id="root" data-composition-id="insert" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
<div id="stage" class="clip" data-start="0" data-duration="${D}" data-track-index="0"></div>
</div>
<script>
${COMMON}${BODY[kind]}${END}
</script>
</body>
</html>
`;
}
