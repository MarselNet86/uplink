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
      <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{title}</h2>
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
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="font-serif text-[length:var(--t-display)]">Kitchen sink</h1>

      <Section title="Stepper">
        <Stepper current={2} />
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input label="IP / хост" placeholder="203.0.113.10" hint="IPv4, IPv6 или FQDN" />
        <Input label="SSH user" error="Поле не может быть пустым" />
        <PasswordInput label="SSH password" placeholder="••••••••" />
        <Select
          label="Дистрибутив"
          value={distro}
          onChange={setDistro}
          options={[
            { value: 'auto', label: 'auto' },
            { value: 'debian', label: 'debian' },
            { value: 'ubuntu', label: 'ubuntu' },
          ]}
        />
      </Section>

      <Section title="Checkbox">
        <Checkbox
          checked={checked}
          onCheckedChange={setChecked}
          label="VLESS + Reality"
          description="443/tcp"
        />
        <Checkbox
          checked={false}
          onCheckedChange={() => {}}
          disabled
          label="Hysteria2 (недоступно)"
        />
      </Section>

      <Section title="Alert">
        <Alert tone="info" title="Проверка подключения">
          Сервер отвечает на порт 22.
        </Alert>
        <Alert tone="warn" title="Внимание">
          Обнаружен нестандартный порт SSH.
        </Alert>
        <Alert tone="error" title="Ошибка подключения">
          Не удалось авторизоваться по SSH.
        </Alert>
      </Section>

      <Section title="Badge">
        <div className="flex gap-2">
          <Badge tone="default">absent</Badge>
          <Badge tone="success">installed</Badge>
          <Badge tone="warn">broken</Badge>
          <Badge tone="danger">foreign</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card>Контейнер с рамкой, без теней.</Card>
      </Section>

      <Section title="Modal">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Открыть модалку
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
        <ProgressBar percent={45} />
        <ProgressBar percent={0} indeterminate />
        <ProgressBar percent={70} failed />
      </Section>

      <Section title="StepList">
        <StepList steps={demoSteps} />
      </Section>

      <Section title="KeyCard + CopyButton">
        <KeyCard
          protocol="vless-reality"
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
        {pingResult && <p className="font-mono text-[11px] text-muted">{pingResult}</p>}
      </Section>
    </div>
  );
}
