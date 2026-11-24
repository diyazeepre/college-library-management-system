import { NextResponse } from 'next/server';
import { dbUnavailableResponse, getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  try {
    await db.query('SELECT 1');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Database connection check failed.' },
      { status: 500 }
    );
  }
}
