import { NextRequest, NextResponse } from 'next/server';
import {
  dbUnavailableResponse,
  getDbPool,
  getPgErrorCode,
  sanitizeText,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ usn: string }>;
};

export async function PUT(req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { usn: rawUsn } = await context.params;
  const usn = sanitizeText(decodeURIComponent(rawUsn), 40);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const name = sanitizeText(body?.name, 120);
  const department = sanitizeText(body?.department, 80);

  if (!usn || !name) {
    return NextResponse.json(
      { error: 'Student USN and name are required.' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `
      UPDATE students
      SET name = $1, department = $2
      WHERE usn = $3
      RETURNING usn, name, COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department
      `,
      [name, department || null, usn]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('Update student error:', err);
    return NextResponse.json({ error: 'Failed to update student.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const { usn: rawUsn } = await context.params;
  const usn = sanitizeText(decodeURIComponent(rawUsn), 40);
  if (!usn) {
    return NextResponse.json({ error: 'Student USN is required.' }, { status: 400 });
  }

  try {
    const result = await db.query(`DELETE FROM students WHERE usn = $1 RETURNING usn`, [usn]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, usn });
  } catch (err) {
    if (getPgErrorCode(err) === '23503') {
      return NextResponse.json(
        {
          error:
            'This student has existing borrow transactions. Remove their circulation records before deleting.',
        },
        { status: 409 }
      );
    }
    console.error('Delete student error:', err);
    return NextResponse.json({ error: 'Failed to delete student.' }, { status: 500 });
  }
}
