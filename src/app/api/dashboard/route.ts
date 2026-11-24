import { NextResponse } from 'next/server';
import { dbUnavailableResponse, getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  try {
    const [statsResult, deptResult, recentResult] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM students) AS total_students,
          (SELECT COUNT(*)::int FROM book) AS total_books,
          (SELECT COUNT(*)::int FROM borrow_transaction WHERE return_status = false) AS borrowed_books,
          (SELECT COUNT(*)::int FROM borrow_transaction WHERE return_status = true) AS returned_books,
          (SELECT COUNT(*)::int FROM borrow_transaction) AS total_transactions
      `),
      db.query(`
        SELECT
          COALESCE(NULLIF(TRIM(s.department), ''), 'Unassigned') AS department,
          COUNT(DISTINCT s.usn)::int AS student_count,
          COUNT(bt.transaction_id) FILTER (WHERE bt.return_status = false)::int AS active_borrows,
          COUNT(bt.transaction_id) FILTER (WHERE bt.return_status = true)::int AS returned_borrows
        FROM students s
        LEFT JOIN borrow_transaction bt ON s.usn = bt.usn
        GROUP BY COALESCE(NULLIF(TRIM(s.department), ''), 'Unassigned')
        ORDER BY student_count DESC, department ASC
      `),
      db.query(`
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
        ORDER BY bt.borrow_date DESC, bt.transaction_id DESC
        LIMIT 8
      `),
    ]);

    return NextResponse.json({
      stats: statsResult.rows[0],
      departments: deptResult.rows,
      recentTransactions: recentResult.rows,
    });
  } catch (err) {
    console.error('Dashboard query error:', err);
    return NextResponse.json(
      { error: 'Failed to load dashboard summary.' },
      { status: 500 }
    );
  }
}
