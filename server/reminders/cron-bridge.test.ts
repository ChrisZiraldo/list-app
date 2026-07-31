import { describe, expect, it, vi } from 'vitest';
import { HermesCronBridge } from './cron-bridge.js';

describe('HermesCronBridge', () => {
  it('lists enabled and paused jobs from Hermes cron without using a shell', async () => {
    const execute = vi.fn().mockResolvedValue({
      stdout: [
        '  job-morning [active]',
        '    Name:      Morning brief',
        '    Schedule:  0 8 * * *',
        '    Deliver:   discord:123',
        '  job-plants [paused]',
        '    Name:      Water plants',
        '    Schedule:  every 2w',
        '    Deliver:   telegram:456',
      ].join('\n'),
    });
    const bridge = new HermesCronBridge({ execute });

    await expect(bridge.list()).resolves.toEqual([
      { id: 'job-morning', name: 'Morning brief', schedule: '0 8 * * *', enabled: true, deliver: 'discord:123' },
      { id: 'job-plants', name: 'Water plants', schedule: 'every 2w', enabled: false, deliver: 'telegram:456' },
    ]);
    expect(execute).toHaveBeenCalledWith('hermes', ['cron', 'list', '--all']);
  });

  it('creates and controls a job using argument arrays', async () => {
    const execute = vi.fn().mockResolvedValue({ stdout: 'Created job reminder-1' });
    const bridge = new HermesCronBridge({ execute });

    await bridge.create({ name: 'Take bins out', schedule: '2026-08-01T09:00:00', prompt: 'Take bins out', deliver: 'discord:123' });
    await bridge.pause('reminder-1');
    await bridge.resume('reminder-1');
    await bridge.update('reminder-1', { name: 'Bins tomorrow', schedule: '0 9 * * 6', prompt: 'Take bins out', deliver: 'discord:123' });
    await bridge.remove('reminder-1');

    expect(execute.mock.calls).toEqual([
      ['hermes', ['cron', 'create', '2026-08-01T09:00:00', 'Take bins out', '--name', 'Take bins out', '--deliver', 'discord:123']],
      ['hermes', ['cron', 'pause', 'reminder-1']],
      ['hermes', ['cron', 'resume', 'reminder-1']],
      ['hermes', ['cron', 'edit', 'reminder-1', '--schedule', '0 9 * * 6', '--prompt', 'Take bins out', '--name', 'Bins tomorrow', '--deliver', 'discord:123']],
      ['hermes', ['cron', 'remove', 'reminder-1']],
    ]);
  });
});
