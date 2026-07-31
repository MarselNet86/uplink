import { useState } from 'react';
import type { AppError, CheckResult, DeployParams } from '@shared/types';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Collapsible } from '../../ui/Collapsible';
import { Input } from '../../ui/Input';
import { PasswordInput } from '../../ui/PasswordInput';
import { Select } from '../../ui/Select';
import { ERROR_TEXT } from '../common/errorText';
import { validateConnectForm } from './formValidation';
import type { ConnectFormErrors, ConnectFormValues } from './formValidation';

const initialValues: ConnectFormValues = {
  distroHint: 'auto',
  host: '',
  port: '22',
  username: 'root',
  password: '',
  domainEnabled: false,
  domain: '',
  acmeEmail: '',
};

export interface ConnectFormProps {
  onChecked: (result: CheckResult, params: DeployParams) => void;
}

export function ConnectForm({ onChecked }: ConnectFormProps) {
  const [values, setValues] = useState<ConnectFormValues>(initialValues);
  const [errors, setErrors] = useState<ConnectFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<AppError | null>(null);

  const set = <K extends keyof ConnectFormValues>(key: K, value: ConnectFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    const fieldErrors = validateConnectForm(values);
    setErrors(fieldErrors);
    setServerError(null);
    if (Object.keys(fieldErrors).length > 0) return;

    setLoading(true);
    try {
      const params: DeployParams = values.domainEnabled
        ? {
            distroHint: values.distroHint,
            tlsMode: 'acme-domain',
            domain: values.domain.trim(),
            acmeEmail: values.acmeEmail.trim(),
          }
        : { distroHint: values.distroHint, tlsMode: 'self-signed' };
      const result = await window.uplink.sshCheck({
        credentials: {
          host: values.host.trim(),
          port: Number(values.port),
          username: values.username.trim(),
          password: values.password,
        },
        params,
      });
      onChecked(result, params);
    } catch (err) {
      setServerError(err as AppError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h3 className="split-h">Данные сервера</h3>

      <div className="field-row">
        <Input
          label="IP или хост"
          mono
          value={values.host}
          onChange={(e) => set('host', e.target.value)}
          error={errors.host}
          className="flex-[2]"
        />
        <Input
          label="Порт"
          mono
          value={values.port}
          onChange={(e) => set('port', e.target.value)}
          error={errors.port}
          className="flex-1"
        />
      </div>

      <div className="field-row">
        <Input
          label="Пользователь"
          value={values.username}
          onChange={(e) => set('username', e.target.value)}
          error={errors.username}
        />
        <PasswordInput
          label="Пароль"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          error={errors.password}
        />
      </div>

      <Select
        label="Дистрибутив"
        value={values.distroHint}
        onChange={(v) => set('distroHint', v as ConnectFormValues['distroHint'])}
        options={[
          { value: 'auto', label: 'Определить автоматически' },
          { value: 'debian', label: 'Debian' },
          { value: 'ubuntu', label: 'Ubuntu' },
        ]}
      />

      <Collapsible title="Домен · необязательно">
        <Checkbox
          checked={values.domainEnabled}
          onCheckedChange={(checked) => set('domainEnabled', checked)}
          label="У меня есть домен"
          description="Hysteria2 будет использовать доверенный сертификат ACME вместо самоподписанного"
        />
        {values.domainEnabled && (
          <>
            <Input
              label="Домен"
              mono
              placeholder="vpn.example.com"
              value={values.domain}
              onChange={(e) => set('domain', e.target.value)}
              error={errors.domain}
            />
            <Input
              label="Email для ACME"
              placeholder="you@example.com"
              value={values.acmeEmail}
              onChange={(e) => set('acmeEmail', e.target.value)}
              error={errors.acmeEmail}
            />
          </>
        )}
      </Collapsible>

      {serverError && (
        <Alert tone="error" title={ERROR_TEXT[serverError.code].title}>
          {ERROR_TEXT[serverError.code].hint}
        </Alert>
      )}

      <div className="split-foot">
        <span className="eyebrow">Пароль не сохраняется на диск</span>
        <Button variant="primary" loading={loading} onClick={() => void submit()}>
          Проверить сервер
        </Button>
      </div>
    </>
  );
}
