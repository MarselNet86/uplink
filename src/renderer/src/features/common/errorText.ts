import type { ErrorCode } from '@shared/errors';

export interface ErrorText {
  title: string;
  hint: string;
}

/**
 * Single source of Russian copy per ErrorCode (tech.md section 8/10.2):
 * main returns codes and terse diagnostics, this table owns the words the
 * user actually sees.
 */
export const ERROR_TEXT: Record<ErrorCode, ErrorText> = {
  E_NET_UNREACHABLE: {
    title: 'Сервер недоступен',
    hint: 'Проверьте IP, порт и то, что сервер включён и принимает соединения.',
  },
  E_SSH_AUTH: {
    title: 'Не удалось авторизоваться по SSH',
    hint: 'Проверьте имя пользователя и пароль.',
  },
  E_SSH_HOSTKEY_MISMATCH: {
    title: 'Отпечаток сервера изменился',
    hint: 'Это может означать переустановку ОС на сервере или подмену (MITM). Если вы уверены, что это ваш сервер, удалите его из known_hosts.json.',
  },
  E_TIMEOUT: {
    title: 'Превышено время ожидания',
    hint: 'Сервер отвечает слишком медленно. Попробуйте ещё раз.',
  },
  E_NO_SUDO: {
    title: 'Нет прав администратора',
    hint: 'Пользователь должен быть root или иметь доступ к sudo без дополнительного подтверждения.',
  },
  E_DISTRO_UNSUPPORTED: {
    title: 'Дистрибутив не поддерживается',
    hint: 'Uplink работает только с Debian и Ubuntu.',
  },
  E_ARCH_UNSUPPORTED: {
    title: 'Архитектура не поддерживается',
    hint: 'Поддерживаются только x86_64 и aarch64.',
  },
  E_NO_SYSTEMD: {
    title: 'systemd не найден',
    hint: 'Серверу нужен systemd для управления сервисами.',
  },
  E_NO_OUTBOUND: {
    title: 'Нет исходящего доступа в интернет',
    hint: 'Серверу нужно скачать пакеты. Проверьте исходящий firewall.',
  },
  E_APT_LOCKED: {
    title: 'apt занят другим процессом',
    hint: 'Дождитесь завершения автоматических обновлений и повторите проверку.',
  },
  E_PORT_BUSY: {
    title: 'Нужный порт занят',
    hint: 'Освободите порт 443 (или 80 для ACME) от постороннего процесса.',
  },
  E_DNS_MISMATCH: {
    title: 'A-запись домена не указывает на сервер',
    hint: 'Обновите DNS-запись домена и повторите проверку.',
  },
  E_ACME_FAILED: {
    title: 'Не удалось выпустить сертификат',
    hint: 'Проверьте A-запись, доступность порта 80 и лимиты Let’s Encrypt.',
  },
  E_NO_REALITY_DONOR: {
    title: 'Не найден донорский домен для Reality',
    hint: 'Ни один встроенный кандидат не прошёл проверку. Попробуйте позже.',
  },
  E_CERT_GENERATION_FAILED: {
    title: 'Не удалось сгенерировать сертификат',
    hint: 'На сервере не установлен или неисправен openssl.',
  },
  E_DOWNLOAD_FAILED: {
    title: 'Не удалось скачать пакет',
    hint: 'Проверьте сеть на сервере и повторите попытку.',
  },
  E_CONFIG_INVALID: {
    title: 'Конфигурация не прошла проверку',
    hint: 'Изменения отменены, сервис не тронут.',
  },
  E_SERVICE_FAILED: {
    title: 'Сервис не запустился',
    hint: 'Смотрите диагностику для подробностей.',
  },
  E_ALREADY_INSTALLED: {
    title: 'Протокол уже установлен',
    hint: 'Используйте управление, чтобы переустановить или удалить.',
  },
  E_FOREIGN_CONFIG: {
    title: 'Найден чужой конфиг',
    hint: 'На сервере уже есть Xray без Reality. Установка невозможна, доступно только удаление.',
  },
  E_CANCELLED: {
    title: 'Отменено',
    hint: 'Операция остановлена по вашему запросу.',
  },
  E_UNKNOWN: {
    title: 'Неизвестная ошибка',
    hint: 'Повторите попытку. Если ошибка повторяется, посмотрите диагностику.',
  },
};
