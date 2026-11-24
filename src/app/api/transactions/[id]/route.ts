import { NextRequest, NextResponse } from 'next/server';
import { dbUnavailableResponse, getDbPool, parsePositiveInt } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { id: rawId } = await context.params;
  const transactionId = parsePositiveInt(rawId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const returnStatus = body?.return_status;

  if (!transactionId || typeof returnStatus !== 'boolean') {
    return NextResponse.json(
      { error: 'Valid transaction ID and boolean return_status are required.' },
      { status: 400 }
    );
  }

  try {
    const updateRes = await db.query(
      `
      UPDATE borrow_transaction
      SET return_status = $1
      WHERE transaction_id = $2
      RETURNING transaction_id
      `,
      [returnStatus, transactionId]
    );

    if (updateRes.rows.length === 0) {
      return NextResponse.json({ error: 'Borrow transaction not found.' }, { status: 404 });
    }

    const joinedRes = await db.query(
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
      [transactionId]
    );

    return NextResponse.json(joinedRes.rows[0]);
  } catch (err) {
    console.error('Update transaction error:', err);
    return NextResponse.json({ error: 'Failed to update return status.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { id: rawId } = await context.params;
  const transactionId = parsePositiveInt(rawId);
  if (!transactionId) {
    return NextResponse.json({ error: 'Valid transaction ID is required.' }, { status: 400 });
  }

  try {
    const result = await db.query(
      `DELETE FROM borrow_transaction WHERE transaction_id = $1 RETURNING transaction_id`,
      [transactionId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Borrow transaction not found.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, transaction_id: transactionId });
  } catch (err) {
    console.error('Delete transaction error:', err);
    return NextResponse.json({ error: 'Failed to delete transaction.' }, { status: 500 });
  }
}
