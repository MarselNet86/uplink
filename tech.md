# tech.md - Uplink

**Версия ядра: v3**

Changelog:
- `v1` - первичная фиксация: стек, архитектура процессов, IPC-контракты, доменные типы, пайплайн развёртывания VLESS+Reality и Hysteria2, правила кода и коммитов, дорожная карта.
- `v2` - домен для пользователя больше не обязателен. Hysteria2 по умолчанию работает на self-signed сертификате с `pinSHA256` в ссылке, ACME-путь остаётся опцией (`TlsMode`). У Reality убрано поле SNI из формы: донор выбирается из встроенного списка автоматически. Изменены: форма шага 1, `DeployParams`, `PreflightReport` (условные проверки), `ErrorCode`, шаги пайплайна Hysteria2, `LinkBuilder`, добавлен `security/CertGenerator.ts`.
- `v3` - зафиксирован дизайн-код (`docs/design-reference.html`, версия 1.1) как источник истины для UI поверх раздела 9: сплит-композиция (статичная картинка слева на всю высоту + рабочая панель справа) не помещается в прежнее окно 480×720, поэтому окно поднято до 1040×680 (без ресайза, как и раньше). Дизайн-код монохромный и однотемный (light-only, без тёмной альтернативы) - строка про «тёмная тема по умолчанию» из раздела 9 снята, приложение теперь ведёт единственную светлую палитру. Изменены: раздел 9 (размер окна, тема). Добавлен `renderer/src/features/common/errorText.ts` в структуру раздела 3.2 (таблица кодов ошибок из раздела 8 живёт там, не разбросана по компонентам).

Правила работы с этим файлом:
- Файл является единственным источником истины. Всё, что не описано здесь, не выдумывается по ходу разработки.
- Изменения только append-only, каждое изменение контракта (IPC-канал, доменный тип, формат ссылки, код ошибки) бампает версию и добавляет строку в changelog.
- Проект ведёт один человек, поэтому процессных барьеров (CODEOWNERS, ревью, роли) нет. Дисциплина держится на трёх вещах: этот файл, типы в `src/shared`, тесты на парсеры и билдеры ссылок.
- Если сессии ведутся в Claude Code, положить в корень `CLAUDE.md` со ссылкой на этот файл.

---

## 1. Проект

**Uplink** - кроссплатформенное десктоп-приложение, которое по SSH подключается к VPS пользователя и автоматически разворачивает на нём VPN-протоколы **VLESS+Reality** и **Hysteria2**, после чего отдаёт готовые ссылки подключения.

Для кого: владелец собственного VPS, который не хочет руками ставить Xray и Hysteria, править конфиги и генерировать ключи.

Ключевая идея: вся серверная работа скрыта. Пользователь видит форму, прогресс-бар с названием текущего этапа и итоговые ссылки. Ни одна команда, ни один вывод shell на экран не выводятся (сырой лог доступен только по явному раскрытию в блоке диагностики при ошибке).

Целевые дистрибутивы сервера:
- Debian 12 (bookworm), Debian 13 (trixie)
- Ubuntu 24.04 LTS, Ubuntu 26.04 LTS

Архитектуры: `x86_64` (amd64), `aarch64` (arm64). Обязателен systemd.

Целевые платформы клиента: Windows 10+, macOS 12+, Linux (AppImage/deb).

Не входит в v1:
- панель управления, учёт пользователей, многосерверные деплои;
- авторизация по SSH-ключу (только пароль, ключ в бэклоге);
- протоколы, кроме VLESS+Reality и Hysteria2;
- CentOS/Alma/Rocky/Alpine.

---

## 2. Стек

| Слой | Технология |
|---|---|
| Оболочка | Electron (последняя стабильная major) |
| Язык | TypeScript, `strict: true` |
| Сборка dev/prod | electron-vite |
| UI | React 19 + Tailwind CSS v4 |
| Состояние | Zustand (одно store, без Redux) |
| SSH-транспорт | ssh2 |
| Валидация границ | zod |
| Упаковка | electron-builder |
| Тесты | vitest (юнит + контрактные), опционально Playwright для e2e-смоука |
| Линт/формат | eslint + prettier |

Запрещено без правки этого файла: любые дополнительные рантайм-зависимости в main-процессе. `ssh2`, `zod` - всё. Никаких обёрток типа `node-ssh`, никаких shell-хелперов.

---

## 3. Архитектура

### 3.1 Процессная модель

```
renderer (React)  <--- contextBridge --->  preload  <--- ipcMain --->  main (Node)
   только UI и состояние экрана          тонкий типизированный        SSH, домен,
   никаких секретов на диске             мост, без логики             пайплайн, ключи
```

Жёсткие правила:
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`.
- Renderer НИКОГДА не импортирует `ssh2`, `fs`, `child_process`. Единственный доступ наружу - `window.uplink`, объявленный в preload.
- Preload не содержит бизнес-логики. Он только пробрасывает вызовы и подписки на каналы из белого списка (`src/shared/ipc.ts`).
- Весь домен (SSH, детект, установка, генерация ключей) живёт в main. Renderer получает только доменные DTO.
- Пароль от SSH существует только в памяти main-процесса на время сессии. Он не пишется в лог, не пишется в стор renderer после отправки, не сохраняется на диск, обнуляется по завершении прогона.

### 3.2 Структура папок

```
uplink/
  electron.vite.config.ts
  electron-builder.yml
  package.json
  tsconfig.json  tsconfig.node.json  tsconfig.web.json
  build/                          # иконки, entitlements
  src/
    shared/                       # общий код main <-> renderer, без Node API
      ipc.ts                      # имена каналов + типы payload (ЗАМОРОЖЕНО)
      types.ts                    # доменные DTO (ЗАМОРОЖЕНО)
      errors.ts                   # коды ошибок (ЗАМОРОЖЕНО)
      schemas.ts                  # zod-схемы для валидации на обеих границах
      planBuilder.ts               # PlanBuilder: чистая функция, нужна и main, и renderer (шаг 2)
    preload/
      index.ts                    # contextBridge.exposeInMainWorld('uplink', api)
    main/
      index.ts                    # bootstrap окна, security-хардненинг
      ipc/
        registry.ts               # регистрация всех handler-ов в одном месте
        handlers/                 # по одному файлу на канал
      ssh/
        SshSession.ts             # обёртка над ssh2.Client, connect/dispose
        CommandRunner.ts          # exec + сбор stdout/stderr/code, таймауты
        FileTransfer.ts           # sftp writeFile с правами
        HostKeyStore.ts           # TOFU-хранилище known_hosts приложения
        types.ts                  # интерфейсы ICommandRunner, IFileTransfer
      domain/
        DistroDetector.ts
        Preflight.ts
        ProtocolDetector.ts
        RealityDonors.ts          # константа: список доменов-доноров для Reality
        HysteriaFakeSni.ts        # константа: заглушка SNI для self-signed сертификата
        CertGenerator.ts          # openssl-генерация самоподписанного серта + отпечаток
        installers/
          BaseInstaller.ts        # абстрактный класс, общий шаблон установки
          XrayRealityInstaller.ts
          Hysteria2Installer.ts   # ветвится по TlsMode внутри writeConfig()/verify()
        removers/
          BaseRemover.ts
          XrayRemover.ts
          Hysteria2Remover.ts
        parsers/                  # чистые функции, максимально покрыты тестами
          osRelease.ts
          x25519.ts
          systemctl.ts
          listenPorts.ts
          certFingerprint.ts      # разбор вывода openssl x509 -fingerprint в pinSHA256-формат
        LinkBuilder.ts            # генерация vless:// и hy2:// (чистая функция), обе TLS-ветки
      pipeline/
        Step.ts                   # интерфейс шага
        Pipeline.ts               # последовательный запуск, отмена, откат
        ProgressReporter.ts       # перевод шагов в проценты и события
      security/
        shellQuote.ts             # POSIX-квотирование аргументов
        redact.ts                 # маскирование секретов в логах
        random.ts                 # crypto.randomBytes-обёртки
      logging/
        Logger.ts                 # in-memory ring buffer + опциональный файл
    renderer/
      index.html
      src/
        main.tsx  App.tsx
        store/useAppStore.ts
        ui/                       # примитивы, см. раздел 9
        features/
          connect/                # шаг 1
          select/                 # шаг 2
          install/                # шаг 3
          result/                 # шаг 4
          manage/                 # диалог конфликта: переустановить/удалить
        styles/index.css
  tests/
    unit/                         # парсеры, LinkBuilder, PlanBuilder, прогресс
    contract/                     # zod-схемы IPC, фейковый CommandRunner
    fixtures/                     # реальные снимки stdout команд
