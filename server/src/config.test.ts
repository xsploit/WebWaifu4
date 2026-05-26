import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('binds the local backend to loopback by default', () => {
    delete process.env.BOT_HOST;

    expect(loadConfig().botHost).toBe('127.0.0.1');
  });

  it('allows an explicit backend host override for intentional LAN development', () => {
    process.env.BOT_HOST = '0.0.0.0';

    expect(loadConfig().botHost).toBe('0.0.0.0');
  });
});
