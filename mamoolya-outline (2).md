# Мамуля — Архитектура бота

> Мемный Telegram-бот на Bun/TypeScript. Шутит, ругается, подбадривает и стебёт участников чата.

-----

## 1. Структура модулей

```
src/
├── core/
│   ├── config.ts          # zod-схема конфига, env, валидация при старте
│   ├── types.ts           # все shared-типы, единственный источник правды
│   └── errors.ts          # кастомные ошибки с контекстом
│
├── telegram/
│   ├── bot.ts             # инициализация, мидлвари (rate limit, логирование)
│   ├── router.ts          # маппинг команд → хендлеры, без логики
│   ├── handlers/
│   │   ├── stats.ts       # /my_stats, /top_nolifers*, /top_pairs, /sticker_stats
│   │   ├── reputation.ts  # /friend_foe_stats, /friend_foe_top, /days_without_drama, /drama
│   │   ├── fun.ts         # /dvach, /psychologist, /fact, /predict, /imitate, /horoscope, /bottle, /roll
│   │   ├── quotes.ts      # /quote, /quotes, /randomquote
│   │   ├── admin.ts       # /summary*, /ban_vote, /publish_anons, /anon_sender
│   │   └── misc.ts        # /start, /help, /menu, /m_version, /ignore_me, /notice_me, /webapp
│   ├── middleware/
│   │   ├── auth.ts        # гвард для админских команд
│   │   ├── tracker.ts     # трекинг сообщений в БД
│   │   └── ignore.ts      # проверка ignore-листа
│   └── formatters/        # форматирование ответов в Telegram-разметку
│
├── llm/
│   ├── provider.ts        # интерфейс LLMProvider { complete(prompt, opts): string }
│   ├── providers/
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── openrouter.ts
│   │   └── ollama.ts
│   └── router.ts          # выбор провайдера per-command + fallback-цепочка
│
├── prompts/
│   ├── builder.ts         # PromptBuilder — сборка итогового промпта из слоёв
│   ├── store.ts           # CRUD для промптов в SQLite, кэш, версионирование
│   ├── templates.ts       # подстановка {{плейсхолдеров}} в промпты
│   ├── modifiers.ts       # резолвер модификаторов — проверка условий, приоритеты
│   └── schema.ts          # zod-валидация структуры промптов и плейсхолдеров
│
├── services/
│   ├── stats.ts           # ноулайферы, пары, стикеры
│   ├── reputation.ts      # друзья/козлы, драма-счётчик
│   ├── entertainment.ts   # предсказания, гороскопы, бутылочка, двач
│   ├── imitation.ts       # сбор стиля юзера + запрос к LLM
│   ├── summary.ts         # генерация саммари через LLM
│   ├── votes.ts           # ban-голосовалки
│   └── anon.ts            # анонимки
│
├── data/
│   ├── db.ts              # инициализация bun:sqlite
│   ├── migrations/        # SQL-миграции руками, без ORM
│   └── repos/
│       ├── users.ts
│       ├── messages.ts
│       ├── quotes.ts
│       ├── reputation.ts
│       ├── votes.ts
│       ├── anon.ts
│       ├── drama.ts
│       └── prompts.ts
│
└── web/
    ├── server.ts          # Hono на том же Bun-процессе
    ├── admin/             # управление промптами, модерация анонимок
    │   ├── routes.ts      # CRUD промптов, история, откат
    │   └── auth.ts        # токен/пароль
    └── webapp/            # Telegram WebApp
        ├── routes.ts      # API для анонимок и репутационной карусели
        ├── auth.ts        # валидация Telegram initData
        └── static/        # фронт для WebApp (html/js)
```

-----

## 2. Пайплайн сборки промпта

### Три слоя

