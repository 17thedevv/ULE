import { defineConfig } from 'prisma/config';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
  for (const envPath of [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../../.env'),
  ]) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        break;
      } catch {
        // ignore
      }
    }
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
