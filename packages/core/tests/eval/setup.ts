/**
 * Eval setup — loads .env, ensures NODE_ENV=production-safe defaults so
 * agent singletons don't trip the demo-mode guard.
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../../..', '.env') });

// Don't let the eval flip demo mode on or off — respect whatever the env says.
// We DO set NODE_ENV explicitly to keep the env schema happy.
if (!process.env['NODE_ENV']) process.env['NODE_ENV'] = 'development';