|Слой         |Slug-паттерн    |Хранение|Описание                                                  |
|-------------|----------------|--------|----------------------------------------------------------|
|**Character**|`character`     |SQLite  |Кто такая Мамуля. Тон, характер, лексика. Один на весь бот|
|**Task**     |`task:{command}`|SQLite  |Что делать. По одному на LLM-команду                      |
|**Modifiers**|`mod:{name}`    |SQLite  |Ситуативные надстройки (0+), применяются по условию       |

Контекст (имя юзера, репутация, сообщения) — не хранится, собирается в рантайме.

### Итоговый промпт

```
system = character + "\n\n" + task (с подставленными переменными) + "\n\n" + modifier_1 + modifier_2 + ...
user   = контекстные данные + запрос юзера
```

### Шаблонизация

Плейсхолдеры `{{user_name}}`, `{{reputation}}`, `{{recent_messages}}` и т.д.
Простой `string.replace` по словарю. Никакого eval.

Каждый таск декларирует `required_vars` — валидация при сохранении через веб.

### Контекстные переменные по таскам

|Task               |Переменные                                           |
|-------------------|-----------------------------------------------------|
|`task:dvach`       |`{{recent_messages}}`                                |
|`task:psychologist`|`{{user_name}}`, `{{reputation}}`, `{{user_message}}`|
|`task:fact`        |`{{user_name}}`, `{{user_messages_sample}}`          |
|`task:imitate`     |`{{target_name}}`, `{{target_messages_sample}}`      |
|`task:summary`     |`{{date_range}}`, `{{all_messages}}`                 |
|`task:predict`     |`{{user_name}}`, `{{reputation}}`                    |
|`task:horoscope`   |`{{user_name}}`                                      |

### Кэширование

In-memory Map для промптов. Инвалидация при редактировании через веб.

-----

## 3. Модификаторы

### Примеры

|Slug                 |Условие                    |Описание               |
|---------------------|---------------------------|-----------------------|
|`mod:new_year`       |`custom: isNewYear`        |Праздничный угар       |
|`mod:night_mode`     |`time_range: 0:00–5:00`    |Стёб что не спят       |
|`mod:low_reputation` |`reputation_range: max -10`|Не жалеть              |
|`mod:high_reputation`|`reputation_range: min 20` |Уважать, но подъёбывать|
|`mod:drama_active`   |`flag: drama_active`       |В чате свежий срач     |
|`mod:first_time_user`|`flag: first_command`      |Представиться          |

### Таблица `modifier_rules`

|Поле              |Тип        |Описание                                             |
|------------------|-----------|-----------------------------------------------------|
|`id`              |INTEGER PK |—                                                    |
|`modifier_slug`   |TEXT       |Ссылка на `mod:*` в `prompts`                        |
|`condition_type`  |TEXT       |`time_range` / `reputation_range` / `flag` / `custom`|
|`condition_value` |TEXT (JSON)|Параметры условия                                    |
|`priority`        |INTEGER    |Порядок применения                                   |
|`compatible_tasks`|TEXT (JSON)|К каким таскам применим (пусто = ко всем)            |
|`is_active`       |INTEGER    |0/1                                                  |

### Ограничения

- Максимум 3 модификатора за раз (топ по приоритету)
- Общий лимит на длину system prompt в токенах (зависит от провайдера)
- При превышении — режем модификаторы с конца

### Custom-условия

Словарь именованных функций в коде. Новое условие = новая функция + деплой.
Текст модификатора меняется через веб без деплоя.

-----

## 4. LLM-роутер

### Провайдеры

Единый интерфейс `LLMProvider`:

```
complete(prompt: { system: string, user: string }, options: LLMOptions): Promise<string>
```

Реализации: OpenAI, Anthropic, OpenRouter, Ollama.

### Маршрутизация

Per-command конфиг: какой провайдер/модель использовать для какой команды.

|Категория        |Модель            |Пример команд                                 |
|-----------------|------------------|----------------------------------------------|
|Дешёвая / быстрая|GPT-4o-mini, Haiku|`/predict`, `/horoscope`, `/roll`             |
|Средняя          |GPT-4o, Sonnet    |`/dvach`, `/psychologist`, `/fact`, `/imitate`|
|Тяжёлая          |Opus, GPT-4       |`/summary`, `/summary_week`                   |

