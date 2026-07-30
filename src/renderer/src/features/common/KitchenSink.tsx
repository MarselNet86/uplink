import { useState } from 'react';
import type { StepView } from '@shared/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapsible,
  CopyButton,
  Input,
  KeyCard,
  Modal,
  PasswordInput,
  ProgressBar,
  Select,
  StepList,
  Stepper,
} from '../../ui';

const demoSteps: StepView[] = [
  { id: 'preflight', title: 'Проверка сервера', status: 'done' },
  { id: 'base-packages', title: 'Базовые пакеты', status: 'running' },
  { id: 'xray-install', title: 'Установка Xray', status: 'pending' },
  { id: 'hy2-verify', title: 'Проверка Hysteria2', status: 'skipped' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-rule pb-6">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

export function KitchenSink() {
  const [distro, setDistro] = useState('auto');
  const [checked, setChecked] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  const runDemoPing = async () => {
    const res = await window.uplink.demoPing({ message: 'hello from renderer' });
    setPingResult(`${res.echo} @ ${res.receivedAt}`);
  };

  return (
    <div
      className="mx-auto flex max-w-md flex-col gap-6 overflow-y-auto p-6"
      style={{ height: '100%' }}
    >
      <h1 className="font-serif text-[length:var(--t-display)]">Kitchen sink</h1>

      <Section title="Stepper">
        <Stepper current={2} />
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary">Проверить сервер</Button>
          <Button variant="primary" disabled>
            Установить
          </Button>
          <Button variant="secondary">Назад</Button>
          <Button variant="ghost">Диагностика</Button>
          <Button variant="danger">Удалить</Button>
          <Button variant="primary" loading>
            Подключение
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input label="IP / хост" placeholder="203.0.113.10" hint="IPv4, IPv6 или FQDN" mono />
        <Input label="SSH user" error="Поле не может быть пустым" />
        <PasswordInput label="SSH password" placeholder="••••••••" />
        <Select
          label="Дистрибутив"
          value={distro}
          onChange={setDistro}
          options={[
            { value: 'auto', label: 'Определить автоматически' },
            { value: 'debian', label: 'Debian' },
            { value: 'ubuntu', label: 'Ubuntu' },
          ]}
        />
      </Section>

      <Section title="Checkbox">
        <Checkbox
          checked={checked}
          onCheckedChange={setChecked}
          label="VLESS + Reality"
          description="Порт 443/tcp · домен не нужен"
        />
        <Checkbox
          checked={false}
          onCheckedChange={() => {}}
          disabled
          label="Hysteria2"
          description="Уже установлен на сервере"
        />
      </Section>

      <Section title="Alert">
        <Alert tone="info" title="Донор выбран автоматически">
          Reality маскируется под www.microsoft.com. Ваши DNS-записи не нужны.
        </Alert>
        <Alert tone="warn" title="Firewall не настроен приложением">
          На сервере активен nftables. Правила не тронуты, откройте 443/udp вручную.
        </Alert>
        <Alert tone="error" title="Порт 443/tcp занят процессом nginx">
          Освободите порт или остановите nginx, затем запустите проверку заново.
        </Alert>
      </Section>

      <Section title="Badge">
        <div className="flex gap-3">
          <Badge tone="default">Не запущен</Badge>
          <Badge tone="success">Установлен</Badge>
          <Badge tone="danger">Чужой конфиг</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card>Контейнер с рамкой, без теней.</Card>
      </Section>

      <Section title="Modal">
        <Button variant="ghost" onClick={() => setModalOpen(true)}>
          Показать модалку
        </Button>
        <Modal
          open={modalOpen}
          title="Протокол уже установлен на сервере"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Отмена
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Удалить
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Переустановить
              </Button>
            </>
          }
        >
          Старые ссылки перестанут работать.
        </Modal>
      </Section>

      <Section title="ProgressBar">
        <ProgressBar stage="Установка ядра Xray" percent={34} />
        <ProgressBar stage="Сбой: запуск сервиса" percent={70} failed />
      </Section>

      <Section title="StepList">
        <StepList steps={demoSteps} />
      </Section>

      <Section title="KeyCard + CopyButton">
        <KeyCard
          protocol="vless-reality"
          port="443/tcp"
          link="vless://uuid@203.0.113.10:443?type=tcp&security=reality#Uplink-VLESS"
        />
        <CopyButton value="hy2://password@203.0.113.10:443" />
      </Section>

      <Section title="Collapsible (диагностика)">
        <Collapsible title="Диагностика">
          <pre>stderr: connection reset by peer</pre>
        </Collapsible>
      </Section>

      <Section title="IPC demo channel">
        <Button variant="secondary" onClick={runDemoPing}>
          window.uplink.demoPing()
        </Button>
        {pingResult && <p className="eyebrow mono">{pingResult}</p>}
      </Section>
    </div>
  );
}
