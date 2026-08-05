import { describe, expect, it } from 'vitest';
import { generateSelfSignedCert } from '../../src/main/domain/CertGenerator';
import { InstallerError } from '../../src/main/domain/installers/InstallerError';
import { FakeCommandRunner } from '../fakes/FakeCommandRunner';

function makeHappyRunner(): FakeCommandRunner {
  const runner = new FakeCommandRunner();
  runner.setDefault({ code: 0 });
  runner.script("openssl x509 -noout -fingerprint -sha256 -in '/etc/hysteria/server.crt'", {
    code: 0,
    stdout: 'SHA256 Fingerprint=AA:BB:CC:DD\n',
  });
  return runner;
}

describe('generateSelfSignedCert', () => {
  it('returns the parsed fingerprint on success', async () => {
    const runner = makeHappyRunner();
    const cert = await generateSelfSignedCert(runner, 'bing.com');
    expect(cert.fingerprint).toBe('AABBCCDD');
  });

  it('throws E_CERT_GENERATION_FAILED when openssl ecparam fails (BUG-23)', async () => {
    const runner = makeHappyRunner();
    runner.script("openssl ecparam -genkey -name prime256v1 -out '/etc/hysteria/server.key'", {
      code: 1,
      stderr: 'error setting curve\n',
    });

    await expect(generateSelfSignedCert(runner, 'bing.com')).rejects.toMatchObject({
      code: 'E_CERT_GENERATION_FAILED',
    });
  });

  it('throws E_CERT_GENERATION_FAILED when the fingerprint step fails (BUG-23)', async () => {
    const runner = makeHappyRunner();
    runner.script("openssl x509 -noout -fingerprint -sha256 -in '/etc/hysteria/server.crt'", {
      code: 1,
      stderr: 'unable to load certificate\n',
    });

    let caught: unknown;
    try {
      await generateSelfSignedCert(runner, 'bing.com');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InstallerError);
    expect((caught as InstallerError).code).toBe('E_CERT_GENERATION_FAILED');
  });
});