### Fallback-цепочка

Если провайдер сдох — пробуем следующий в очереди. Конфигурируется per-command.

```
task:dvach → [openrouter/mixtral, openai/gpt-4o-mini, ollama/llama3]
task:summary → [anthropic/sonnet, openai/gpt-4o]
```

-----

## 5. База данных (SQLite)

### Таблица `users`

|Поле             |Тип       |Описание                        |
|-----------------|----------|--------------------------------|
|`id`             |INTEGER PK|—                               |
|`telegram_id`    |INTEGER   |Telegram user ID                |
|`chat_id`        |INTEGER   |Чат, в котором трекаем          |
|`username`       |TEXT      |Обновляется при каждом сообщении|
|`display_name`   |TEXT      |Обновляется при каждом сообщении|
|`first_seen_at`  |TEXT      |—                               |
|`last_message_at`|TEXT      |—                               |
|`is_ignored`     |INTEGER   |`/ignore_me`                    |
|`message_count`  |INTEGER   |Денормализованный счётчик       |

UNIQUE(`telegram_id`, `chat_id`)

### Таблица `messages`

|Поле                 |Тип       |Описание                |
|---------------------|----------|------------------------|
|`id`                 |INTEGER PK|—                       |
|`chat_id`            |INTEGER   |—                       |
|`user_id`            |INTEGER FK|→ `users`               |
|`telegram_message_id`|INTEGER   |—                       |
|`text`               |TEXT      |Только текст, без медиа |
|`has_sticker`        |INTEGER   |0/1                     |
|`sticker_emoji`      |TEXT      |Для стикерной статистики|
|`reply_to_user_id`   |INTEGER FK|Для пар по реплаям      |
|`created_at`         |TEXT      |—                       |

Индексы: (`chat_id`, `created_at`), (`chat_id`, `user_id`), (`chat_id`, `sticker_emoji`)

### Таблица `quotes`

|Поле                 |Тип       |Описание              |
|---------------------|----------|----------------------|
|`id`                 |INTEGER PK|—                     |
|`chat_id`            |INTEGER   |—                     |
|`user_id`            |INTEGER FK|Автор цитаты          |
|`text`               |TEXT      |—                     |
|`saved_by_user_id`   |INTEGER FK|Кто сохранил          |
|`telegram_message_id`|INTEGER   |Для ссылки на оригинал|
|`created_at`         |TEXT      |—                     |

### Таблица `reputation_events`

|Поле            |Тип       |Описание                                                   |
|----------------|----------|-----------------------------------------------------------|
|`id`            |INTEGER PK|—                                                          |
|`chat_id`       |INTEGER   |—                                                          |
|`target_user_id`|INTEGER FK|Кому                                                       |
|`source_user_id`|INTEGER FK|Кто (NULL если система)                                    |
|`delta`         |INTEGER   |+1 / -1                                                    |
|`reason`        |TEXT      |`webapp_vote` / `friend` / `foe` / `vote_result` / `system`|
|`created_at`    |TEXT      |—                                                          |

Индекс: (`chat_id`, `target_user_id`)

Текущая репутация: `SUM(delta) WHERE target_user_id = ?`

### Таблица `votes`

|Поле            |Тип       |Описание                                  |
|----------------|----------|------------------------------------------|
|`id`            |INTEGER PK|—                                         |
|`chat_id`       |INTEGER   |—                                         |
|`type`          |TEXT      |`ban` / `unban` / `custom`                |
|`target_user_id`|INTEGER FK|За кого                                   |
|`initiated_by`  |INTEGER FK|Кто запустил                              |
|`status`        |TEXT      |`active` / `passed` / `failed` / `expired`|
|`votes_required`|INTEGER   |Порог                                     |
|`expires_at`    |TEXT      |Дедлайн                                   |
|`created_at`    |TEXT      |—                                         |