```

### 3.3 Эталонный слайс

`XrayRealityInstaller` собирается первым и служит шаблоном. `Hysteria2Installer` повторяет его структуру один в один: тот же базовый класс, та же нарезка шагов, тот же формат ошибок, тот же способ верификации. Не изобретать вторую раскладку.

---

## 4. Пользовательский сценарий и экраны

Приложение - линейный визард из четырёх шагов плюс модалка конфликта.

### Шаг 1. Подключение (`features/connect`)

Домен для работы приложения не требуется. Основной сценарий - только IP сервера. Оба протокола по умолчанию не просят у пользователя ни домена, ни email.

Обязательные поля формы:

| Поле | Тип | Валидация | Обяз. |
|---|---|---|---|
| Дистрибутив | select: `auto` \| `debian` \| `ubuntu` | по умолчанию `auto` | да |
| IP / хост | string | IPv4, IPv6 или FQDN | да |
| Port | number | 1..65535, по умолчанию 22 | да |
| SSH user | string | непустая, без пробелов | да |
| SSH password | password | непустая | да |

Поле SNI из формы убрано целиком. Для Reality SNI - это чужой «донорский» домен TLS-маскировки (`realitySettings.dest` / `serverNames`), пользователь его не вводит: домен выбирается автоматически из встроенного списка доноров (раздел 5.6, шаг X4), проверяется через `xray tls ping` и не требует никаких DNS-записей на сервер пользователя.

Свёрнутый блок **«Домен (опционально)»**, по умолчанию закрыт, разворачивается по клику:

| Поле | Тип | Валидация | Обяз. |
|---|---|---|---|
| У меня есть домен | checkbox | - | нет |
| Домен | string | FQDN | да, если чекбокс включён |
| Email ACME | string | RFC-совместимый email | да, если чекбокс включён |

Если чекбокс выключен (дефолт) - Hysteria2 разворачивается в режиме `self-signed` (см. 5.7). Если включён - в режиме `acme-domain`, с полным ACME-пайплайном и требованием, чтобы A/AAAA-запись домена указывала на IP сервера. Переключение режима валится в тип `TlsMode` (раздел 7).

Кнопка **Check**:
1. блокирует форму, показывает inline-спиннер;
2. вызывает `ssh:check`;
3. при успехе переводит визард на шаг 2 и кладёт в стор `DistroInfo`, `PreflightReport`, `ProtocolStatus[]`;
4. при ошибке показывает `Alert` с человекочитаемым текстом по коду ошибки и не пускает дальше.

### Шаг 2. Выбор ПО (`features/select`)

Два чекбокса: `VLESS + Reality`, `Hysteria2`. Состояние каждого выводится из `ProtocolStatus`:
- `absent` - чекбокс активен;
- `installed` - чекбокс задизейблен, рядом бейдж `Установлен` и ссылка `Управление`;
- `broken` - чекбокс задизейблен, бейдж `Найден, но не запущен`, ссылка `Управление`.

Правило смешанного состояния: если VLESS уже стоит, а Hysteria2 нет, установка разрешена только для Hysteria2. Кнопка **Install** активна, когда выбран хотя бы один протокол в состоянии `absent`.

### Модалка конфликта (`features/manage`)

Открывается по `Управление` или при попытке установить уже установленный протокол. Заголовок: «Протокол уже установлен на сервере». Варианты:
- **Переустановить** - полное удаление + чистая установка с новыми ключами. Явное предупреждение: старые ссылки перестанут работать.
- **Удалить** - только удаление.
- **Отмена**.

Удаление поддерживает мультивыбор: список найденных протоколов с чекбоксами, одна кнопка подтверждения на все. Требуется ввод слова подтверждения не нужен, достаточно второй кнопки в модалке.

### Шаг 3. Установка (`features/install`)

- Общий прогресс-бар 0..100 %.
- Под ним список этапов (`StepId` -> человекочитаемое название на русском) со статусами `pending` / `running` / `done` / `failed` / `skipped`.
- Текущий этап подсвечен, справа проценты.
- Кнопка **Отмена** активна до начала записи конфигов; после точки невозврата заменяется на пояснение «Прерывание может оставить сервер в промежуточном состоянии».
- Сырой лог скрыт. При ошибке появляется раскрывающийся блок `Диагностика` с последними строками stderr, прогнанными через `redact()`.

### Шаг 4. Ключи (`features/result`)

Для каждого установленного протокола карточка:
- название протокола;
- ссылка подключения в одну строку с обрезкой по ширине;
- кнопка **Копировать** (по клику - `Скопировано` на 2 секунды);
- кнопка **Копировать всё** внизу;
- кнопка **Сохранить в файл** (`.txt`, диалог Electron), по явному действию пользователя.

Дисклеймер: ссылки показываются один раз, приложение их не хранит.

---

## 5. Как реализуется автоподключение и развёртывание (детально)

Это ядро проекта. Раздел описывает целевое поведение main-процесса.

### 5.1 SSH-транспорт

Библиотека `ssh2`, класс `Client`.

```ts
// SshSession.ts - single SSH connection with strict lifecycle.
const conn = new Client();
conn.connect({
  host, port, username, password,
  readyTimeout: 15_000,          // connect + auth budget
  keepaliveInterval: 10_000,
  keepaliveCountMax: 3,
  hostVerifier: (keyHash: Buffer) => hostKeyStore.verify(host, port, keyHash),
});
```

Обязательные требования:
- **Проверка host key.** `hostVerifier` не возвращает `true` безусловно. Реализуется TOFU: при первом подключении отпечаток SHA-256 сохраняется в `app.getPath('userData')/known_hosts.json`, при последующих сравнивается. Несовпадение - жёсткая остановка с кодом `E_SSH_HOSTKEY_MISMATCH` и модалкой «Отпечаток сервера изменился». Первое подключение показывает отпечаток и требует подтверждения.
- **Один коннект на весь прогон.** Не открывать новую сессию на каждую команду. `SshSession` живёт от `check` до конца установки или до таймаута простоя 5 минут.
- **Таймауты на команду.** `CommandRunner.run(cmd, { timeoutMs })`. Дефолт 60 с, для скачивания пакетов 600 с, для ACME 180 с. По таймауту - `stream.close()`, kill сессии, `E_TIMEOUT`.
- **Ограничение буфера.** stdout/stderr собираются в ring buffer максимум 256 КБ на команду. Переполнение отбрасывает начало.
- **Sudo.** Если `username !== 'root'`, каждая привилегированная команда оборачивается в `sudo -n -S -p '' sh -c <quoted>` с подачей пароля в stdin один раз в начале прогона (проверка `sudo -n true`). Если sudo недоступен без пароля и пароль не подходит - `E_NO_SUDO`. Пароль в командной строке не появляется никогда.

### 5.2 Контракт исполнителя команд

```ts
// ssh/types.ts
export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ICommandRunner {
  run(command: string, opts?: { timeoutMs?: number; stdin?: string }): Promise<CommandResult>;
  // Runs a command that needs root, wrapping it with sudo when the SSH
  // user isn't root. Kept separate from run() so preflight's own
  // `id -u`/`sudo -n true` probes can call run() unwrapped and get an
  // honest answer instead of a rewrapped, self-defeating result.
  runPrivileged(command: string, opts?: { timeoutMs?: number }): Promise<CommandResult>;
}

