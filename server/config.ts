import { z } from 'zod';

const serverConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LISTS_DATABASE_PATH: z.string().min(1).default('lists.sqlite3'),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function loadServerConfig(environment: Record<string, string | undefined> = process.env): ServerConfig {
  const result = serverConfigSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new Error(`invalid environment configuration: ${issues}`);
  }
  return result.data;
}