### Таблица `vote_entries`

|Поле        |Тип       |Описание     |
|------------|----------|-------------|
|`id`        |INTEGER PK|—            |
|`vote_id`   |INTEGER FK|→ `votes`    |
|`user_id`   |INTEGER FK|Кто голосовал|
|`choice`    |TEXT      |`yes` / `no` |
|`created_at`|TEXT      |—            |

UNIQUE(`vote_id`, `user_id`)

### Таблица `anon_messages`

|Поле          |Тип       |Описание                            |
|--------------|----------|------------------------------------|
|`id`          |INTEGER PK|Номер анонимки                      |
|`chat_id`     |INTEGER   |—                                   |
|`sender_id`   |INTEGER   |Знает только бот и админ            |
|`text`        |TEXT      |—                                   |
|`status`      |TEXT      |`pending` / `published` / `rejected`|
|`published_at`|TEXT      |—                                   |
|`created_at`  |TEXT      |—                                   |

Индекс: (`chat_id`, `status`)

### Таблица `drama_tracker`

|Поле           |Тип       |Описание             |
|---------------|----------|---------------------|
|`chat_id`      |INTEGER PK|—                    |
|`last_drama_at`|TEXT      |Последний `/drama`   |
|`record_days`  |INTEGER   |Рекорд дней без срача|

### Таблица `prompts`

|Поле        |Тип       |Описание                                         |
|------------|----------|-------------------------------------------------|
|`id`        |INTEGER PK|—                                                |
|`slug`      |TEXT      |`character` / `task:dvach` / `mod:night_mode` / …|
|`content`   |TEXT      |Текст промпта                                    |
|`version`   |INTEGER   |Инкремент при редактировании                     |
|`is_active` |INTEGER   |Какая версия в бою                               |
|`created_at`|TEXT      |—                                                |
|`updated_at`|TEXT      |—                                                |

### Таблица `modifier_rules`

(см. раздел “Модификаторы”)

-----

## 6. WebApp — Репутационная карусель

### Механика

Тиндер для репутации. Юзер открывает WebApp → видит карточку случайного участника → жмёт “Друг” / “Козёл” / “Пропустить” → следующая карточка.

### Ограничения

- Нельзя голосовать за себя
- Один голос за конкретного юзера в сутки
- Максимум 10 голосов в сутки
- Только за активных юзеров (писали за последние N дней)

### Алгоритм выбора карточки

1. Активные юзеры чата
1. Минус ты сам
1. Минус те, за кого уже голосовал сегодня
1. Из оставшихся — случайный (приоритет тем, за кого давно не голосовали)

### Карточка

- Имя / username
- Аватарка (кэш через `getUserProfilePhotos`, обновление раз в сутки)
- Стата: сообщений за неделю, текущая репутация
- Случайная цитата из `quotes` (если есть)
- Кнопки: 🐐 Козёл / 😐 Пропустить / 💚 Друг

### API

|Метод|Эндпоинт                      |Описание                                  |
|-----|------------------------------|------------------------------------------|
|GET  |`/webapp/reputation/next-card`|Следующая карточка (или `{ empty: true }`)|
|POST |`/webapp/reputation/vote`     |`{ target_user_id, choice }`              |

Авторизация: Telegram `initData` (подпись проверяется на бэке).

-----

## 7. WebApp — Анонимки

### Флоу

Юзер открывает WebApp → пишет текст → отправляет → анонимка в БД со статусом `pending` → админ публикует через `/publish_anons` или админку → бот постит в чат с номером.

### API

|Метод|Эндпоинт           |Описание                 |
|-----|-------------------|-------------------------|
|POST |`/webapp/anon/send`|Отправить анонимку       |
|GET  |`/webapp/anon/my`  |Мои анонимки и их статусы|

-----

## 8. Admin Panel

### Промпты

