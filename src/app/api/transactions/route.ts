import { NextRequest, NextResponse } from 'next/server';
import {
  dbUnavailableResponse,
  getDbPool,
  parsePositiveInt,
  sanitizeText,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const q = sanitizeText(req.nextUrl.searchParams.get('q'), 120);
  const status = sanitizeText(req.nextUrl.searchParams.get('status'), 20).toLowerCase();

  try {
    const conditions: string[] = [];
    const params: Array<string | boolean> = [];

    if (status === 'borrowed') {
      params.push(false);
      conditions.push(`bt.return_status = $${params.length}`);
    } else if (status === 'returned') {
      params.push(true);
      conditions.push(`bt.return_status = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(`(
        CAST(bt.transaction_id AS TEXT) ILIKE $${idx}
        OR bt.usn ILIKE $${idx}
        OR s.name ILIKE $${idx}
        OR COALESCE(s.department, '') ILIKE $${idx}
        OR CAST(bt.book_id AS TEXT) ILIKE $${idx}
        OR b.book_name ILIKE $${idx}
        OR COALESCE(b.author, '') ILIKE $${idx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `
      SELECT
        bt.transaction_id,
        bt.usn,
        s.name AS student_name,
        COALESCE(NULLIF(TRIM(s.department), ''), 'Unassigned') AS department,
        bt.book_id,
        b.book_name,
        COALESCE(NULLIF(TRIM(b.author), ''), 'Unknown Author') AS author,
        bt.borrow_date,
        bt.return_status
      FROM borrow_transaction bt
      INNER JOIN students s ON bt.usn = s.usn
      INNER JOIN book b ON bt.book_id = b.book_id
      ${whereClause}
      ORDER BY bt.borrow_date DESC, bt.transaction_id DESC
      `,
      params
    );

    return NextResponse.json({ transactions: result.rows });
  } catch (err) {
    console.error('List transactions error:', err);
    return NextResponse.json(
      { error: 'Failed to load borrowing history.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const usn = sanitizeText(body?.usn, 40);
  const bookId = parsePositiveInt(body?.book_id);

  if (!usn || !bookId) {
    return NextResponse.json(
      { error: 'Valid student USN and book ID are required.' },
      { status: 400 }
    );
  }

  const client = await db.connect();
  try {
    const studentCheck = await client.query(`SELECT usn FROM students WHERE usn = $1`, [usn]);
    if (studentCheck.rows.length === 0) {
      return NextResponse.json({ error: `Student "${usn}" was not found.` }, { status: 404 });
    }

    const bookCheck = await client.query(`SELECT book_id FROM book WHERE book_id = $1`, [bookId]);
    if (bookCheck.rows.length === 0) {
      return NextResponse.json({ error: `Book #${bookId} was not found.` }, { status: 404 });
    }

    const insertRes = await client.query(
      `
      INSERT INTO borrow_transaction (usn, book_id, borrow_date, return_status)
      VALUES ($1, $2, CURRENT_TIMESTAMP, false)
      RETURNING transaction_id
      `,
      [usn, bookId]
    );
    const newId = Number(insertRes.rows[0].transaction_id);

    const joinedRes = await client.query(
      `
      SELECT
        bt.transaction_id,
        bt.usn,
        s.name AS student_name,
        COALESCE(NULLIF(TRIM(s.department), ''), 'Unassigned') AS department,
        bt.book_id,
        b.book_name,
        COALESCE(NULLIF(TRIM(b.author), ''), 'Unknown Author') AS author,
        bt.borrow_date,
        bt.return_status
      FROM borrow_transaction bt
      INNER JOIN students s ON bt.usn = s.usn
      INNER JOIN book b ON bt.book_id = b.book_id
      WHERE bt.transaction_id = $1
      `,
      [newId]
    );

    return NextResponse.json(joinedRes.rows[0], { status: 201 });
  } catch (err) {
    console.error('Create borrow transaction error:', err);
    return NextResponse.json({ error: 'Failed to issue book.' }, { status: 500 });
  } finally {
    client.release();
  }
}
