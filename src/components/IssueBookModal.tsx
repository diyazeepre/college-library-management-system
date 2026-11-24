'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, Users, X } from 'lucide-react';
import { libraryApi } from '../api';
import type { BookRecord, BorrowTransactionRecord, StudentRecord } from '../types';

interface IssueBookModalProps {
  open: boolean;
  onClose: () => void;
  onIssued: (tx: BorrowTransactionRecord) => void;
  preselectedUsn?: string;
  preselectedBookId?: number;
}

export function IssueBookModal({
  open,
  onClose,
  onIssued,
  preselectedUsn,
  preselectedBookId,
}: IssueBookModalProps) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [selectedUsn, setSelectedUsn] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [studentQuery, setStudentQuery] = useState('');
  const [bookQuery, setBookQuery] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStudentQuery('');
    setBookQuery('');
    setSelectedUsn(preselectedUsn ?? '');
    setSelectedBookId(preselectedBookId ? String(preselectedBookId) : '');
    setLoadingOptions(true);

    Promise.all([libraryApi.getStudents(), libraryApi.getBooks()])
      .then(([sRes, bRes]) => {
        if (cancelled) return;
        setStudents(sRes.students);
        setBooks(bRes.books);
        if (!preselectedUsn && sRes.students.length > 0) {
          setSelectedUsn((prev) => prev || sRes.students[0].usn);
        }
        if (!preselectedBookId && bRes.books.length > 0) {
          setSelectedBookId((prev) => prev || String(bRes.books[0].book_id));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load students and books.');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, preselectedUsn, preselectedBookId]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.usn.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
    );
  }, [students, studentQuery]);

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        String(b.book_id).includes(q) ||
        b.book_name.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
    );
  }, [books, bookQuery]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUsn || !selectedBookId) {
      setError('Please select both a student and a book.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const tx = await libraryApi.issueBook({
        usn: selectedUsn,
        book_id: Number(selectedBookId),
      });
      onIssued(tx);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to issue book.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-book-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="issue-book-title" className="text-base font-semibold text-slate-900">
              Issue Book to Student
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Creates a live borrow transaction in PostgreSQL
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {loadingOptions ? (
            <div className="space-y-4">
              <div className="h-20 rounded-lg bg-slate-100 animate-pulse" />
              <div className="h-20 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="issue-student-select"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-800"
                >
                  <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Select Student</span>
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Filter students by USN, name, or department..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
                <select
                  id="issue-student-select"
                  value={selectedUsn}
                  onChange={(e) => setSelectedUsn(e.target.value)}
                  required
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  {filteredStudents.length === 0 ? (
                    <option value="">No matching students found</option>
                  ) : (
                    filteredStudents.map((s) => (
                      <option key={s.usn} value={s.usn}>
                        {s.usn} — {s.name} ({s.department})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="issue-book-select"
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-800"
                >
                  <BookOpen className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>Select Book</span>
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={bookQuery}
                    onChange={(e) => setBookQuery(e.target.value)}
                    placeholder="Filter books by ID, title, or author..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
                <select
                  id="issue-book-select"
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                  required
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                >
                  {filteredBooks.length === 0 ? (
                    <option value="">No matching books found</option>
                  ) : (
                    filteredBooks.map((b) => (
                      <option key={b.book_id} value={String(b.book_id)}>
                        #{b.book_id} — {b.book_name} ({b.author})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingOptions || !selectedUsn || !selectedBookId}
              className="px-5 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap transition-colors duration-150"
            >
              {submitting ? 'Issuing...' : 'Confirm Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
