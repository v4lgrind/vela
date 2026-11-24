import { AuthError } from '@/domain';

const AUTH_ERROR_KEYS: Record<AuthError['reason'], string> = {
  'invalid-credentials': 'login.failed',
  unreachable: 'login.unreachable',
  'device-code-disabled': 'login.qcDisabled',
  'device-code-unsupported': 'login.qcUnsupported',
  expired: 'login.qcTimeout',
  unknown: 'login.failed',
};

/** Sign-in error as a sentence, whatever the backend. */
export function authMessage(t: (key: string) => string, error: unknown, overrides: Partial<Record<AuthError['reason'], string>> = {}): string {
  if (!(error instanceof AuthError)) return t('login.failed');
  return t(overrides[error.reason] ?? AUTH_ERROR_KEYS[error.reason]);
}
