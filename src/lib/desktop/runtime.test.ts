import { afterEach, describe, expect, it } from 'vitest';
import {
  getDesktopBackendBaseUrl,
  getDesktopBackendUrl,
  getDesktopOverlaySocketUrl,
  isDesktopRuntime,
} from './runtime';

const originalWindow = globalThis.window;

function installWindow(search: string, bridge: Record<string, unknown> = {}) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
      webWaifuDesktop: bridge,
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('desktop runtime bridge', () => {
  it('stays inactive in plain browser mode', () => {
    installWindow('');

    expect(isDesktopRuntime()).toBe(false);
    expect(getDesktopBackendBaseUrl()).toBe('');
    expect(getDesktopBackendUrl('/ai/chat')).toBe('');
  });

  it('routes API and websocket URLs to the local desktop backend', () => {
    installWindow('?desktop=1&botPort=8797');

    expect(isDesktopRuntime()).toBe(true);
    expect(getDesktopBackendBaseUrl()).toBe('http://127.0.0.1:8797');
    expect(getDesktopBackendUrl('/ai/chat')).toBe('http://127.0.0.1:8797/ai/chat');
    expect(getDesktopOverlaySocketUrl()).toBe('ws://127.0.0.1:8797/ws');
  });
});
