import { NextRequest, NextResponse } from 'next/server';
import { dbUnavailableResponse, getDbPool, sanitizeText } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ usn: string }>;
};

export async function GET(_req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { usn: rawUsn } = await context.params;
  const usn = sanitizeText(decodeURIComponent(rawUsn), 40);
  if (!usn) {
    return NextResponse.json({ error: 'Student USN is required.' }, { status: 400 });
  }

  try {
    const studentRes = await db.query(
      `SELECT usn, name, COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department FROM students WHERE usn = $1`,
      [usn]
    );
    if (studentRes.rows.length === 0) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const historyRes = await db.query(
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
      WHERE bt.usn = $1
      ORDER BY bt.borrow_date DESC, bt.transaction_id DESC
      `,
      [usn]
    );

    return NextResponse.json({
      student: studentRes.rows[0],
      history: historyRes.rows,
    });
  } catch (err) {
    console.error('Student history error:', err);
    return NextResponse.json(
      { error: 'Failed to load student borrowing history.' },
      { status: 500 }
    );
  }
}
