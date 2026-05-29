/**
 * Test setup — populate env so the Zod schema validates at module load.
 * We DON'T touch the real DB/Redis from unit tests; these are placeholders.
 */

process.env['NODE_ENV'] = 'test';
process.env['NEXT_PUBLIC_APP_URL'] = 'http://localhost:3000';
process.env['NEXT_PUBLIC_GATEWAY_URL'] = 'http://localhost:4000';
process.env['GATEWAY_CORS_ORIGIN'] = 'http://localhost:3000';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['DIRECT_DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['OPENAI_API_KEY'] = 'sk-test';
process.env['R2_PUBLIC_URL'] = 'http://localhost:3000/menu-images';
process.env['JWT_SECRET'] = 'unit-test-jwt-secret-32-bytes-min!';
process.env['PII_HASH_SECRET'] = 'unit-test-pii-secret-32-bytes-min!';
process.env['NEXT_PUBLIC_DEMO_MODE'] = 'false';
