import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './config.js';

describe('loadServerConfig', () => {
  it('applies defaults when no environment variables are set', () => {
    expect(loadServerConfig({})).toEqual({ PORT: 3000, LISTS_DATABASE_PATH: 'lists.sqlite3' });
  });

  it('coerces and validates a configured port and database path', () => {
    expect(loadServerConfig({ PORT: '3457', LISTS_DATABASE_PATH: '/var/lib/lists/lists.sqlite3' })).toEqual({
      PORT: 3457,
      LISTS_DATABASE_PATH: '/var/lib/lists/lists.sqlite3',
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadServerConfig({ PORT: 'not-a-number' })).toThrow('invalid environment configuration');
    expect(() => loadServerConfig({ PORT: '-1' })).toThrow('invalid environment configuration');
  });
});
