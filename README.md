# Manacost Video Pipeline

Автоматический пайплайн для сборки YouTube-роликов `2560x1440` из статей Manacost.

## Что делает

- Загружает статью по URL и очищает основной контент через Readability.
- Делит материал на сцены с целевой длительностью 3-5 минут.
- Берет изображения из статьи и ищет карточные арты через `https://db.kolodahs.ru/api/v1`.
- Использует full-screen background только для широких качественных изображений.
- Вертикальные карты, листы карт и квадратные арты ставит только в отдельный foreground-блок, без растягивания на весь кадр.
- Показывает на сцене только короткий хук и до двух тезисов, без длинных служебных описаний.
- Генерирует русскую озвучку через ElevenLabs, если задан `ELEVENLABS_API_KEY`.
- Создает JSON-субтитры и `.srt`, но не вшивает их в кадр по умолчанию.
- Генерирует временную тихую музыкальную подложку через FFmpeg.
- Рендерит Remotion-композицию в `2560x1440`.
- Проверяет финальный MP4 через `ffprobe`.

## Настройка

```powershell
npm.cmd install
Copy-Item .env.example .env
```

В `.env` добавь:

```env
ELEVENLABS_API_KEY=...
```

Ключи не хранятся в коде и не должны попадать в git.

## Основной запуск

```powershell
npm.cmd run from-url -- "https://hs-manacost.ru/gajd-po-kraftu-hearthstone-kataklizm/"
```

Результат будет в:

```text
output/<slug>/final-2k.mp4
output/<slug>/manifest.json
output/<slug>/script.md
output/<slug>/subtitles.srt
output/<slug>/render-report.json
```

## Полезные команды

Dry-run без озвучки и без финального рендера:

```powershell
npm.cmd run dry-run
```

Сгенерировать/перегенерировать озвучку по готовому manifest:

```powershell
npm.cmd run voiceover -- "<slug>"
```

Отрендерить готовый manifest:

```powershell
npm.cmd run render -- "<slug>"
```

Проверить готовый MP4:

```powershell
npm.cmd run qa -- "<slug>"
```

Открыть Remotion Studio:

```powershell
npm.cmd run dev
```

## Текущие ограничения

- Сценарий пока строится эвристически из статьи. Следующий шаг - добавить LLM-редактор сценария, чтобы текст звучал как полноценный YouTube-нарратив.
- Внешний web image search пока не подключен. Сейчас используются изображения статьи и HSData/Blizzard card art.
- Музыка сейчас локально сгенерированная quiet ambient bed. Ее можно заменить на файл с лицензией и прописать в manifest.
- Если статья не содержит качественного широкого изображения, Remotion рисует чистый кодовый фон и кладет карты поверх. Это сделано специально, чтобы не растягивать карточный арт на весь экран.
