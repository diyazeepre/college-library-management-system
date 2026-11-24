import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoints: [
      'GET /api/health',
      'GET /api/dashboard',
      'GET /api/students',
      'POST /api/students',
      'PUT /api/students/:usn',
      'DELETE /api/students/:usn',
      'GET /api/students/:usn/history',
      'GET /api/books',
      'POST /api/books',
      'PUT /api/books/:bookId',
      'DELETE /api/books/:bookId',
      'GET /api/transactions',
      'POST /api/transactions',
      'PATCH /api/transactions/:id',
      'DELETE /api/transactions/:id',
    ],
  });
}
