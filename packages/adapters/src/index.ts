import { readFileSync } from "node:fs";
import { Transcript, TranscriptSchema } from "@aa/schema";

/** Адаптер распознавания речи; реальный провайдер выбирается экспериментом (ТЗ п. 22). */
export interface SttAdapter {
  transcribe(input: { assetId: string; filePath: string }): Promise<Transcript>;
}

/** Заглушка: читает готовый транскрипт из JSON. */
export class MockStt implements SttAdapter {
  constructor(private jsonPath: string) {}
  async transcribe({ assetId }: { assetId: string; filePath: string }) {
    const raw = JSON.parse(readFileSync(this.jsonPath, "utf8"));
    return TranscriptSchema.parse({ ...raw, assetId });
  }
}
