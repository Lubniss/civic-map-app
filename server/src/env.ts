import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be your https://<ref>.supabase.co address'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is missing'),
  PORT: z.coerce.number().int().positive().default(4000),
  ORS_API_KEY: z.string().optional(), // phase 4
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Server settings are missing or wrong (check server/.env):');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
