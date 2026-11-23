import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPoolFromEnv(): pg.Pool | null {
  const rawUrl = process.env.DATABASE_URL?.trim();
  if (!rawUrl) {
    return null;
  }

  const parsed = new URL(rawUrl);
  const sslMode = parsed.searchParams.get('sslmode');
  const useSsl =
    sslMode === 'require' ||
    sslMode === 'verify-ca' ||
    sslMode === 'verify-full' ||
    parsed.hostname.includes('aivencloud.com');

  return new Pool({
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, '') || 'defaultdb',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

const pool = createPoolFromEnv();

function getPool(res: Response): pg.Pool | null {
  if (!pool) {
    res.status(503).json({
      error: 'Database is not configured. Set DATABASE_URL in server environment.',
    });
    return null;
  }
  return pool;
}

function getPgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// Health check
app.get('/api/health', async (_req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'Database connection check failed.' });
  }
});

// Dashboard aggregates, department circulation breakdown, and recent joined activity
app.get('/api/dashboard', async (_req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

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

    res.json({
      stats: statsResult.rows[0],
      departments: deptResult.rows,
      recentTransactions: recentResult.rows,
    });
  } catch (err) {
    console.error('Dashboard query error:', err);
    res.status(500).json({ error: 'Failed to load dashboard summary.' });
  }
});

// List students with live borrow counts via LEFT JOIN
app.get('/api/students', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const q = sanitizeText(req.query.q, 100);
  const department = sanitizeText(req.query.department, 80);

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

    res.json({
      students: result.rows,
      departments: deptList.rows.map((r: { department: string }) => r.department),
    });
  } catch (err) {
    console.error('List students error:', err);
    res.status(500).json({ error: 'Failed to load students.' });
  }
});

// Get single student's borrowing history via INNER JOIN
app.get('/api/students/:usn/history', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const usn = sanitizeText(req.params.usn, 40);
  if (!usn) {
    res.status(400).json({ error: 'Student USN is required.' });
    return;
  }

  try {
    const studentRes = await db.query(
      `SELECT usn, name, COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department FROM students WHERE usn = $1`,
      [usn]
    );
    if (studentRes.rows.length === 0) {
      res.status(404).json({ error: 'Student not found.' });
      return;
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

    res.json({
      student: studentRes.rows[0],
      history: historyRes.rows,
    });
  } catch (err) {
    console.error('Student history error:', err);
    res.status(500).json({ error: 'Failed to load student borrowing history.' });
  }
});

// Create student
app.post('/api/students', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const usn = sanitizeText(req.body?.usn, 40).toUpperCase();
  const name = sanitizeText(req.body?.name, 120);
  const department = sanitizeText(req.body?.department, 80);

  if (!usn || !name) {
    res.status(400).json({ error: 'Student USN and full name are required.' });
    return;
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
    res.status(201).json({
      ...result.rows[0],
      active_borrows: 0,
      returned_borrows: 0,
      total_borrows: 0,
    });
  } catch (err) {
    if (getPgErrorCode(err) === '23505') {
      res.status(409).json({ error: `A student with USN "${usn}" already exists.` });
      return;
    }
    console.error('Create student error:', err);
    res.status(500).json({ error: 'Failed to add student.' });
  }
});

// Update student
app.put('/api/students/:usn', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const usn = sanitizeText(req.params.usn, 40);
  const name = sanitizeText(req.body?.name, 120);
  const department = sanitizeText(req.body?.department, 80);

  if (!usn || !name) {
    res.status(400).json({ error: 'Student USN and name are required.' });
    return;
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
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Failed to update student.' });
  }
});

// Delete student
app.delete('/api/students/:usn', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const usn = sanitizeText(req.params.usn, 40);
  if (!usn) {
    res.status(400).json({ error: 'Student USN is required.' });
    return;
  }

  try {
    const result = await db.query(`DELETE FROM students WHERE usn = $1 RETURNING usn`, [usn]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    res.json({ deleted: true, usn });
  } catch (err) {
    if (getPgErrorCode(err) === '23503') {
      res.status(409).json({
        error:
          'This student has existing borrow transactions. Remove their circulation records before deleting.',
      });
      return;
    }
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Failed to delete student.' });
  }
});

// List books with live circulation metrics via LEFT JOIN
app.get('/api/books', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const q = sanitizeText(req.query.q, 120);

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

    res.json({ books: result.rows });
  } catch (err) {
    console.error('List books error:', err);
    res.status(500).json({ error: 'Failed to load books.' });
  }
});

