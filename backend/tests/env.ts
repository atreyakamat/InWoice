// Runs before any module import in each test file: point Prisma at the test database.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set (see backend/.env.example). Refusing to run tests against the main database.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = '';
process.env.OLLAMA_URL = '';
