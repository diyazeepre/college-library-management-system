export type NavSection = 'overview' | 'circulation' | 'books' | 'students';

export interface DashboardStats {
  total_students: number;
  total_books: number;
  borrowed_books: number;
  returned_books: number;
  total_transactions: number;
}

export interface DepartmentSummary {
  department: string;
  student_count: number;
  active_borrows: number;
  returned_borrows: number;
}

export interface BorrowTransactionRecord {
  transaction_id: number;
  usn: string;
  student_name: string;
  department: string;
  book_id: number;
  book_name: string;
  author: string;
  borrow_date: string;
  return_status: boolean;
}

export interface StudentRecord {
  usn: string;
  name: string;
  department: string;
  active_borrows: number;
  returned_borrows: number;
  total_borrows: number;
}

export interface BookRecord {
  book_id: number;
  book_name: string;
  author: string;
  active_borrows: number;
  returned_borrows: number;
  total_borrows: number;
}