export interface IFileTransfer {
  writeFile(remotePath: string, content: string, mode: number): Promise<void>;
}
```

Весь домен зависит **только** от этих интерфейсов, никогда от `ssh2` напрямую. Это даёт фейк для тестов и убирает необходимость реального VPS при разработке.

### 5.3 Безопасное построение команд

- Никакой конкатенации пользовательского ввода в shell-строку. Все динамические значения проходят через `shellQuote()` (одинарные кавычки, экранирование `'` как `'\''`).
- Конфиги **не** пишутся через heredoc с интерполяцией. Используется один из двух путей:
  1. `IFileTransfer.writeFile()` по SFTP во временный файл, затем `install -m 600 -o root -g root <tmp> <dest>`;
  2. если SFTP недоступен: `printf %s <base64> | base64 -d > <tmp>`, где base64 генерируется в Node.
- Права: `/usr/local/etc/xray/config.json` и `/etc/hysteria/config.yaml` ставятся в `0600`, владелец соответствует пользователю сервиса.

### 5.4 Preflight (общий для всех протоколов)

Порядок проверок, каждая - отдельный шаг пайплайна с собственным кодом ошибки:

1. **TCP-достижимость** `host:port` из renderer? Нет, из main: `net.createConnection`, таймаут 5 с. Ошибка - `E_NET_UNREACHABLE`.
2. **SSH auth.** Ошибка - `E_SSH_AUTH`.
3. **Привилегии.** `id -u` или `sudo -n true`. Ошибка - `E_NO_SUDO`.
4. **Дистрибутив.** `cat /etc/os-release`, парсер `osRelease.ts` возвращает `{ id, versionId, prettyName }`. Допустимы `debian`, `ubuntu`. Иначе - `E_DISTRO_UNSUPPORTED`. Если пользователь выбрал дистрибутив вручную и он расходится с фактом, доверяем факту и пишем предупреждение в отчёт.
5. **Архитектура.** `uname -m` -> `x86_64` | `aarch64`. Иначе - `E_ARCH_UNSUPPORTED`.
6. **systemd.** `command -v systemctl && systemctl is-system-running --quiet || true`. Отсутствие systemctl - `E_NO_SYSTEMD`.
7. **Сеть наружу.** `curl -fsS -m 10 -o /dev/null https://github.com` (при отсутствии curl - `wget -q --spider`). Ошибка - `E_NO_OUTBOUND`.
8. **Занятость портов.** `ss -tulnp` -> парсер `listenPorts.ts`. Проверяются `443/tcp` (Reality), `443/udp` (Hysteria2). `80/tcp` проверяется только при `TlsMode: 'acme-domain'` (нужен под http-01), в `self-signed` не участвует. Занятость чужим процессом - `E_PORT_BUSY` с указанием процесса.
9. **DNS для Hysteria2.** Только если выбран Hysteria2 **и** включён `TlsMode: 'acme-domain'`: `getent hosts <domain>` на сервере и сверка с внешним IP (`curl -fsS https://api.ipify.org` либо адресом подключения). Несовпадение - `E_DNS_MISMATCH` с текстом «A-запись <domain> не указывает на <ip>». В режиме `self-signed` (дефолт) проверка пропускается, домен не участвует.
10. **Блокировка apt.** `fuser /var/lib/dpkg/lock-frontend` или проверка `apt-get -qq check`. Занято - `E_APT_LOCKED`, ретрай 3 раза по 10 с, затем ошибка.

Результат - `PreflightReport` со списком проверок и их статусами. Renderer при провале показывает конкретный пункт, а не общее «сервер недоступен».

### 5.5 Детект уже установленных протоколов

Выполняется в `Check`, до шага выбора ПО. Протокол считается **installed**, если выполнены все три признака; **broken**, если найдены бинарь или юнит, но сервис не активен; **absent** - если ничего не найдено.

VLESS+Reality (Xray):
```
test -x /usr/local/bin/xray
test -f /usr/local/etc/xray/config.json
systemctl is-active xray            # active | inactive | failed
systemctl is-enabled xray
```
Дополнительно: `grep -q '"security"[[:space:]]*:[[:space:]]*"reality"' /usr/local/etc/xray/config.json` чтобы отличить Reality от произвольной конфигурации Xray. Если Xray стоит, но без Reality - статус `foreign`, установка запрещена, в модалке только «Удалить» с предупреждением, что конфиг чужой.

Hysteria2:
```
test -x /usr/local/bin/hysteria
test -f /etc/hysteria/config.yaml
systemctl is-active hysteria-server.service
```

Парсер `systemctl.ts` разбирает вывод `systemctl is-active` в enum, не строкой по месту использования.

Логика разрешений на шаге выбора собирается в `PlanBuilder.buildInstallPlan(selected, statuses)` и покрывается юнит-тестами на все девять комбинаций (`absent|installed|broken` x 2 протокола).

### 5.6 Установка VLESS + Reality

Все шаги идемпотентны и проверяемы.

**Шаг X1. Базовые пакеты.**
```
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates unzip
```

**Шаг X2. Установка ядра.**
```
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
```
Официальный скрипт кладёт бинарь в `/usr/local/bin/xray`, конфиг в `/usr/local/etc/xray/`, юниты `xray.service` и `xray@.service` в `/etc/systemd/system/`, geodata в `/usr/local/share/xray/`. Проверка после шага: `xray version` и `test -x /usr/local/bin/xray`. Скрипт по умолчанию ставит сервис под пользователем `nobody`, что важно для прав на конфиг: `install -o nobody -g nogroup` вместо `root:root` при записи `config.json` (подтверждено вживую - `root:root 0600` даёт сервису `permission denied` при старте, юнит падает мгновенно). С `AmbientCapabilities=CAP_NET_BIND_SERVICE` в юните `xray` слушает 443 как `*:443`, а не `0.0.0.0:443` - это нормально, `ss` показывает такой сокет отдельной строкой с адресом `*`.

Ретрай скачивания: 3 попытки с бэкоффом 5/15/30 с, ошибка - `E_DOWNLOAD_FAILED`.

**Шаг X3. Генерация секретов.**
```
/usr/local/bin/xray uuid
/usr/local/bin/xray x25519
od -An -tx1 -N8 /dev/urandom | tr -d ' \n'      # shortId, 16 hex-символов
```
Критично: формат вывода `xray x25519` менялся. Парсер `x25519.ts` обязан поддержать оба варианта, разбирая вывод в словарь `ключ -> значение`, а не позиционно и не регуляркой по фиксированной строке:

- старый формат: `Private key:` / `Public key:`;
- новый (v25.3.6+ и серия v26): `PrivateKey:` / `Password:` / `Hash32:`, где `Password` это переименованный публичный ключ. `Hash32` к REALITY отношения не имеет и в ссылку не идёт;
- третий вариант той же линейки, подтверждён вживую на 26.3.27: та же строка подписана `Password (PublicKey):` вместо просто `Password:`. Все три варианта разбираются одним и тем же словарём `ключ -> значение`, без версионных веток.

На сервер идёт `PrivateKey`, в клиентскую ссылку - `Password` (он же публичный ключ). Перепутать их - самая частая ошибка, поэтому парсер покрывается тестами на обе фикстуры вывода.

