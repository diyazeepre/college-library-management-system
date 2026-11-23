import type {
  BookRecord,
  BorrowTransactionRecord,
  DashboardStats,
  DepartmentSummary,
  StudentRecord,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export interface DashboardResponse {
  stats: DashboardStats;
  departments: DepartmentSummary[];
  recentTransactions: BorrowTransactionRecord[];
}

export interface StudentsResponse {
  students: StudentRecord[];
  departments: string[];
}

export interface StudentHistoryResponse {
  student: {
    usn: string;
    name: string;
    department: string;
  };
  history: BorrowTransactionRecord[];
}

export interface BooksResponse {
  books: BookRecord[];
}

export interface TransactionsResponse {
  transactions: BorrowTransactionRecord[];
}

export const libraryApi = {
  getDashboard(): Promise<DashboardResponse> {
    return request<DashboardResponse>('/api/dashboard');
  },

  getStudents(params?: { q?: string; department?: string }): Promise<StudentsResponse> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.department && params.department !== 'all') {
      qs.set('department', params.department);
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<StudentsResponse>(`/api/students${suffix}`);
  },

  getStudentHistory(usn: string): Promise<StudentHistoryResponse> {
    return request<StudentHistoryResponse>(`/api/students/${encodeURIComponent(usn)}/history`);
  },

  createStudent(data: { usn: string; name: string; department: string }): Promise<StudentRecord> {
    return request<StudentRecord>('/api/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateStudent(usn: string, data: { name: string; department: string }): Promise<StudentRecord> {
    return request<StudentRecord>(`/api/students/${encodeURIComponent(usn)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteStudent(usn: string): Promise<{ deleted: boolean; usn: string }> {
    return request<{ deleted: boolean; usn: string }>(
      `/api/students/${encodeURIComponent(usn)}`,
      { method: 'DELETE' }
    );
  },

  getBooks(q?: string): Promise<BooksResponse> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request<BooksResponse>(`/api/books${qs}`);
  },

  createBook(data: {
    book_id?: number | string;
    book_name: string;
    author: string;
  }): Promise<BookRecord> {
    return request<BookRecord>('/api/books', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateBook(bookId: number, data: { book_name: string; author: string }): Promise<BookRecord> {
    return request<BookRecord>(`/api/books/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteBook(bookId: number): Promise<{ deleted: boolean; book_id: number }> {
    return request<{ deleted: boolean; book_id: number }>(`/api/books/${bookId}`, {
      method: 'DELETE',
    });
  },

  getTransactions(params?: {
    q?: string;
    status?: 'all' | 'borrowed' | 'returned';
  }): Promise<TransactionsResponse> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<TransactionsResponse>(`/api/transactions${suffix}`);
  },

  issueBook(data: { usn: string; book_id: number }): Promise<BorrowTransactionRecord> {
    return request<BorrowTransactionRecord>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  setTransactionStatus(
    transactionId: number,
    return_status: boolean
  ): Promise<BorrowTransactionRecord> {
    return request<BorrowTransactionRecord>(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ return_status }),
    });
  },

  deleteTransaction(transactionId: number): Promise<{ deleted: boolean; transaction_id: number }> {
    return request<{ deleted: boolean; transaction_id: number }>(
      `/api/transactions/${transactionId}`,
      { method: 'DELETE' }
    );
  },
};