- Список всех промптов (character, tasks, modifiers)
- Редактирование с превью подставленных переменных
- История версий, откат на любую
- Включение/выключение модификаторов
- Настройка условий срабатывания модификаторов

### Анонимки

- Список `pending` анонимок
- Approve / Reject
- `/anon_sender` — раскрытие автора по номеру

### Доступ

Токен/пароль. Роуты `/admin/*`.

-----

## 9. Строгость кода

- **tsconfig**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **zod на всех границах**: Telegram input, LLM output, данные из БД, ввод из веба
- **Запрет `any` и `as`**: линтер рубит, CI не пропускает
- **Biome** вместо ESLint
- **Юнит-тесты** на сервисы: репутация, LLM-роутер, шаблонизация промптов
- **Миграции руками**, без ORM
- **Custom-условия модификаторов** — только именованные функции в коде, никакого eval

-----

## 10. Пайплайн вызова команды (пример)

```
Юзер жмёт /psychologist
    │
    ▼
telegram/router.ts → handlers/fun.ts
    │
    ▼
services/entertainment.ts.psychologist(userId, chatId)
    │
    ├── repos/users.ts → репутация юзера
    ├── repos/messages.ts → последние сообщения юзера
    │
    ▼
prompts/builder.ts.build("task:psychologist", context)
    │
    ├── store.ts → character (из кэша)
    ├── store.ts → task:psychologist (из кэша)
    ├── modifiers.ts → проверка условий → [mod:night_mode, mod:low_reputation]
    ├── templates.ts → подстановка {{user_name}}, {{reputation}}
    │
    ▼
{ system: "...", user: "..." }
    │
    ▼
llm/router.ts → выбор провайдера для task:psychologist
    │
    ▼
llm/providers/openrouter.ts.complete(prompt, opts)
    │
    ▼
Ответ от LLM
    │
    ▼
telegram/formatters/ → форматирование
    │
    ▼
Бот отправляет в чат
```

-----

## 11. Memory footprint

Целевая среда: VPS $5/мес, 1GB RAM.

### Потребители памяти

|Компонент        |RAM           |Примечание                             |
|-----------------|--------------|---------------------------------------|
|Bun + Hono       |~50-80MB      |Рантайм + веб-сервер                   |
|grammY / Telegraf|~10-20MB      |Telegram-фреймворк                     |
|SQLite engine    |~1-2MB        |Сам движок без данных                  |
|SQLite page cache|2-64MB        |Настраивается через `PRAGMA cache_size`|
|Кэш промптов     |~60KB         |20-30 промптов × ~2KB                  |
|**Итого в RAM**  |**~100-150MB**|На 1GB VPS живёт спокойно              |

### Рост данных на диске

Чат на 50 человек, ~50 сообщений/чел/день = ~2500 записей/день.

|Период |Записей|Диск (оценка)|
|-------|-------|-------------|
|Месяц  |~75k   |~20-50MB     |
|Полгода|~450k  |~100-250MB   |
|Год    |~900k  |~200-500MB   |

### Где может раздуть

- **`/summary_week`** — тянет все сообщения за неделю в память. На активном чате 17.5k сообщений. Нужен лимит или чанкинг.
- **`/imitate`** — сэмпл сообщений юзера. Ограничить до последних 100-200.
- **Параллельные LLM-запросы** — 5 одновременных = 5 промптов + 5 ответов в памяти. Очередь с concurrency limit (2-3).

### SQLite PRAGMAs

```sql
PRAGMA journal_mode = WAL;          -- параллельное чтение/запись
PRAGMA cache_size = -32000;         -- 32MB page cache
PRAGMA mmap_size = 268435456;       -- mmap до 256MB, снижает аллокации
PRAGMA synchronous = NORMAL;        -- баланс скорости и надёжности
```

### Рекомендации

- Очередь LLM-запросов с лимитом параллелизма
- Лимиты на выборки сообщений для промптов (конфигурируемые per-task)
- Периодическая чистка сообщений старше 6 мес (или архивация в отдельный файл)
- Кэш аватарок — на диске или в SQLite BLOB, не в RAM

