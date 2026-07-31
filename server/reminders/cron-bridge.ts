import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(nodeExecFile);

export type ReminderJob = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  deliver: string;
};

export type ReminderJobInput = {
  name: string;
  schedule: string;
  prompt: string;
  deliver: string;
};

type Execute = (command: string, arguments_: string[]) => Promise<{ stdout: string }>;

type CronBridgeOptions = {
  execute?: Execute;
};

function parseJobs(stdout: string): ReminderJob[] {
  const jobs: ReminderJob[] = [];
  let current: Partial<ReminderJob> | undefined;

  for (const line of stdout.split('\n')) {
    const header = line.match(/^\s+([\w-]+) \[(active|paused)\]$/);
    if (header) {
      if (current?.id && current.name && current.schedule && current.deliver) jobs.push(current as ReminderJob);
      current = { id: header[1], enabled: header[2] === 'active' };
      continue;
    }
    const field = line.match(/^\s+(Name|Schedule|Deliver):\s+(.+)$/);
    if (!field || !current) continue;
    if (field[1] === 'Name') current.name = field[2].trim();
    if (field[1] === 'Schedule') current.schedule = field[2].trim();
    if (field[1] === 'Deliver') current.deliver = field[2].trim();
  }
  if (current?.id && current.name && current.schedule && current.deliver) jobs.push(current as ReminderJob);
  return jobs;
}

export class HermesCronBridge {
  private readonly execute: Execute;

  constructor({ execute = (command, arguments_) => execFile(command, arguments_) }: CronBridgeOptions = {}) {
    this.execute = execute;
  }

  async list(): Promise<ReminderJob[]> {
    const { stdout } = await this.execute('hermes', ['cron', 'list', '--all']);
    return parseJobs(stdout);
  }

  async create(input: ReminderJobInput): Promise<void> {
    await this.execute('hermes', ['cron', 'create', input.schedule, input.prompt, '--name', input.name, '--deliver', input.deliver]);
  }

  async pause(jobId: string): Promise<void> {
    await this.execute('hermes', ['cron', 'pause', jobId]);
  }

  async resume(jobId: string): Promise<void> {
    await this.execute('hermes', ['cron', 'resume', jobId]);
  }

  async update(jobId: string, input: ReminderJobInput): Promise<void> {
    await this.execute('hermes', [
      'cron',
      'edit',
      jobId,
      '--schedule',
      input.schedule,
      '--prompt',
      input.prompt,
      '--name',
      input.name,
      '--deliver',
      input.deliver,
    ]);
  }

  async remove(jobId: string): Promise<void> {
    await this.execute('hermes', ['cron', 'remove', jobId]);
  }
}
