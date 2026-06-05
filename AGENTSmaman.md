# AGENTS.md — Политики качества кода

> Этот документ обязателен к исполнению. Любой код, не проходящий `bun run check`, считается несуществующим.
> Прошлую реализацию вайбкодили брутально. Здесь — паранойя. Тайпинг и линтеры затянуты по максимуму.

-----

## 0. TL;DR для агента

1. Перед коммитом и перед сдачей задачи — **`bun run check`**. Зелёный или переделывай.
1. **`any` и `as` запрещены.** Не «по возможности избегать», а запрещены. Линтер и CI рубят.
1. **zod на всех внешних границах.** Telegram, LLM-ответы, БД, ввод из веба — всё валидируется.
1. **Мёртвый код запрещён.** Неиспользуемый экспорт/файл/зависимость = красный билд.
1. **Не глушим ошибки.** Никаких пустых `catch {}`, никаких `// @ts-ignore`, никаких `// biome-ignore` без обоснования в комменте.

-----

## 1. Одна команда: `bun run check`

`check` — это ворота. Прогоняет всё подряд и падает на первой же проблеме.

```jsonc
// package.json → "scripts"
{
  "typecheck":    "tsc --noEmit",
  "lint":         "biome check .",
  "format":       "biome format --write .",
  "format:check": "biome format .",
  "deadcode":     "knip",
  "guard:casts":  "bun run scripts/guard-casts.ts",
  "check":        "bun run typecheck && bun run guard:casts && bun run lint && bun run deadcode && bun run format:check",
  "fix":          "biome check --write . && biome format --write ."
}
```

|Этап          |Инструмент    |Что ловит                              |
|--------------|--------------|---------------------------------------|
|`typecheck`   |`tsc --noEmit`|типы, строгость                        |
|`guard:casts` |grep-скрипт   |`as` и `!` мимо линтера                |
|`lint`        |Biome         |правила качества, `any`, стиль         |
|`deadcode`    |Knip          |мёртвый код, неиспользуемые зависимости|
|`format:check`|Biome         |форматирование                         |

- `bun run check` — только проверка, ничего не меняет. Используется в CI и перед сдачей.
- `bun run fix` — автофиксы Biome (формат + safe-фиксы линта). Запускать локально, потом `check`.
- В CI крутится **ровно** `bun run check`. Один источник правды, локально и на сервере одинаково.

-----

## 2. TypeScript — максимальная строгость

`tsconfig.json` — строже некуда. Все флаги осознанные, ослаблять нельзя.

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],

    // строгость
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,

    // модули и согласованность
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,

    "noEmit": true
  },
  "include": ["src", "scripts"]
}
```

Что это значит на практике:

- `noUncheckedIndexedAccess` — `arr[0]` имеет тип `T | undefined`. Доступ по индексу проверяй явно.
- `exactOptionalPropertyTypes` — `{ x?: number }` ≠ `{ x: number | undefined }`. Не подсовывай `undefined` туда, где поле опциональное.
- `noUnusedLocals` / `noUnusedParameters` — мёртвых переменных не бывает. Неиспользуемый параметр — префикс `_`.

-----

## 3. Biome — линт + формат

Один инструмент вместо ESLint + Prettier. Конфиг включает recommended + ужесточения.

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": { "ignore": ["node_modules", "dist", "**/*.gen.ts"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "error",
        "noDoubleEquals": "error",
        "noEmptyBlockStatements": "error"
      },
      "style": {
        "noNonNullAssertion": "error",
        "useConst": "error",
        "useImportType": "error",
        "noParameterAssign": "error",
        "useNamingConvention": "error"
      },
      "complexity": {
        "noUselessTypeConstraint": "error",
        "noForEach": "off"
      },
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "error"
      }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  }
}
```

Ключевое:

- `noExplicitAny: error` — `any` не компилируется.
- `noNonNullAssertion: error` — оператор `!` запрещён. Не уверен что не `null` — проверь рантайм-гвардом или zod.
- `noConsoleLog: error` — логи только через нормальный логгер, не `console.log`.
- `useImportType: error` — type-only импорты помечаются `import type`.

-----

## 4. Запрет `any`, `as`, `!`

`any` ловит Biome. `!` ловит Biome. `as` Biome из коробки не ловит — добавляем grep-страж.

`scripts/guard-casts.ts` — падает, если в `src/` встречается `as` (кроме `as const`) или `satisfies` без необходимости. Простой скан, без зависимостей:

```ts
// концепт: грепаем src/**/*.ts, регексп на " as " мимо "as const",
// при совпадении — печатаем файл:строку и process.exit(1)
```

**Правила по кастам:**

