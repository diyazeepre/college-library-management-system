import { NextRequest, NextResponse } from 'next/server';
import {
  dbUnavailableResponse,
  getDbPool,
  getPgErrorCode,
  sanitizeText,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = getDbPool();
  if (!db) return dbUnavailableResponse();

  const q = sanitizeText(req.nextUrl.searchParams.get('q'), 100);
  const department = sanitizeText(req.nextUrl.searchParams.get('department'), 80);

  try {
    const conditions: string[] = [];
    const params: string[] = [];

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(
        `(s.usn ILIKE $${idx} OR s.name ILIKE $${idx} OR COALESCE(s.department, '') ILIKE $${idx})`
      );
    }

    if (department && department.toLowerCase() !== 'all') {
      if (department === 'Unassigned') {
        conditions.push(`NULLIF(TRIM(s.department), '') IS NULL`);
      } else {
        params.push(department);
        conditions.push(`s.department = $${params.length}`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `
      SELECT
        s.usn,
        s.name,
        COALESCE(NULLIF(TRIM(s.department), ''), 'Unassigned') AS department,
        COUNT(bt.transaction_id) FILTER (WHERE bt.return_status = false)::int AS active_borrows,
        COUNT(bt.transaction_id) FILTER (WHERE bt.return_status = true)::int AS returned_borrows,
        COUNT(bt.transaction_id)::int AS total_borrows
      FROM students s
      LEFT JOIN borrow_transaction bt ON s.usn = bt.usn
      ${whereClause}
      GROUP BY s.usn, s.name, s.department
      ORDER BY s.usn ASC
      `,
      params
    );

    const deptList = await db.query(`
      SELECT DISTINCT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department
      FROM students
      ORDER BY department ASC
    `);

    return NextResponse.json({
      students: result.rows,
      departments: deptList.rows.map((r: { department: string }) => r.department),
    });
  } catch (err) {
    console.error('List students error:', err);
    return NextResponse.json({ error: 'Failed to load students.' }, { status: 500 });
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

  const usn = sanitizeText(body?.usn, 40).toUpperCase();
  const name = sanitizeText(body?.name, 120);
  const department = sanitizeText(body?.department, 80);

  if (!usn || !name) {
    return NextResponse.json(
      { error: 'Student USN and full name are required.' },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `
      INSERT INTO students (usn, name, department)
      VALUES ($1, $2, $3)
      RETURNING usn, name, COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department
      `,
      [usn, name, department || null]
    );
    return NextResponse.json(
      {
        ...result.rows[0],
        active_borrows: 0,
        returned_borrows: 0,
        total_borrows: 0,
      },
      { status: 201 }
    );
  } catch (err) {
    if (getPgErrorCode(err) === '23505') {
      return NextResponse.json(
        { error: `A student with USN "${usn}" already exists.` },
        { status: 409 }
      );
    }
    console.error('Create student error:', err);
    return NextResponse.json({ error: 'Failed to add student.' }, { status: 500 });
  }
}
