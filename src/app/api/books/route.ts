import { NextRequest, NextResponse } from 'next/server';
import {
  dbUnavailableResponse,
  getDbPool,
  getPgErrorCode,
  parsePositiveInt,
  sanitizeText,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const q = sanitizeText(req.nextUrl.searchParams.get('q'), 120);

  try {
    const params: string[] = [];
    let whereClause = '';
    if (q) {
      params.push(`%${q}%`);
      whereClause = `
        WHERE CAST(b.book_id AS TEXT) ILIKE $1
           OR b.book_name ILIKE $1
           OR COALESCE(b.author, '') ILIKE $1
      `;
    }

    const result = await db.query(
      `
      SELECT
        b.book_id,
        b.book_name,
        COALESCE(NULLIF(TRIM(b.author), ''), 'Unknown Author') AS author,
        COUNT(bt.transaction_id) FILTER (WHERE bt.return_status = false)::int AS active_borrows,
        COUNT(bt.transaction_id) FILTER (WHERE bt.return_status = true)::int AS returned_borrows,
        COUNT(bt.transaction_id)::int AS total_borrows
      FROM book b
      LEFT JOIN borrow_transaction bt ON b.book_id = bt.book_id
      ${whereClause}
      GROUP BY b.book_id, b.book_name, b.author
      ORDER BY b.book_id ASC
      `,
      params
    );

    return NextResponse.json({ books: result.rows });
  } catch (err) {
    console.error('List books error:', err);
    return NextResponse.json({ error: 'Failed to load books.' }, { status: 500 });
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

  const bookName = sanitizeText(body?.book_name, 200);
  const author = sanitizeText(body?.author, 150);
  const requestedBookId =
    body?.book_id !== undefined && body?.book_id !== ''
      ? parsePositiveInt(body.book_id)
      : null;

  if (!bookName) {
    return NextResponse.json({ error: 'Book title is required.' }, { status: 400 });
  }

  if (body?.book_id !== undefined && body?.book_id !== '' && requestedBookId === null) {
    return NextResponse.json(
      { error: 'Book ID must be a positive whole number.' },
      { status: 400 }
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7001)');

    let bookId = requestedBookId;
    if (bookId === null) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(book_id), 100) + 1 AS next_id FROM book`
      );
      bookId = Number(maxRes.rows[0].next_id);
    }

    const insertRes = await client.query(
      `
      INSERT INTO book (book_id, book_name, author)
      VALUES ($1, $2, $3)
      RETURNING book_id, book_name, COALESCE(NULLIF(TRIM(author), ''), 'Unknown Author') AS author
      `,
      [bookId, bookName, author || null]
    );

    await client.query('COMMIT');
    return NextResponse.json(
      {
        ...insertRes.rows[0],
        active_borrows: 0,
        returned_borrows: 0,
        total_borrows: 0,
      },
      { status: 201 }
    );
  } catch (err) {
    await client.query('ROLLBACK');
    if (getPgErrorCode(err) === '23505') {
      return NextResponse.json(
        { error: `Book ID ${requestedBookId} already exists.` },
        { status: 409 }
      );
    }
    console.error('Create book error:', err);
    return NextResponse.json({ error: 'Failed to add book.' }, { status: 500 });
  } finally {
    client.release();
  }
}
