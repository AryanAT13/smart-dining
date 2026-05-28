/**
 * Single source of truth for runtime configuration.
 *
 * Every environment variable consumed anywhere in the system MUST be declared
 * here, validated by Zod, and accessed through the exported `env` object.
 * This kills three classes of bug: undefined-at-runtime crashes, wrong-shape
 * config (e.g. number stored as string), and silently divergent envs between
 * the web app and the gateway.
 *
 * Validation runs once at module load. A failure produces a structured error
 * listing every missing or invalid variable — never just "OPENAI_API_KEY is
 * undefined" buried five frames deep.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .default('false');

const optionalBooleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

const positiveInt = z.coerce.number().int().positive();
const nonNegativeNumber = z.coerce.number().nonnegative();

const url = z.string().url();

const EnvSchema = z
  .object({
    // ----- Runtime -----
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    NEXT_PUBLIC_DEMO_MODE: optionalBooleanString,

    // ----- URLs -----
    NEXT_PUBLIC_APP_URL: url,
    NEXT_PUBLIC_GATEWAY_URL: url,
    GATEWAY_PORT: positiveInt.default(4000),
    GATEWAY_CORS_ORIGIN: z.string().min(1),

    // ----- Database -----
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: z.string().min(1),

    // ----- Cache + Pub/Sub -----
    REDIS_URL: z.string().min(1),

    // ----- OpenAI -----
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    LLM_MODEL_FAST: z.string().default('gpt-4o-mini'),
    LLM_MODEL_DEEP: z.string().default('gpt-4o'),
    SESSION_LLM_BUDGET_USD: nonNegativeNumber.default(1.5),

    // ----- LangSmith -----
    LANGCHAIN_TRACING_V2: booleanString,
    LANGCHAIN_API_KEY: z.string().optional(),
    LANGCHAIN_PROJECT: z.string().default('smart-dining-dev'),

    // ----- OTP -----
    OTP_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

    // ----- Object storage -----
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().default('smart-dining-menu'),
    R2_PUBLIC_URL: z.string().min(1),

    // ----- Crypto -----
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
    PII_HASH_SECRET: z.string().min(16, 'PII_HASH_SECRET must be at least 16 chars'),

    // ----- Rate limiting -----
    RATE_LIMIT_GLOBAL_PER_MIN: positiveInt.default(60),
    RATE_LIMIT_AI_PER_MIN: positiveInt.default(20),

    // ----- Branding -----
    RESTAURANT_NAME: z.string().default('Zaika'),
    ASSISTANT_NAME: z.string().default('Zara'),
    RESTAURANT_TIMEZONE: z.string().default('Asia/Kolkata'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.OTP_PROVIDER === 'twilio') {
      if (!cfg.TWILIO_ACCOUNT_SID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TWILIO_ACCOUNT_SID'],
          message: 'Required when OTP_PROVIDER=twilio',
        });
      }
      if (!cfg.TWILIO_AUTH_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TWILIO_AUTH_TOKEN'],
          message: 'Required when OTP_PROVIDER=twilio',
        });
      }
      if (!cfg.TWILIO_VERIFY_SERVICE_SID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TWILIO_VERIFY_SERVICE_SID'],
          message: 'Required when OTP_PROVIDER=twilio',
        });
      }
    }

    if (cfg.LANGCHAIN_TRACING_V2 && !cfg.LANGCHAIN_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LANGCHAIN_API_KEY'],
        message: 'Required when LANGCHAIN_TRACING_V2=true',
      });
    }

    if (cfg.NODE_ENV === 'production' && cfg.NEXT_PUBLIC_DEMO_MODE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['NEXT_PUBLIC_DEMO_MODE'],
        message: 'NEXT_PUBLIC_DEMO_MODE must be false in production (exposes /debug/trace).',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

// ---------------------------------------------------------------------------
// Load and validate
// ---------------------------------------------------------------------------

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    // eslint-disable-next-line no-console
    console.error(
      `\n[env] Invalid or missing environment variables:\n${issues}\n\n` +
        `See .env.example for the full contract.\n`,
    );
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
}

export const env: Env = loadEnv();

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isDemoMode = env.NEXT_PUBLIC_DEMO_MODE === true;
