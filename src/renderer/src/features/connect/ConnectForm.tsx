import { useState } from 'react';
import type { AppError, CheckResult, DeployParams } from '@shared/types';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Collapsible } from '../../ui/Collapsible';
import { Input } from '../../ui/Input';
import { PasswordInput } from '../../ui/PasswordInput';
import { ErrorDetailsModal } from '../common/ErrorDetailsModal';
import { deriveAutoAcmeEmail, deriveAutoDomain, validateConnectForm } from './formValidation';
import type { ConnectFormErrors, ConnectFormValues } from './formValidation';

const initialValues: ConnectFormValues = {
  host: '',
  port: '22',
  username: 'root',
  password: '',
  domainOverride: false,
  domain: '',
  acmeEmail: '',
  realitySni: '',
  hysteriaSni: '',
};

export interface ConnectFormProps {
  onChecked: (result: CheckResult, params: DeployParams) => void;
  /** Lets the surrounding screen mirror the probe in its own status readout. */
  onProbingChange?: (probing: boolean) => void;
}

export function ConnectForm({ onChecked, onProbingChange }: ConnectFormProps) {
  const [values, setValues] = useState<ConnectFormValues>(initialValues);
  const [errors, setErrors] = useState<ConnectFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<AppError | null>(null);

  const setProbing = (probing: boolean) => {
    setLoading(probing);
    onProbingChange?.(probing);
  };

  const set = <K extends keyof ConnectFormValues>(key: K, value: ConnectFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Recomputed every render from the current host - sslip.io needs no
  // registration, so this is the zero-input default for Hysteria2's
  // trusted-cert mode. '' means the host doesn't fit either auto case
  // (not IPv4, not already a domain), and self-signed is used instead.
  const autoDomain = deriveAutoDomain(values.host);

  const submit = async () => {
    const fieldErrors = validateConnectForm(values);
    setErrors(fieldErrors);
    setServerError(null);
    if (Object.keys(fieldErrors).length > 0) return;

    setProbing(true);
    try {
      // Omitted rather than sent empty: exactOptionalPropertyTypes and the
      // zod schema both treat these as "absent means use the default".
      const sni = {
        ...(values.realitySni.trim() ? { realitySni: values.realitySni.trim() } : {}),
        ...(values.hysteriaSni.trim() ? { hysteriaSni: values.hysteriaSni.trim() } : {}),
      };
      const domain = values.domainOverride ? values.domain.trim() : autoDomain;
      const acmeEmail = values.domainOverride
        ? values.acmeEmail.trim()
        : domain
          ? deriveAutoAcmeEmail(domain)
          : '';
      // Distro is always auto-detected server-side (Preflight); the form
      // never asked the user for it, so there is nothing to override here.
      const params: DeployParams = domain
        ? { distroHint: 'auto', tlsMode: 'acme-domain', domain, acmeEmail, ...sni }
        : { distroHint: 'auto', tlsMode: 'self-signed', ...sni };
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
      setProbing(false);
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

      <Collapsible title="Домен для Hysteria2 · автоматически">
        <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
          {autoDomain ? (
            <>
              Бесплатно и без регистрации будет использован домен <code>{autoDomain}</code> и
              доверенный сертификат Let&apos;s Encrypt.
            </>
          ) : (
            'Автоматический домен недоступен для этого хоста (не похож на IPv4 или домен) - будет использован самоподписанный сертификат.'
          )}
        </p>
        <Checkbox
          checked={values.domainOverride}
          onCheckedChange={(checked) => {
            set('domainOverride', checked);
            if (checked) {
              if (!values.domain.trim()) set('domain', autoDomain);
              if (!values.acmeEmail.trim() && autoDomain) {
                set('acmeEmail', deriveAutoAcmeEmail(autoDomain));
              }
            }
          }}
          label="Указать свой домен"
          description="Только если у вас уже есть собственный домен, направленный на этот сервер"
        />
        {values.domainOverride && (
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

      <Collapsible title="Маскировка SNI · необязательно">
        <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
          Оставьте пустым, чтобы приложение выбрало значения само.
        </p>
        <Input
          label="Донор для Reality"
          mono
          placeholder="www.cloudflare.com"
          value={values.realitySni}
          onChange={(e) => set('realitySni', e.target.value)}
          error={errors.realitySni}
          hint="Чужой сайт с TLS 1.3 и короткой цепочкой сертификатов. Проверяется перед установкой."
        />
        <Input
          label="SNI для Hysteria2"
          mono
          placeholder="bing.com"
          value={values.hysteriaSni}
          onChange={(e) => set('hysteriaSni', e.target.value)}
          error={errors.hysteriaSni}
          hint="Только имя в самоподписанном сертификате, никуда не резолвится."
        />
      </Collapsible>

      <ErrorDetailsModal
        open={serverError !== null}
        error={serverError}
        context="Проверка сервера"
        onClose={() => setServerError(null)}
      />

      <div className="split-foot">
        <span className="eyebrow">Пароль не сохраняется на диск</span>
        <Button variant="primary" loading={loading} onClick={() => void submit()}>
          Проверить сервер
        </Button>
      </div>
    </>
  );
}
