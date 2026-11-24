import { NextRequest, NextResponse } from 'next/server';
import {
  dbUnavailableResponse,
  getDbPool,
  getPgErrorCode,
  parsePositiveInt,
  sanitizeText,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ bookId: string }>;
};

export async function PUT(req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { bookId: rawBookId } = await context.params;
  const bookId = parsePositiveInt(rawBookId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const bookName = sanitizeText(body?.book_name, 200);
  const author = sanitizeText(body?.author, 150);

  if (!bookId || !bookName) {
    return NextResponse.json(
      { error: 'Valid Book ID and book title are required.' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `
      UPDATE book
      SET book_name = $1, author = $2
      WHERE book_id = $3
      RETURNING book_id, book_name, COALESCE(NULLIF(TRIM(author), ''), 'Unknown Author') AS author
      `,
      [bookName, author || null, bookId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Book not found.' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('Update book error:', err);
    return NextResponse.json({ error: 'Failed to update book.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { bookId: rawBookId } = await context.params;
  const bookId = parsePositiveInt(rawBookId);
  if (!bookId) {
    return NextResponse.json({ error: 'Valid Book ID is required.' }, { status: 400 });
  }

  try {
    const result = await db.query(`DELETE FROM book WHERE book_id = $1 RETURNING book_id`, [
      bookId,
    ]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Book not found.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, book_id: bookId });
  } catch (err) {
    if (getPgErrorCode(err) === '23503') {
      return NextResponse.json(
        {
          error:
            'This book is referenced in borrow transactions. Remove associated circulation records before deleting.',
        },
        { status: 409 }
      );
    }
    console.error('Delete book error:', err);
    return NextResponse.json({ error: 'Failed to delete book.' }, { status: 500 });
  }
}
