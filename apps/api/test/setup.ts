import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.DATABASE_URL) {
  for (const envPath of [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve('d:/Project-17/ULE/.env'),
  ]) {
    if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile(envPath);
        if (process.env.DATABASE_URL) break;
      } catch {
        // ignore
      }
    }
  }
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres@localhost:5432/ule_dev?schema=public';
}
if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = 'ci-test-better-auth-secret-key-32-chars-long!';
}
if (!process.env.BETTER_AUTH_URL) {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
}