**Шаг X4. Выбор и проверка донорского домена.** Пользователь донора не вводит. Приложение хранит встроенный список кандидатов (`domain/RealityDonors.ts`, константа, правится только через bump версии ядра), например `www.microsoft.com`, `www.swift.com`, `www.cloudflare.com`. Перебор по порядку списка:
```
xray tls ping <candidate>
```
Требуется TLS 1.3 и HTTP/2 на стороне донора (условие успеха парсится из вывода `tls ping`). Первый прошедший кандидат становится `REALITY_SNI`, используется и в `dest`, и в `serverNames`. Если ни один кандидат не прошёл - `E_NO_REALITY_DONOR`, установка Reality не выполняется, Hysteria2 (если выбран) продолжает независимо. Выбранный донор попадает в `RunResult.warnings` для прозрачности, но не в UI формы - пользователь его не редактирует.

**Шаг X5. Запись конфига** `/usr/local/etc/xray/config.json`, режим `0600`:

```json
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "tag": "vless-reality",
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [{ "id": "<UUID>", "flow": "xtls-rprx-vision" }],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "<REALITY_SNI>:443",
          "xver": 0,
          "serverNames": ["<REALITY_SNI>"],
          "privateKey": "<PRIVATE_KEY>",
          "shortIds": ["<SHORT_ID>"]
        }
      },
      "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] }
    }
  ],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }]
}
```

**Шаг X6. Валидация конфига до рестарта.**
```
/usr/local/bin/xray -test -config /usr/local/etc/xray/config.json
```
Ненулевой код - `E_CONFIG_INVALID`, откат к бэкапу конфига (`.bak`, снятому перед записью), сервис не трогаем.

**Шаг X7. Запуск.**
```
systemctl daemon-reload
systemctl enable xray
systemctl restart xray
```
Именно `restart`, а не `enable --now`, как было в первой редакции этого шага. Подтверждено вживую: официальный скрипт из X2 сам поднимает сервис со своим дефолтным конфигом `{}` ещё до того, как мы запишем свой в X5, а `--now` для уже запущенного юнита - no-op. В результате демон продолжал работать со стоковым конфигом без инбаундов: `systemctl is-active` показывал `active`, порт 443 не слушал никто, и X8 падал с `E_SERVICE_FAILED` при «успешно работающем» сервисе. `restart` поднимает остановленный юнит и перезагружает запущенный, поэтому корректен в обоих случаях - включая переустановку поверх живого сервиса, где иначе не подхватились бы новые ключи.

**Шаг X8. Верификация.**
```
systemctl is-active xray                      # ожидаем active
ss -tlnp | grep -E ':443\b'                   # порт слушается процессом xray
```
Дополнительно `journalctl -u xray -n 50 --no-pager` при неуспехе, вывод идёт только в блок диагностики. Неуспех - `E_SERVICE_FAILED`.

Важно для реализации: приложение не грепает вывод, а разбирает его `parseListenPorts` (ожидает колонку `Netid`), поэтому фактическая команда - `ss -tulnp` (оба протокола), не `ss -tlnp` в одиночку. Подтверждено вживую: при запросе только одного протокола `ss` эту колонку не печатает вовсе, и разбор молча даёт ноль записей - раньше это приводило к ложному `E_SERVICE_FAILED` даже при реально работающем сервисе. То же верно для H6s/H5a ниже (`ss -ulnp` тоже должен быть `ss -tulnp`).

**Шаг X9. Firewall.** Если активен `ufw`: `ufw allow 443/tcp`. Если `nftables`/`iptables` без ufw - не трогать правила, но добавить в отчёт предупреждение. Не включать firewall самостоятельно, это чужая зона ответственности и риск отрезать себе SSH.

### 5.7 Установка Hysteria2

Два режима TLS, выбираются на шаге 1 (раздел 4) и хранятся в `DeployParams.tlsMode`:

- **`self-signed` (дефолт).** Домен не нужен. Сертификат генерируется локально на сервере, отпечаток вшивается в клиентскую ссылку через `pinSHA256`. Никакого ACME, никакого `80/tcp`, никакого ожидания выпуска.
- **`acme-domain` (опция).** Пользователь явно указал домен и email в свёрнутом блоке. Работает как раньше: Let's Encrypt через встроенный ACME хистерии.

Общие для обоих режимов шаги:

**Шаг H1. Базовые пакеты** - те же, что X1 (шаг общий, выполняется один раз на прогон). Для `self-signed` дополнительно нужен `openssl` (обычно уже есть в базовом образе, но проверяется явно: `command -v openssl || apt-get install -y -qq openssl`).

**Шаг H2. Установка ядра.**
```
bash <(curl -fsSL https://get.hy2.sh/)
```
Официальный скрипт ставит бинарь `/usr/local/bin/hysteria`, юниты `hysteria-server.service` и `hysteria-server@.service`, пример конфига `/etc/hysteria/config.yaml`. Скрипт только устанавливает и не поднимает рабочую конфигурацию, конфиг пишем сами.

**Шаг H3. Генерация пароля.** `crypto.randomBytes(24).toString('base64url')` **на стороне клиента (Node)**, не на сервере. Пароль не должен попадать в историю shell.

#### Ветка `self-signed` (дефолт)

**Шаг H4s. Генерация сертификата.** Собственная генерация через openssl, не через `hysteria cert` (на 2.9.x последний ломает клиентов ошибкой `tls: internal error`, обход требует `sniGuard: disable`, лишняя зависимость от версии ядра). CN и SAN берём из константы `domain/HysteriaFakeSni.ts` (например `bing.com`) - значение не резолвится и не участвует в маршрутизации, это только поле сертификата:
```
openssl ecparam -genkey -name prime256v1 -out /etc/hysteria/server.key
openssl req -new -x509 -days 36500 -key /etc/hysteria/server.key \
  -out /etc/hysteria/server.crt -subj "/CN=<FAKE_SNI>"
chmod 600 /etc/hysteria/server.key /etc/hysteria/server.crt
chown hysteria:hysteria /etc/hysteria/server.key /etc/hysteria/server.crt
```
Официальный установочный скрипт создаёт отдельного системного пользователя `hysteria` (`User=hysteria`, `Group=hysteria` в юните, не `nobody`) и запускает сервис под ним - тот же класс проблемы, что и с `nobody` у Xray выше: ключ/сертификат/`config.yaml`, сгенерированные по SSH-сессии от root, должны принадлежать `hysteria:hysteria`, иначе сервис падает с `permission denied` при чтении. Подтверждено вживую. Срок 100 лет осознанно: самоподписанный сертификат никем не проверяется по цепочке доверия, ротация тут не даёт защиты, а только добавляет точку отказа (протухший серт = недоступный сервис). Отпечаток снимается сразу после генерации:
```
openssl x509 -noout -fingerprint -sha256 -in /etc/hysteria/server.crt
```
Парсер `certFingerprint.ts` приводит вывод `SHA256 Fingerprint=AA:BB:...` к строке без двоеточий в верхнем регистре, как ожидает `pinSHA256`.

**Шаг H5s. Запись конфига** `/etc/hysteria/config.yaml`, режим `0600`:
```yaml
listen: :443

tls:
  cert: /etc/hysteria/server.crt
  key: /etc/hysteria/server.key
  sniGuard: disable          # клиент не обязан прислать реальный SNI сервера

auth:
  type: password
  password: <PASSWORD>

masquerade:
  type: proxy
  proxy:
    url: https://<MASQUERADE_HOST>/
    rewriteHost: true

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
```
`sniGuard: disable` обязателен: без него сервер при определённых версиях начинает require-ить совпадение SNI с сертификатом, а клиент с `insecure: true` может слать произвольный SNI.

**Шаг H6s. Запуск.**
```
systemctl daemon-reload
systemctl enable hysteria-server.service
systemctl restart hysteria-server.service
```
`restart` вместо `enable --now` по той же причине, что и в X7 (см. подробности там): при переустановке поверх работающего сервиса `--now` не перечитал бы новый конфиг с новым паролем.