- Нужно сузить тип — пиши **type guard** (`function isX(v: unknown): v is X`) или валидируй через **zod**, а не `as`.
- Данные извне (Telegram update, JSON от LLM, строка из БД) — это `unknown`, пока zod не сказал иначе.
- `as const` — разрешён (это не каст, а сужение литерала).
- Если каст реально неизбежен (грязный тип в сторонней либе) — он оформляется **одной** функцией-адаптером с `// biome-ignore` и комментарием-обоснованием. Не размазываем по коду.

-----

## 5. Мёртвый код — Knip

```jsonc
// knip.json
{
  "$schema": "https://unjs.io/schema.json",
  "entry": ["src/index.ts", "src/web/server.ts", "scripts/*.ts"],
  "project": ["src/**/*.ts", "scripts/**/*.ts"],
  "ignoreDependencies": [],
  "rules": {
    "files": "error",
    "exports": "error",
    "types": "error",
    "dependencies": "error",
    "unlisted": "error"
  }
}
```

Knip падает если есть: неиспользуемые файлы, неиспользуемые экспорты, неиспользуемые типы, неиспользуемые зависимости в `package.json`, импорты пакетов которых нет в зависимостях.

Не глуши предупреждения добавлением в ignore. Удаляй мёртвый код. Игнор — только для осознанных публичных API (которых тут почти нет).

-----

## 6. zod на границах

Доверяем только данным, прошедшим валидацию. Граница = где данные приходят извне процесса.

|Граница        |Что валидируем                                   |
|---------------|-------------------------------------------------|
|Telegram update|входящие сообщения, команды, callback-данные     |
|LLM-ответ      |структура ответа провайдера (особенно JSON-режим)|
|SQLite-выборки |строки из БД → типизированные доменные объекты   |
|Web/WebApp ввод|тело запроса, query, Telegram `initData`         |
|`env` / config |при старте процесса, до всего остального         |

Правила:

- Тип данных, не прошедших zod, — `unknown`. Точка.
- zod-схема и TS-тип — один источник: `type X = z.infer<typeof xSchema>`. Не дублируем руками.
- Схема упала — это явная обработанная ошибка (лог + fallback/ответ юзеру), а не краш и не молчаливое проглатывание.

-----

## 7. Обработка ошибок

- Пустой `catch {}` — запрещён (`noEmptyBlockStatements`). Поймал — обработай или пробрось.
- Кастомные ошибки из `core/errors.ts` с контекстом. Не кидаем голые строки.
- LLM/сеть/БД могут упасть в любой момент — каждый внешний вызов обёрнут, fallback предусмотрен (см. fallback-цепочка LLM-роутера).
- Ошибка пользователю — мемная и человеческая. Ошибка в лог — полная, с контекстом.

-----

## 8. Жёсткие правила для агента

Нарушение любого пункта = задача не принята.

1. **Не сдавай задачу без зелёного `bun run check`.** Не «у меня локально работает» — именно команда.
1. **Никаких `any`, `as` (кроме `as const`), `!`.** Не уверен в типе — zod или type guard.
1. **Никаких `@ts-ignore`, `@ts-expect-error`, `biome-ignore`, `knip-ignore` без комментария-обоснования** прямо над строкой. Без обоснования — удаляется.
1. **Не отключай и не ослабляй правила** в `tsconfig`, `biome.json`, `knip.json`, чтобы «прошло». Конфиги строгости трогаются только отдельной осознанной задачей с обоснованием, не мимоходом.
1. **Не оставляй мёртвый код.** Закомментированные блоки, неиспользуемые функции, «на будущее» — удаляются. История есть в git.
1. **Слои не протекают.** `services/*` не знают про Telegram. `telegram/*` не лезут в SQL. Данные ходят через `repos/*`. Промпты — только из БД через `prompts/store`, хардкод-строк промптов в коде нет.
1. **Границы валидируются zod.** Внешние данные входят как `unknown`.
1. **Один публичный способ сделать вещь.** Не плоди три функции под одно. Дубль — рефактори.
1. **Тесты на критичную логику** обязательны: репутация, LLM-роутер (выбор + fallback), шаблонизация промптов, резолвер модификаторов.
1. **Миграции руками, без ORM.** Изменение схемы = новый файл миграции, не правка старого.

-----

## 9. Definition of Done

Задача закрыта, когда **все** пункты выполнены:

- [ ] `bun run check` зелёный (typecheck + casts + lint + deadcode + format)
- [ ] Нет `any` / `as` / `!` / заглушённых ошибок
- [ ] Внешние данные провалидированы zod
- [ ] Новый код покрыт тестами, где это критично (см. правило 9)
- [ ] Слои не нарушены
- [ ] Мёртвый код отсутствует
- [ ] Промпты (если добавлялись) — в миграции, не в коде

-----

## 10. CI gate

CI запускает ровно одно:

```bash
bun install --frozen-lockfile
bun run check
bun test
```

Красный `check` или красный `test` — merge заблокирован. Без исключений, без «потом поправим».