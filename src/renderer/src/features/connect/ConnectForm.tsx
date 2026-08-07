import { useState } from 'react';
import type { AppError, CheckResult, DeployParams } from '@shared/types';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Collapsible } from '../../ui/Collapsible';
import { Input } from '../../ui/Input';
import { PasswordInput } from '../../ui/PasswordInput';
import { ErrorDetailsModal } from '../common/ErrorDetailsModal';
import { buildDeployParams, validateConnectForm } from './formValidation';
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
      const params: DeployParams = buildDeployParams(values);
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
      <h3 className="split-h">Server details</h3>

      <div className="field-row">
        <Input
          label="IP or host"
          mono
          value={values.host}
          onChange={(e) => set('host', e.target.value)}
          error={errors.host}
          className="flex-[2]"
        />
        <Input
          label="Port"
          mono
          value={values.port}
          onChange={(e) => set('port', e.target.value)}
          error={errors.port}
          className="flex-1"
        />
      </div>

      <div className="field-row">
        <Input
          label="Username"
          value={values.username}
          onChange={(e) => set('username', e.target.value)}
          error={errors.username}
        />
        <PasswordInput
          label="Password"
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          error={errors.password}
        />
      </div>

      <Collapsible title="Domain for Hysteria2 · optional">
        <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
          By default Hysteria2 gets a free <span className="mono">sslip.io</span> domain derived
          from the address above, and a real Let&apos;s Encrypt certificate for it - nothing to buy
          or register. Check the box below to use a domain you already own instead.
        </p>
        <Checkbox
          checked={values.domainOverride}
          onCheckedChange={(checked) => set('domainOverride', checked)}
          label="Use my own domain"
          description="Only if you already have your own domain pointed at this server"
        />
        {values.domainOverride && (
          <>
            <Input
              label="Domain"
              mono
              placeholder="vpn.example.com"
              value={values.domain}
              onChange={(e) => set('domain', e.target.value)}
              error={errors.domain}
            />
            <Input
              label="Email for ACME"
              placeholder="you@example.com"
              value={values.acmeEmail}
              onChange={(e) => set('acmeEmail', e.target.value)}
              error={errors.acmeEmail}
            />
          </>
        )}
      </Collapsible>

      <Collapsible title="SNI masking · optional">
        <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
          Leave blank to let the app choose the values automatically.
        </p>
        <Input
          label="Donor for Reality"
          mono
          placeholder="www.cloudflare.com"
          value={values.realitySni}
          onChange={(e) => set('realitySni', e.target.value)}
          error={errors.realitySni}
          hint="A third-party site with TLS 1.3 and a short certificate chain. Checked before installation."
        />
        <Input
          label="SNI for Hysteria2"
          mono
          placeholder="bing.com"
          value={values.hysteriaSni}
          onChange={(e) => set('hysteriaSni', e.target.value)}
          error={errors.hysteriaSni}
          hint="Only a name in the self-signed certificate, does not resolve anywhere."
        />
      </Collapsible>

      <ErrorDetailsModal
        open={serverError !== null}
        error={serverError}
        context="Checking server"
        onClose={() => setServerError(null)}
      />

      <div className="split-foot">
        <span className="eyebrow">Password is not saved to disk</span>
        <Button variant="primary" loading={loading} onClick={() => void submit()}>
          Check server
        </Button>
      </div>
    </>
  );
}