Верификация без ожидания выпуска сертификата (ACME не ждём), но с коротким ретраем: `systemctl restart` возвращает управление, как только процесс форкнут, а не когда он занял сокет, поэтому одиночная мгновенная проверка гонится со стартом демона.
```
systemctl is-active hysteria-server.service
ss -ulnp | grep -E ':443\b'
```
Неуспех - `E_SERVICE_FAILED`, диагностика из `journalctl -u hysteria-server -n 50 --no-pager`.

#### Ветка `acme-domain` (опция)

**Шаг H4a. Запись конфига** `/etc/hysteria/config.yaml`, режим `0600`:
```yaml
listen: :443

acme:
  domains:
    - <DOMAIN>
  email: <ACME_EMAIL>
  type: http          # http-01 требует свободный tcp/80

auth:
  type: password
  password: <PASSWORD>

masquerade:
  type: proxy
  proxy:
    url: https://<MASQUERADE_HOST>/
    rewriteHost: true

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
```

Заметки, обязательные к соблюдению:
- `acme` и `tls` взаимоисключающи в конфиге. В этой ветке используется только `acme`.
- ACME-каталог по умолчанию требует прав на запись, поэтому либо сервис работает под root, либо `dir` указывается в каталог, доступный пользователю сервиса. Проверить фактического `User=` в юните и выставить владельца каталога соответственно.
- `type: http` занимает `tcp/80` только на время выпуска и продления. Использовать `type: tls` нельзя: он требует `tcp/443`, который занят Reality.
- `masquerade.proxy.url` берётся из константы приложения (список безопасных доноров), не из пользовательского ввода без валидации.

**Шаг H5a. Запуск и выпуск сертификата.**
```
systemctl daemon-reload
systemctl enable hysteria-server.service
systemctl restart hysteria-server.service
```
Выпуск сертификата асинхронный. Верификация - опрос в цикле до 180 с:
```
systemctl is-active hysteria-server.service
ss -ulnp | grep -E ':443\b'
journalctl -u hysteria-server -n 100 --no-pager   # ищем признак успешного выпуска
```
Провал ACME - `E_ACME_FAILED` с человекочитаемой подсказкой: проверить A-запись, доступность tcp/80, отсутствие CAA-запрета, лимиты Let's Encrypt.

**Шаг H6a. Firewall (только эта ветка).** При активном ufw: `ufw allow 80/tcp` в дополнение к общему `ufw allow 443/udp` из H7.

**Шаг H7. Firewall (общий для обеих веток).** При активном ufw: `ufw allow 443/udp`.

#### На будущее: IP-сертификаты Let's Encrypt

С января 2026 Let's Encrypt выпускает доверенные сертификаты прямо на IP-адрес через ACME-профиль `shortlived` (валидность ~160 часов, требует перевыпуска раз в несколько дней через systemd-таймер и `certbot`). Даёт настоящий доверенный TLS без домена и без `insecure=1` в ссылке. В v1/v2 не реализуется: добавляет отдельный ACME-клиент (встроенный в hysteria профиль `shortlived` пока не поддерживает), таймер перевыпуска и мониторинг его успешности - три новых точки отказа против нуля у `self-signed`. Кандидат на `TlsMode: 'acme-ip'` в будущей версии ядра, если понадобится доверенный сертификат без покупки домена.

### 5.8 Сосуществование протоколов

VLESS+Reality занимает `443/tcp`, Hysteria2 занимает `443/udp`. Конфликта нет, оба ставятся на 443 одновременно. `80/tcp` требуется только Hysteria2 в режиме `acme-domain`; в дефолтном `self-signed` общих портов между протоколами нет вообще. Это зафиксировать в preflight и в тестах `PlanBuilder`.

### 5.9 Генерация ссылок (`LinkBuilder.ts`)

Чистые функции без побочных эффектов, полностью покрыты юнит-тестами, включая экранирование.

VLESS+Reality:
```
vless://<UUID>@<HOST>:443
  ?type=tcp
  &security=reality
  &encryption=none
  &flow=xtls-rprx-vision
  &sni=<REALITY_SNI>
  &fp=chrome
  &pbk=<PASSWORD_PUBLIC_KEY>
  &sid=<SHORT_ID>
  &spx=%2F
#Uplink-VLESS
```
(в реальной ссылке без переносов строк, все значения через `encodeURIComponent`)

Hysteria2, `self-signed` (дефолт):
```
hy2://<PASSWORD>@<IP>:443?sni=<FAKE_SNI>&insecure=1&pinSHA256=<FINGERPRINT>#Uplink-HY2
```
Хост - IP сервера. `sni` - та же константа-заглушка, что была в CN сертификата (раздел 5.7, шаг H4s), нужна только для унификации ClientHello и роли не играет благодаря `sniGuard: disable`. `insecure=1` обязателен: без него клиент попытается проверить сертификат по системному доверенному хранилищу и получит `unknown authority`. `pinSHA256` - отпечаток без двоеточий, из парсера `certFingerprint.ts`.

Клиенты, у которых `pinSHA256` в ссылке ломается (встречалось в некоторых сборках v2rayNG), обслуживаются переключателем в `KeyCard`: «Ссылка без пина» убирает параметр `pinSHA256`, оставляя только `insecure=1`. Это осознанное снижение защиты от MITM, дефолт - ссылка с пином.

Hysteria2, `acme-domain` (опция):
```
hy2://<PASSWORD>@<DOMAIN>:443?sni=<DOMAIN>&insecure=0#Uplink-HY2
```
Хост в hy2-ссылке это домен, а не IP, потому что сертификат выписан на домен. `insecure=0`, так как сертификат доверенный.

В обоих случаях пароль экранируется как user-info компонент URI.

### 5.10 Удаление и переустановка

Xray:
```
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ remove --purge
```
Fallback, если скрипт недоступен:
```
systemctl disable --now xray
rm -f /etc/systemd/system/xray.service /etc/systemd/system/xray@.service
rm -f /usr/local/bin/xray
rm -rf /usr/local/etc/xray /usr/local/share/xray /var/log/xray
systemctl daemon-reload
```

Hysteria2:
```
bash <(curl -fsSL https://get.hy2.sh/) --remove
```
Fallback:
```
systemctl disable --now hysteria-server.service
rm -f /etc/systemd/system/hysteria-server.service /etc/systemd/system/hysteria-server@.service
rm -f /usr/local/bin/hysteria
rm -rf /etc/hysteria
systemctl daemon-reload
```

Правила:
- Перед удалением конфиг копируется в `/root/uplink-backup-<timestamp>/`. Это дешёвая страховка и отдельный шаг пайплайна.
- Удаление нескольких протоколов - один прогон, шаги последовательно, частичный успех допустим и отражается в итоговом отчёте по каждому протоколу отдельно.
- Переустановка = `remove` + `install` в одном пайплайне с общим прогрессом. Ключи всегда новые, старые не восстанавливаются.
- После `remove`/fallback путь из `configPaths` (`/usr/local/etc/xray`, `/etc/hysteria`) удаляется безусловно ещё раз (`rm -rf`), даже если официальный скрипт отработал с кодом 0. Подтверждено вживую: `hy2.sh --remove` убирает бинарь и юниты, но осознанно оставляет `/etc/hysteria/config.yaml` как пользовательские данные - без этого шага `ProtocolDetector` видел уже удалённый протокол как `broken` ("найден, сервис не запущен") бесконечно, потому что конфиг физически никуда не девался.

### 5.11 Модель прогресса

```ts
// pipeline/Step.ts
export interface Step {
  id: StepId;
  title: string;        // ru, показывается пользователю
  weight: number;       // относительный вес, не проценты
  critical: boolean;    // провал критического шага останавливает пайплайн
  run(ctx: PipelineContext): Promise<void>;
}
```