// Create book (auto-allocates next book_id if omitted)
app.post('/api/books', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const bookName = sanitizeText(req.body?.book_name, 200);
  const author = sanitizeText(req.body?.author, 150);
  const requestedBookId =
    req.body?.book_id !== undefined && req.body?.book_id !== ''
      ? parsePositiveInt(req.body.book_id)
      : null;

  if (!bookName) {
    res.status(400).json({ error: 'Book title is required.' });
    return;
  }

  if (req.body?.book_id !== undefined && req.body?.book_id !== '' && requestedBookId === null) {
    res.status(400).json({ error: 'Book ID must be a positive whole number.' });
    return;
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
    res.status(201).json({
      ...insertRes.rows[0],
      active_borrows: 0,
      returned_borrows: 0,
      total_borrows: 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (getPgErrorCode(err) === '23505') {
      res.status(409).json({ error: `Book ID ${requestedBookId} already exists.` });
      return;
    }
    console.error('Create book error:', err);
    res.status(500).json({ error: 'Failed to add book.' });
  } finally {
    client.release();
  }
});

// Update book
app.put('/api/books/:bookId', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const bookId = parsePositiveInt(req.params.bookId);
  const bookName = sanitizeText(req.body?.book_name, 200);
  const author = sanitizeText(req.body?.author, 150);

  if (!bookId || !bookName) {
    res.status(400).json({ error: 'Valid Book ID and book title are required.' });
    return;
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
      res.status(404).json({ error: 'Book not found.' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update book error:', err);
    res.status(500).json({ error: 'Failed to update book.' });
  }
});

// Delete book
app.delete('/api/books/:bookId', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const bookId = parsePositiveInt(req.params.bookId);
  if (!bookId) {
    res.status(400).json({ error: 'Valid Book ID is required.' });
    return;
  }

  try {
    const result = await db.query(`DELETE FROM book WHERE book_id = $1 RETURNING book_id`, [bookId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }
    res.json({ deleted: true, book_id: bookId });
  } catch (err) {
    if (getPgErrorCode(err) === '23503') {
      res.status(409).json({
        error:
          'This book is referenced in borrow transactions. Remove associated circulation records before deleting.',
      });
      return;
    }
    console.error('Delete book error:', err);
    res.status(500).json({ error: 'Failed to delete book.' });
  }
});

// List borrow transactions joined with students & books
app.get('/api/transactions', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const q = sanitizeText(req.query.q, 120);
  const status = sanitizeText(req.query.status, 20).toLowerCase();

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

    res.json({ transactions: result.rows });
  } catch (err) {
    console.error('List transactions error:', err);
    res.status(500).json({ error: 'Failed to load borrowing history.' });
  }
});

// Issue / Borrow a book
app.post('/api/transactions', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const usn = sanitizeText(req.body?.usn, 40);
  const bookId = parsePositiveInt(req.body?.book_id);

  if (!usn || !bookId) {
    res.status(400).json({ error: 'Valid student USN and book ID are required.' });
    return;
  }

  const client = await db.connect();
  try {
    const studentCheck = await client.query(`SELECT usn FROM students WHERE usn = $1`, [usn]);
    if (studentCheck.rows.length === 0) {
      res.status(404).json({ error: `Student "${usn}" was not found.` });
      return;
    }

    const bookCheck = await client.query(`SELECT book_id FROM book WHERE book_id = $1`, [bookId]);
    if (bookCheck.rows.length === 0) {
      res.status(404).json({ error: `Book #${bookId} was not found.` });
      return;
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

    res.status(201).json(joinedRes.rows[0]);
  } catch (err) {
    console.error('Create borrow transaction error:', err);
    res.status(500).json({ error: 'Failed to issue book.' });
  } finally {
    client.release();
  }
});

// Mark a transaction as returned or borrowed
app.patch('/api/transactions/:id', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const transactionId = parsePositiveInt(req.params.id);
  const returnStatus = req.body?.return_status;

  if (!transactionId || typeof returnStatus !== 'boolean') {
    res.status(400).json({ error: 'Valid transaction ID and boolean return_status are required.' });
    return;
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
      res.status(404).json({ error: 'Borrow transaction not found.' });
      return;
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

    res.json(joinedRes.rows[0]);
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ error: 'Failed to update return status.' });
  }
});

// Delete a transaction record
app.delete('/api/transactions/:id', async (req: Request, res: Response) => {
  const db = getPool(res);
  if (!db) return;

  const transactionId = parsePositiveInt(req.params.id);
  if (!transactionId) {
    res.status(400).json({ error: 'Valid transaction ID is required.' });
    return;
  }

  try {
    const result = await db.query(
      `DELETE FROM borrow_transaction WHERE transaction_id = $1 RETURNING transaction_id`,
      [transactionId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Borrow transaction not found.' });
      return;
    }
    res.json({ deleted: true, transaction_id: transactionId });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build artifacts not found.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Library server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
