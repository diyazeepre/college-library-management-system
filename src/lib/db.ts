import 'dotenv/config';
import { NextResponse } from 'next/server';
import pg from 'pg';

const { Pool } = pg;

declare global {
  var __libraryPgPool: pg.Pool | undefined;
}

function createPoolFromEnv(): pg.Pool | null {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) {
    return null;
  }

  const parsed = new URL(rawUrl);
  const sslMode = parsed.searchParams.get('sslmode');
  const useSsl =
    sslMode === 'require' ||
    sslMode === 'verify-ca' ||
    sslMode === 'verify-full' ||
    parsed.hostname.includes('aivencloud.com');

  return new Pool({
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, '') || 'defaultdb',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

export function getDbPool(): pg.Pool | null {
  if (!globalThis.__libraryPgPool) {
    const created = createPoolFromEnv();
    if (created) {
      globalThis.__libraryPgPool = created;
    }
  }
  return globalThis.__libraryPgPool ?? null;
}

export function dbUnavailableResponse() {
  return NextResponse.json(
    {
      error: 'Database is not configured. Set DATABASE_URL in server environment.',
    },
    { status: 503 }
  );
}

export function getPgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}