- `ProgressReporter` считает процент как `sum(weight выполненных) / sum(weight всех выбранных) * 100`, округляя вниз. Никаких фейковых анимаций «до 90 % и ждём».
- Внутри длинного шага (скачивание, ACME) разрешён суб-прогресс: шаг может репортить `0..1` внутри себя, репортер интерполирует.
- Веса по умолчанию: preflight 5, базовые пакеты 5, установка ядра 25, генерация ключей 3, запись конфига 3, валидация 2, запуск 5, верификация 7. Веса задаются в `PlanBuilder`, тестируются на сумму и монотонность.
- События идут не чаще одного раза в 200 мс (throttle), чтобы не топить IPC.

### 5.12 Отмена и откат

- Точка невозврата - первый шаг записи конфига или запуска сервиса. До неё отмена мгновенная: закрываем сессию, состояние сервера не изменено.
- После точки невозврата отмена помечается как «дождаться завершения текущего шага», затем пайплайн останавливается и выполняется откат текущего протокола (восстановление `.bak`, `systemctl stop`).
- Уже успешно установленный протокол не откатывается, если упал следующий: пользователь получает ключи от того, что встало, и ошибку по тому, что не встало.

---

## 6. IPC-контракты (ЗАМОРОЖЕНО, v2)

Все каналы объявлены в `src/shared/ipc.ts`. Preload пробрасывает только их. Каждый payload валидируется zod-схемой на обеих сторонах.

```ts
export const IPC = {
  // renderer -> main, invoke
  SSH_CHECK:        'ssh:check',
  INSTALL_START:    'install:start',
  INSTALL_CANCEL:   'install:cancel',
  PROTOCOLS_REMOVE: 'protocols:remove',
  SESSION_CLOSE:    'session:close',
  HOSTKEY_CONFIRM:  'hostkey:confirm',
  // main -> renderer, send
  PROGRESS_EVENT:   'progress:event',
  HOSTKEY_PROMPT:   'hostkey:prompt',
} as const;
```

| Канал | Направление | Request | Response |
|---|---|---|---|
| `ssh:check` | invoke | `CheckRequest` | `CheckResult` |
| `install:start` | invoke | `InstallRequest` | `RunHandle` |
| `install:cancel` | invoke | `{ runId: string }` | `{ accepted: boolean }` |
| `protocols:remove` | invoke | `RemoveRequest` | `RunHandle` |
| `session:close` | invoke | `{ sessionId: string }` | `void` |
| `hostkey:confirm` | invoke | `{ promptId, accepted }` | `void` |
| `progress:event` | send | - | `ProgressEvent` |
| `hostkey:prompt` | send | - | `{ promptId, host, fingerprint, known }` |

Правило: renderer не опрашивает статус. Единственный источник прогресса - `progress:event`. Финальный результат приходит тем же каналом событием `type: 'finished'` с полным `RunResult`.

---

## 7. Общие типы (`src/shared/types.ts`, ЗАМОРОЖЕНО, v2)

```ts
export type ProtocolId = 'vless-reality' | 'hysteria2';

export type DistroId = 'debian' | 'ubuntu';

export interface ServerCredentials {
  host: string;
  port: number;
  username: string;
  password: string;          // main-only, никогда не пишется на диск
}

export type TlsMode = 'self-signed' | 'acme-domain';

export interface DeployParams {
  distroHint: DistroId | 'auto';
  tlsMode: TlsMode;          // по умолчанию 'self-signed', домен не требуется
  domain?: string;           // обязателен только при tlsMode === 'acme-domain'
  acmeEmail?: string;        // обязателен только при tlsMode === 'acme-domain'
}

export interface DistroInfo {
  id: DistroId;
  versionId: string;         // '24.04', '13'
  prettyName: string;
  arch: 'x86_64' | 'aarch64';
  hasSystemd: boolean;
}

export type CheckId =
  | 'tcp' | 'auth' | 'privileges' | 'distro' | 'arch' | 'systemd'
  | 'outbound' | 'ports' | 'dns' | 'apt-lock';
// 'dns' присутствует в PreflightReport.items только при tlsMode === 'acme-domain'.

export interface CheckItem {
  id: CheckId;
  status: 'ok' | 'warn' | 'fail';
  detail?: string;           // уже отредактированный, без секретов
}

export interface PreflightReport {
  items: CheckItem[];
  passed: boolean;
}

export type ProtocolState = 'absent' | 'installed' | 'broken' | 'foreign';

export interface ProtocolStatus {
  protocol: ProtocolId;
  state: ProtocolState;
  version?: string;
  serviceActive: boolean;
}

export interface CheckRequest {
  credentials: ServerCredentials;
  params: DeployParams;
}

export interface CheckResult {
  sessionId: string;
  distro: DistroInfo;
  preflight: PreflightReport;
  protocols: ProtocolStatus[];
}

export type InstallMode = 'install' | 'reinstall';

export interface InstallRequest {
  sessionId: string;
  protocols: ProtocolId[];
  mode: InstallMode;
  params: DeployParams;
}

export interface RemoveRequest {
  sessionId: string;
  protocols: ProtocolId[];
}

export interface RunHandle {
  runId: string;
}

export type StepId =
  | 'preflight' | 'base-packages'
  | 'xray-install' | 'xray-donor-select' | 'xray-keys' | 'xray-config' | 'xray-validate' | 'xray-start' | 'xray-verify'
  | 'hy2-install' | 'hy2-secret'
  | 'hy2-cert-generate'                  // только tlsMode: self-signed
  | 'hy2-config' | 'hy2-start'
  | 'hy2-acme-wait'                      // только tlsMode: acme-domain
  | 'hy2-verify'
  | 'firewall' | 'backup'
  | 'xray-remove' | 'hy2-remove';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StepView {
  id: StepId;
  title: string;
  status: StepStatus;
}

export type ProgressEvent =
  | { runId: string; type: 'started';  steps: StepView[] }
  | { runId: string; type: 'step';     stepId: StepId; status: StepStatus; percent: number }
  | { runId: string; type: 'note';     message: string }
  | { runId: string; type: 'finished'; result: RunResult };

export interface ProtocolOutcome {
  protocol: ProtocolId;
  ok: boolean;
  link?: string;
  error?: AppError;
}

export interface RunResult {
  runId: string;
  ok: boolean;                   // true, если хотя бы один протокол успешен
  outcomes: ProtocolOutcome[];
  warnings: string[];
  diagnostics?: string;          // прогнан через redact(), только при ошибке
}

export interface AppError {
  code: ErrorCode;
  message: string;               // ru, для пользователя
  hint?: string;                 // что сделать
}
```

## 8. Коды ошибок (`src/shared/errors.ts`, ЗАМОРОЖЕНО, v2)

```ts
export type ErrorCode =
  | 'E_NET_UNREACHABLE' | 'E_SSH_AUTH' | 'E_SSH_HOSTKEY_MISMATCH' | 'E_TIMEOUT'
  | 'E_NO_SUDO' | 'E_DISTRO_UNSUPPORTED' | 'E_ARCH_UNSUPPORTED' | 'E_NO_SYSTEMD'
  | 'E_NO_OUTBOUND' | 'E_APT_LOCKED' | 'E_PORT_BUSY'
  | 'E_DNS_MISMATCH'          // только tlsMode: acme-domain
  | 'E_ACME_FAILED'           // только tlsMode: acme-domain
  | 'E_NO_REALITY_DONOR'      // ни один встроенный донор не прошёл xray tls ping
  | 'E_CERT_GENERATION_FAILED' // только tlsMode: self-signed, сбой openssl
  | 'E_DOWNLOAD_FAILED' | 'E_CONFIG_INVALID' | 'E_SERVICE_FAILED'
  | 'E_ALREADY_INSTALLED' | 'E_FOREIGN_CONFIG' | 'E_CANCELLED' | 'E_UNKNOWN';
```

