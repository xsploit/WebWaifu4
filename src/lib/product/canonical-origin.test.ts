import { describe, expect, it } from 'vitest';
import { getCanonicalProductRedirectUrl } from './canonical-origin';

describe('product canonical origin redirect', () => {
  const env = {
    VITE_PUBLIC_APP_URL: 'https://yourwifey-byok.vercel.app',
  };

  it('redirects product routes from the old VPS origin to the public app origin', () => {
    expect(
      getCanonicalProductRedirectUrl(
        'https://148-113-191-103.sslip.io/editor?tab=ai#settings',
        env,
      ),
    ).toBe('https://yourwifey-byok.vercel.app/editor?tab=ai#settings');
  });

  it('preserves OAuth callback hash tokens when canonicalizing the host', () => {
    expect(
      getCanonicalProductRedirectUrl(
        'https://148-113-191-103.sslip.io/auth/callback#access_token=abc',
        env,
      ),
    ).toBe('https://yourwifey-byok.vercel.app/auth/callback#access_token=abc');
  });

  it('does not redirect signed OBS overlay routes', () => {
    expect(
      getCanonicalProductRedirectUrl(
        'https://148-113-191-103.sslip.io/overlay/scene-id?token=abc',
        env,
      ),
    ).toBeNull();
  });

  it('does nothing on the canonical origin', () => {
    expect(
      getCanonicalProductRedirectUrl('https://yourwifey-byok.vercel.app/editor', env),
    ).toBeNull();
  });
});
