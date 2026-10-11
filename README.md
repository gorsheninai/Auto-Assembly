# Auto-Assembly

Веб-приложение для автомонтажа (ТЗ v1.0). Сейчас готов **технический эксперимент, этап 1**:
транскрипт → чистка пауз → sourceMap → план → валидатор → рендер Remotion → MP4 1080×1920, 30 fps, −16 LUFS.

## Структура
- `packages/schema` — Zod-схемы плана, стиля, транскрипта
- `packages/core` — чистка пауз, sourceMap, субтитры, планировщик-заглушка, валидатор плана (тесты рядом)
- `packages/adapters` — интерфейс STT и заглушка `MockStt`
- `packages/remotion` — композиции (`speaker_full`, `graphic_full`, `speaker_graphic`, `broll_full`) и субтитры
- `apps/worker` — FFprobe, рендер, нормализация звука, CLI

## Запуск
```
pnpm install
pnpm fixture      # синтетические speaker.mp4 и broll.mp4
pnpm test
pnpm pipeline     # результат: out/result.mp4, out/plan.json
```
Свои материалы: `pnpm pipeline --speaker a.mp4 --broll b.mp4 --transcript t.json`.
В песочнице без интернета используется предустановленный Chromium (`BROWSER_EXECUTABLE` переопределяет путь).

## Замеры на синтетике (4 vCPU)
Ролик 9,5 с рендерится около 75 с (цель ТЗ для 60 с — p95 ≤ 5 мин на 4 vCPU/8 ГБ; нужно мерить на реальных шаблонах). Итог: 1080×1920, 30 fps, H.264+AAC, −16 LUFS.

## Не сделано (следующие этапы)
Реальный STT и LLM-планировщик, vision, сток, веб-интерфейс, auth, БД, очередь, бюджеты, редактор и ревизии.