Для каждого кода в `renderer` есть строка сообщения и подсказка. Таблица соответствия - один файл `features/common/errorText.ts`, не разбросано по компонентам. Сырой текст ошибки от сервера пользователю не показывается, он идёт в `diagnostics`.

---

## 9. UI-компоненты

Примитивы собираются заранее, до фич. Ставим базу из `shadcn/ui` (React + Tailwind) и не пишем свои с нуля, кроме отмеченных.

| Компонент | Пропсы (эскиз) | Источник |
|---|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|danger`, `loading`, `disabled` | shadcn |
| `Input` | `label`, `error`, `type`, `hint` | shadcn |
| `PasswordInput` | `Input` + toggle видимости | обёртка |
| `Select` | `options`, `value`, `onChange` | shadcn |
| `Checkbox` | `checked`, `disabled`, `label`, `description` | shadcn |
| `Alert` | `tone: info\|warn\|error`, `title`, `children` | shadcn |
| `Badge` | `tone`, `children` | shadcn |
| `Card` | контейнер с рамкой | shadcn |
| `Modal` | `open`, `title`, `onClose`, footer-слот | shadcn dialog |
| `ProgressBar` | `percent`, `indeterminate` | своё |
| `StepList` | `steps: StepView[]` | своё |
| `Stepper` | индикатор 1..4 сверху окна | своё |
| `KeyCard` | `protocol`, `link`, кнопка копирования | своё |
| `CopyButton` | `value`, состояние `Скопировано` | своё |
| `Collapsible` | блок «Диагностика» | shadcn |

Дизайн-токены (цвета, радиусы, spacing) объявляются один раз в `styles/index.css` через CSS-переменные Tailwind v4. Ни один компонент не хардкодит hex. Пиксельная точность каждого примитива и композиция экранов - по `docs/design-reference.html` (дизайн-код, версия 1.1): hairline 1px как единственный структурный примитив, radius только `0` или `999px`, тени запрещены глобально, кнопка - подчёркнутое слово (кроме единственной заливной primary-пилюли на экран), моно только для машинных данных (ссылки, отпечатки, UUID, проценты, коды ошибок).

Окно: фиксированное, 1040x680 (v3, было 480x720 - не вмещало сплит-композицию дизайн-кода), без ресайза. Тема одна, светлая (paper/ink), без тёмной альтернативы - дизайн-код монохромный и однотемный.

---

## 10. Требования к коду

### 10.1 Безопасность

Обязательный чек-лист, проходить по каждому пункту перед мёрджем:
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`;
- CSP в `index.html`, запрет `unsafe-eval`;
- `shell.openExternal` только для белого списка доменов;
- `webContents.setWindowOpenHandler` возвращает `{ action: 'deny' }`;
- ASAR включён, `asarUnpack` только для того, что реально требуется;
- пароль SSH и пароль Hysteria2 не попадают в: аргументы команд, логи, IPC-события, `RunResult`, файлы на диске, дампы ошибок;
- приватный ключ self-signed сертификата (`server.key`) не покидает сервер и не попадает в `diagnostics`; наружу уходит только отпечаток (`pinSHA256`), который не является секретом;
- `redact()` применяется ко всему, что уходит в `diagnostics` и в логгер, маскируя пароль, приватный ключ, UUID и содержимое `auth:`;
- host key проверяется всегда, `hostVerifier` не заглушен;
- все внешние скачивания идут по HTTPS с ретраями, без `--insecure`;
- пользовательский ввод не попадает в shell иначе как через `shellQuote()`;
- зависимости фиксируются lock-файлом, `npm audit` в CI не игнорируется молча.

### 10.2 ООП и DRY

- Каждый протокол - класс, наследник `BaseInstaller` / `BaseRemover`. Общий шаблон установки (Template Method) живёт в базовом классе: `prepare()`, `installCore()`, `generateSecrets()`, `writeConfig()`, `validate()`, `start()`, `verify()`, `buildLink()`. Подкласс переопределяет только своё.
- Домен зависит от интерфейсов (`ICommandRunner`, `IFileTransfer`, `IProgressSink`), не от реализаций. Внедрение через конструктор, без сервис-локаторов и глобалов.
- Парсеры вывода команд - чистые функции в `domain/parsers`, отдельно от исполнения. Ни одна регулярка не живёт по месту вызова.
- Дублирование команд запрещено: `apt-get install` вызывается из одного места, запуск сервиса (`systemctl enable` + `restart`, см. X7) из одного места. Обе команды живут в `BaseInstaller` (`installAptPackages()`, `enableAndRestartService()`), там же общий `waitForService()` для верификации порта.
- Строки, показываемые пользователю, лежат в renderer. Main возвращает коды и структурированные данные, не готовые русские фразы (исключение: `title` шага, он часть контракта `StepView`).

### 10.3 Комментарии

- Только английский, кратко, по делу, объясняют **почему**, а не пересказывают код.
- JSDoc обязателен для публичных методов классов домена и для всех экспортов из `src/shared`.
- Закомментированный код не коммитится.
- Каждая нетривиальная команда shell сопровождается одной строкой комментария: что проверяем и почему именно так.

Пример допустимого комментария:
```ts
// xray x25519 output format changed in v25.3.6: "Public key" became "Password".
// Parse into a key-value map so both layouts work without version detection.
```

### 10.4 TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- `any` запрещён, при необходимости `unknown` + сужение через zod.
- Все границы (IPC, вывод команд, содержимое файлов) валидируются zod-схемами. Внутри домена типы считаются доверенными.

---

## 11. Тесты

Тест выводится из критерия приёмки задачи, а не из реализации. Тест, который просто фиксирует текущее поведение кода вместе с багами, не считается тестом.

Обязательное покрытие:

1. **Парсеры (высший приоритет).** `osRelease`, `x25519` (обе фикстуры формата вывода), `systemctl is-active`, `ss -tulnp`. Фикстуры - реальные снимки stdout в `tests/fixtures`.
2. **LinkBuilder.** Снапшоты ссылок для vless и для обеих веток hy2 (`self-signed` с пином и без, `acme-domain`), включая экранирование спецсимволов в пароле и в SNI. Отдельный тест на парсер `certFingerprint.ts`: строка `SHA256 Fingerprint=AA:BB:...` превращается в `pinSHA256`-совместимую строку без двоеточий.
3. **PlanBuilder.** Все девять комбинаций состояний двух протоколов: какие шаги в плане, какие запрещены, сумма весов, монотонность процента.
4. **Контрактные тесты IPC.** Каждый payload из раздела 6 валидируется своей zod-схемой; невалидный payload отбрасывается на границе, а не падает внутри.
5. **Идемпотентность.** Каждый инсталлер запускается дважды против фейкового `ICommandRunner` с одинаковым состоянием сервера; второй прогон не должен производить деструктивных команд без флага `reinstall`.
6. **Путь ошибки.** Фейковый runner умеет возвращать ненулевой код, таймаут и мусор в stdout. На каждый код ошибки из раздела 8 есть тест, что пайплайн останавливается корректно и отдаёт нужный `ErrorCode`.
7. **Откат.** Провал `xray-validate` восстанавливает `.bak` и не трогает работающий сервис.

Ручной smoke-прогон перед релизом: чистый Debian 13 и чистая Ubuntu 24.04, оба сценария (по одному протоколу и оба сразу), переустановка, удаление обоих.

---

## 12. Конвенции коммитов и git

Автор коммитов настраивается один раз в репозитории:
```
git config user.name  "daimon"
git config user.email "marsel.shamsutdinov@icloud.com"
```

