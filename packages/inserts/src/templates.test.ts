import { describe, expect, it } from "vitest";
import { INSERT_KINDS } from "@aa/schema";
import { buildInsertHtml } from "./templates";

describe("шаблоны вставок", () => {
  it.each(INSERT_KINDS)("%s: собирается, длительность задана, данные в HTML не попадают", (kind) => {
    const html = buildInsertHtml({ kind, durationSeconds: 3.7333 });
    expect(html).toContain('data-duration="3.7333"');
    expect(html).toContain('window.__timelines["insert"]');
    expect(html).not.toMatch(/innerHTML|eval\(|new Function/);
    expect(html).not.toContain("http"); // GSAP и шрифты только локальные
  });
  it("отклоняет некорректное имя шрифта и длительность", () => {
    expect(() => buildInsertHtml({ kind: "title", durationSeconds: 2, fontFile: '../x"onload=1.ttf' })).toThrow();
    expect(() => buildInsertHtml({ kind: "title", durationSeconds: 0 })).toThrow();
    expect(buildInsertHtml({ kind: "title", durationSeconds: 2, fontFile: "0123456789abcdef.ttf" })).toContain("assets/0123456789abcdef.ttf");
  });
});
