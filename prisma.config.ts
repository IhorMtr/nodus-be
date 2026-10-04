import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generation works before .env exists; database commands still require a URL.
    url: process.env['DATABASE_URL'] ?? '',
  },
});