Правила:
- Язык коммитов, PR и комментариев - только английский.
- Формат фиксированный, Conventional Commits: `type(scope): summary`. `type` из закрытого набора `feat|fix|test|refactor|chore|docs`. `summary` в императиве, со строчной буквы, без точки в конце, до ~50 символов.
- `scope` из закрытого набора: `ssh`, `domain`, `xray`, `hy2`, `ipc`, `ui`, `build`, `deps`.
- Тело коммита только если нужно объяснить **почему**, не **что**.
- Коммиты маленькие и по ходу работы, не один большой в конце. Каждый коммит по возможности проходит тайпчек.
- **В коммитах, PR, комментариях и документации не должно быть следов генерации нейросетью:** никаких `Co-Authored-By`, `Generated with`, упоминаний ассистентов, служебных приписок и характерной служебной лексики. Проверять `git log --format='%B'` перед пушем.
- Никаких эмодзи в коммитах.

Примеры:
```
feat(xray): add reality installer with x25519 key generation
fix(ssh): reject connection on host key mismatch
test(domain): cover both x25519 output formats
refactor(ipc): move channel names to shared module
```

---

## 13. Сборка и релиз

- `electron-vite dev` для разработки, `electron-vite build` + `electron-builder` для релиза.
- Цели `electron-builder.yml`:
  - Windows: `nsis`, x64;
  - macOS: `dmg`, `zip`, arm64 + x64 (universal при наличии подписи);
  - Linux: `AppImage`, `deb`, x64.
- Подпись и нотаризация: в v1 не блокирует релиз, вынести в бэклог. В README честно указать, что сборка не подписана.
- Версионирование `semver`, тег `vX.Y.Z`, релиз на GitHub Releases.
- Минимальный CI (GitHub Actions), один workflow: `lint` -> `typecheck` -> `test` -> `build`. Деплоя нет, артефакты собираются по тегу.

---

## 14. Definition of Done одной задачи

Задача закрыта, когда:
1. `eslint` и `prettier --check` зелёные;
2. `tsc --noEmit` зелёный;
3. `vitest run` зелёный, новые тесты выведены из критериев приёмки задачи;
4. приложение собирается (`electron-vite build`);
5. если задача трогала протокол - выполнен ручной прогон на чистой VM соответствующего дистрибутива;
6. если задача потребовала нового типа, канала, кода ошибки или формата ссылки - этот файл обновлён и версия ядра поднята;
7. коммиты соответствуют разделу 12.

Если по ходу задачи не хватает контракта (типа, поля, канала, кода ошибки), работа останавливается: контракт сначала дописывается в этот файл с бампом версии, только потом пишется код. Выдумывать тип по месту запрещено, это главный источник расхождений даже при работе в одиночку.

---

## 15. Дорожная карта

Каждая стадия - несколько задач, каждая задача это один вертикальный кусок и один коммит-набор.

**Стадия 0. Скелет.**
Инициализация electron-vite + React + Tailwind, security-хардненинг окна, `src/shared` с типами и схемами, регистрация одного демо-канала IPC, примитивы UI отрисованы в kitchen-sink роуте, vitest настроен и гоняет один тривиальный тест, CI зелёный, `electron-builder` собирает пустое приложение под все три платформы.

Чек-лист «скелет готов» (проходить целиком, до него фичи не начинать):
- CI зелёный на тривиальном коммите;
- окно открывается, `contextIsolation` и `sandbox` включены, CSP на месте;
- `window.uplink` типизирован и виден в renderer;
- примитивы из раздела 9 отрендерены в kitchen-sink;
- `vitest run` проходит;
- сборка под win/mac/linux завершается без ошибок.

**Стадия 1. SSH-ядро.**
`SshSession`, `CommandRunner`, `FileTransfer`, `HostKeyStore` с TOFU и модалкой отпечатка, фейковый `ICommandRunner` для тестов.

**Стадия 2. Check.**
Форма шага 1, `ssh:check`, preflight из 5.4, `DistroDetector`, отображение ошибок по кодам.

**Стадия 3. Детект протоколов.**
`ProtocolDetector`, `PlanBuilder`, шаг 2 с правилами блокировки чекбоксов, модалка конфликта.

**Стадия 4. VLESS+Reality.**
`BaseInstaller` + `XrayRealityInstaller`, парсер `x25519`, `LinkBuilder` для vless, полный пайплайн X1..X9, тесты по разделу 11.

**Стадия 5. Прогресс и результат.**
`Pipeline`, `ProgressReporter`, throttle событий, шаг 3 и шаг 4, копирование и сохранение ключей, отмена и откат.

**Стадия 6. Hysteria2.**
`Hysteria2Installer` для `tlsMode: self-signed` (дефолт): `CertGenerator`, `certFingerprint.ts`, конфиг с `sniGuard: disable`, `LinkBuilder` с `pinSHA256` и запасным вариантом без пина. Совместная установка обоих протоколов на 443. Веткой `acme-domain` (свёрнутый блок в форме, ожидание выпуска сертификата, `E_DNS_MISMATCH`/`E_ACME_FAILED`) закрывать отдельной задачей после того, как self-signed путь пройден и оттестирован.

**Стадия 7. Удаление и переустановка.**
`BaseRemover` + два ремувера, бэкап конфигов, мультивыбор в модалке, переустановка как remove+install.

**Стадия 8. Релиз.**
README, иконки, сборка под три платформы, ручной smoke на Debian 13 и Ubuntu 24.04, тег и релиз.

Бэклог (за пределами v1/v2): авторизация по SSH-ключу, порт-хоппинг для Hysteria2, выбор портов, несколько пользователей на протокол, ротация ключей, экспорт подписки, автообновление приложения, `TlsMode: 'acme-ip'` через Let's Encrypt IP-сертификаты (профиль `shortlived`, ~160 часов, требует `certbot` + systemd-таймер перевыпуска) как доверенная альтернатива `self-signed` без покупки домена.

---

## 16. Известные подводные камни

Список не декоративный, каждый пункт стоил кому-то нескольких часов.

1. **`xray x25519` меняет формат вывода между версиями.** В серии v26 второе поле называется `Password (PublicKey)`, а `Hash32` к Reality отношения не имеет. Парсить только словарём, не позиционно.
2. **Клиенту идёт публичный ключ (`Password`), серверу приватный (`PrivateKey`).** Перепутать - молчаливый отказ подключения без внятной ошибки.
3. **Hysteria2 в режиме `acme-domain` не поднимется без корректной A-записи** на домен. Проверять DNS до установки, а не разбирать логи ACME после. В дефолтном `self-signed` этого пункта нет вообще - домен не участвует.
4. **`acme.type: tls` конфликтует с Reality** на 443/tcp. Только `http` на 80/tcp, и только в ветке `acme-domain`.
5. **ACME-каталогу нужны права.** Если сервис не под root, `dir` должен быть доступен пользователю сервиса на запись. Актуально только для `acme-domain`.
6. **Официальный скрипт Hysteria только устанавливает**, рабочий конфиг он не создаёт. Пример конфига запускать нельзя.
7. **`apt` может быть занят** unattended-upgrades на свежем VPS. Ретраить, а не падать.
8. **Reality-донор должен поддерживать TLS 1.3 и HTTP/2** и желательно жить в том же ASN/регионе. Проверять `xray tls ping` до записи конфига; пользователь донора не выбирает, список встроен в приложение.
9. **Не включать ufw самостоятельно.** Легко отрезать себе SSH и превратить установку в кирпич.
10. **`systemctl is-active` возвращает ненулевой код** при `inactive`, это не ошибка выполнения. Не путать код возврата команды с результатом проверки.
11. **`hysteria cert` на версии 2.9.x ломает клиентов** ошибкой `tls: internal error`. Генерировать самоподписанный сертификат самостоятельно через openssl.
12. **Без `sniGuard: disable` self-signed сервер может отвергать клиентов**, если версия хистерии начинает строго сверять SNI из ClientHello с сертификатом.
13. **Отдельные сборки клиентов криво парсят `pinSHA256`** в hy2-ссылке (встречалось в v2rayNG). Держать в UI запасной вариант ссылки без пина.