-----

## 12. Dev phases

Четыре фазы. Каждая заканчивается рабочим ботом с нарастающей функциональностью.

### Phase 0 — Скелет (1-2 дня)

> Цель: бот запускается, отвечает, ходит в LLM.

- `core/` — config (zod), types, errors
- `data/db.ts` + первая миграция (`users`, `messages`)
- `telegram/bot.ts` + router — минимальный grammY
- `telegram/middleware/tracker.ts` — запись сообщений в БД, обновление юзера
- `llm/provider.ts` + один провайдер (OpenRouter)
- `prompts/store.ts` — чтение из SQLite, без кэша
- `prompts/builder.ts` — character + task, без модификаторов
- Миграция с начальными промптами (character + 2-3 таска)
- Одна рабочая команда: `/psychologist` (полный цикл хендлер → сервис → промпт → LLM → ответ)
- `/start`, `/help` — статика

**Результат**: бот в чате, трекает юзеров/сообщения, одна LLM-команда работает.

### Phase 1 — Ядро фичей (3-5 дней)

> Цель: все основные команды, статистика, цитаты.

- Миграция: `quotes`, `drama_tracker`
- `repos/` — messages, quotes, drama
- `services/stats.ts` — ноулайферы, пары, стикеры
- `services/entertainment.ts` — все LLM-команды (`/dvach`, `/fact`, `/predict`, `/imitate`, `/horoscope`)
- `services/summary.ts` — `/summary`, `/summary_day`, `/summary_week`
- Все хендлеры кроме репутации и голосовалок
- `prompts/templates.ts` — полная шаблонизация
- Кэш промптов (in-memory Map)
- `llm/router.ts` — маршрутизация по командам + fallback
- Добавить 2-3 провайдера
- `/roll`, `/bottle` — чистая логика без LLM

**Результат**: полноценный мемный бот, все команды кроме репутации и веба.

### Phase 2 — Репутация и голосовалки (2-3 дня)

> Цель: социальная механика.

- Миграция: `reputation_events`, `votes`, `vote_entries`
- `repos/reputation.ts`, `repos/votes.ts`
- `services/reputation.ts` — подсчёт, история
- `services/votes.ts` — создание, голосование, подведение итогов
- `handlers/reputation.ts` — `/friend_foe_stats`, `/friend_foe_top`, `/days_without_drama`, `/drama`
- `handlers/admin.ts` — `/ban_vote` с инлайн-кнопками
- `prompts/modifiers.ts` — резолвер модификаторов
- Миграция: `modifier_rules` + начальные модификаторы (`mod:low_reputation`, `mod:high_reputation`, `mod:night_mode`)
- Интеграция модификаторов в `builder.ts`

**Результат**: репутация через бот-команды, модификаторы влияют на ответы LLM.

### Phase 3 — Веб (3-5 дней)

> Цель: админка, WebApp для анонимок и репутационный тиндер.

- `web/server.ts` — Hono, роутинг
- **Admin panel**:
  - CRUD промптов, история версий, откат
  - Управление модификаторами и правилами
  - Модерация анонимок
  - Инвалидация кэша промптов при редактировании
- **WebApp — анонимки**:
  - Миграция: `anon_messages`
  - Авторизация через Telegram initData
  - Отправка, просмотр своих
  - `/publish_anons`, `/anon_sender` в боте
- **WebApp — репутационный тиндер**:
  - Карусель карточек
  - Голосование с лимитами
  - Кэш аватарок
- Фронт для WebApp — минимальный HTML + vanilla JS или Preact

**Результат**: полный продукт.

### Post-launch

- Звания на основе репутации
- Аналитика (популярность команд, эффективность промптов)
- Rate limiting на уровне юзера (анти-спам)
- Бэкапы SQLite (cron + копия файла)
- Мониторинг (healthcheck + алерты если бот упал)