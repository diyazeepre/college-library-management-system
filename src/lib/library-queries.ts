import 'dotenv/config';
import { getDbPool } from './db';
import type {
  BookRecord,
  BorrowTransactionRecord,
  DashboardStats,
  DepartmentSummary,
  StudentRecord,
} from '@/types';

export interface DashboardPayload {
  stats: DashboardStats;
  departments: DepartmentSummary[];
  recentTransactions: BorrowTransactionRecord[];
}

export async function queryDashboardData(): Promise<DashboardPayload> {
  const db = getDbPool();
  if (!db) {
    throw new Error('Database is not configured. Set DATABASE_URL in server environment.');
  }

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
        bt.borrow_date::text AS borrow_date,
        bt.return_status
      FROM borrow_transaction bt
      INNER JOIN students s ON bt.usn = s.usn
      INNER JOIN book b ON bt.book_id = b.book_id
      ORDER BY bt.borrow_date DESC, bt.transaction_id DESC
      LIMIT 8
    `),
  ]);

  return {
    stats: statsResult.rows[0] as DashboardStats,
    departments: deptResult.rows as DepartmentSummary[],
    recentTransactions: recentResult.rows as BorrowTransactionRecord[],
  };
}

export async function queryStudentsData(
  q = '',
  department = 'all'
): Promise<{ students: StudentRecord[]; departments: string[] }> {
  const db = getDbPool();
  if (!db) {
    throw new Error('Database is not configured. Set DATABASE_URL in server environment.');
  }

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

  const [result, deptList] = await Promise.all([
    db.query(
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
    ),
    db.query(`
      SELECT DISTINCT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department
      FROM students
      ORDER BY department ASC
    `),
  ]);

  return {
    students: result.rows as StudentRecord[],
    departments: deptList.rows.map((r: { department: string }) => r.department),
  };
}

export async function queryBooksData(q = ''): Promise<BookRecord[]> {
  const db = getDbPool();
  if (!db) {
    throw new Error('Database is not configured. Set DATABASE_URL in server environment.');
  }

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

  return result.rows as BookRecord[];
}

export async function queryTransactionsData(
  q = '',
  status = 'all'
): Promise<BorrowTransactionRecord[]> {
  const db = getDbPool();
  if (!db) {
    throw new Error('Database is not configured. Set DATABASE_URL in server environment.');
  }

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
      bt.borrow_date::text AS borrow_date,
      bt.return_status
    FROM borrow_transaction bt
    INNER JOIN students s ON bt.usn = s.usn
    INNER JOIN book b ON bt.book_id = b.book_id
    ${whereClause}
    ORDER BY bt.borrow_date DESC, bt.transaction_id DESC
    `,
    params
  );

  return result.rows as BorrowTransactionRecord[];
}
