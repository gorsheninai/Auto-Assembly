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

## Вставки HyperFrames (первая версия)
Анимированные полноэкранные вставки (`big_number`, `list`, `comparison`, `title`, `steps`) рендерит HyperFrames в отдельный немой MP4 1080×1920, 30 fps, H.264; Remotion только размещает файл на таймлайне.
- `packages/schema` — `InsertSpecSchema`, поле `scene.insert`
- `packages/inserts` — HTML-шаблоны. Текст попадает в DOM только как `textContent` из переменной `payload` (`--variables-file`), в HTML и в командную строку не подставляется; GSAP лежит локально
- `apps/worker/src/inserts.ts` — `renderInsert`: ключ кэша (шаблон, версия шаблонов и HyperFrames, текст, стиль, шрифт, кадры), проверка размера и длительности (±1 кадр), при сбое — предыдущая вставка этой сцены либо основной кадр
- `packages/core/src/validate.ts` — числа во вставке должны встречаться в речи (`factRefs`) или в утверждённом задании (`approvedTexts`)
- `pnpm bench:inserts` — те же 5 вставок на HyperFrames и на Remotion, листы кадров в `out/bench`
- Интеграционный тест рендера: `HF_INTEGRATION=1 pnpm test`

## Не сделано (следующие этапы)
Реальный STT и LLM-планировщик, vision, сток, веб-интерфейс, auth, БД, очередь, бюджеты, редактор и ревизии.

Вставки: очередь BullMQ (сейчас рендер идёт последовательно в CLI), экран правок и превью вставки, прозрачные наложения, аудио во вставках.
