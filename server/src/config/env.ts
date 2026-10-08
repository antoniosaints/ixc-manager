import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// `npm run -w server` runs with /server as its working directory. Resolve from
// this module so the project-root .env works identically in source and dist.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const schema = z.object({
  IXC_BASE_URL: z.string().url(),
  // The IXC collection declares `basic` authentication. Accept an already
  // encoded value or a conventional `usuario:senha/token` pair and normalize
  // it once at the application boundary.
  IXC_AUTH_TOKEN: z
    .string()
    .min(1)
    .transform((value) => {
      const raw = value.trim().replace(/^Basic\s+/i, "");
      const encoded = raw.includes(":") ? Buffer.from(raw, "utf8").toString("base64") : raw;
      return `Basic ${encoded}`;
    }),
  DATABASE_URL: z.string().min(1),
  DATABASE_IXC_HOST: z.string().min(1).optional(),
  DATABASE_IXC_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DATABASE_IXC_USER: z.string().min(1).optional(),
  DATABASE_IXC_PASSWORD: z.string().min(1).optional(),
  DATABASE_IXC_NAME: z.string().min(1).optional(),
  REDIS_DB: z.preprocess((value) => (value === "default" ? 0 : value), z.coerce.number().int().min(0).default(0)),
  REDIS_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .default("casanalise_"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_USERNAME: z.string().min(1).optional(),
  REDIS_PASSWORD: z.string().min(1).optional(),
  RETENTION_HISTORY_INITIAL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  RETENTION_RADIUS_INITIAL_DAYS: z.coerce.number().int().min(1).max(365).default(35),
  RETENTION_SYNC_BATCH_SIZE: z.coerce.number().int().min(50).max(1_000).default(500),
  RETENTION_SYNC_OVERLAP_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_DIST: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(
    `Configuração ausente ou inválida: ${missing}. Preencha o arquivo .env na raiz do projeto usando .env.example como referência.`
  );
}

export const env = parsed.data;
export const redisConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  db: env.REDIS_DB,
  ...(env.REDIS_USERNAME ? { username: env.REDIS_USERNAME } : {}),
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
};
