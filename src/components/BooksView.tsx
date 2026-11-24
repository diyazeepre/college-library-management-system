'use client';

import { useEffect, useState } from 'react';
import { BookPlus, Pencil, Search, Trash2, X } from 'lucide-react';
import { libraryApi } from '../api';
import type { BookRecord } from '../types';

interface BooksViewProps {
  refreshKey: number;
  initialBooks?: BookRecord[];
  onIssueBook: (bookId: number) => void;
  onDataChanged: (toastMessage?: string) => void;
}

export function BooksView({
  refreshKey,
  initialBooks,
  onIssueBook,
  onDataChanged,
}: BooksViewProps) {
  const [books, setBooks] = useState<BookRecord[]>(initialBooks ?? []);
  const [loading, setLoading] = useState(!initialBooks);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null);
  const [formBookId, setFormBookId] = useState('');
  const [formBookName, setFormBookName] = useState('');
  const [formAuthor, setFormAuthor] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<BookRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (refreshKey === 0 && !debouncedQuery && initialBooks) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    libraryApi
      .getBooks(debouncedQuery)
      .then((res) => {
        if (!cancelled) setBooks(res.books);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load books.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, refreshKey]);

  const openAddModal = () => {
    setEditingBook(null);
    setFormBookId('');
    setFormBookName('');
    setFormAuthor('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (book: BookRecord) => {
    setEditingBook(book);
    setFormBookId(String(book.book_id));
    setFormBookName(book.book_name);
    setFormAuthor(book.author === 'Unknown Author' ? '' : book.author);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBookName.trim()) {
      setFormError('Book title is required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingBook) {
        await libraryApi.updateBook(editingBook.book_id, {
          book_name: formBookName.trim(),
          author: formAuthor.trim(),
        });
        setModalOpen(false);
        onDataChanged(`Updated "${formBookName.trim()}".`);
      } else {
        const created = await libraryApi.createBook({
          book_id: formBookId.trim() ? Number(formBookId.trim()) : undefined,
          book_name: formBookName.trim(),
          author: formAuthor.trim(),
        });
        setModalOpen(false);
        onDataChanged(`Added book #${created.book_id} — ${created.book_name}.`);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save book.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await libraryApi.deleteBook(deleteTarget.book_id);
      const removedName = deleteTarget.book_name;
      setDeleteTarget(null);
      onDataChanged(`Deleted "${removedName}".`);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete book.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Book Catalog</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage library titles, authors, and live circulation counts across all books.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap"
        >
          <BookPlus className="h-4 w-4" aria-hidden="true" />
          <span>Add Book</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books by ID, title, or author..."
            aria-label="Search book catalog"
            className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-900">Catalog Inventory</span>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {books.length} {books.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-900">No books found</p>
            <p className="mt-1 text-xs text-slate-500">
              {query
                ? 'Try a different search term or clear your filter.'
                : 'Add your first book to populate the library catalog.'}
            </p>
            {!query && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
              >
                Add First Book
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Book ID</th>
                    <th className="py-2.5 px-4">Title</th>
                    <th className="py-2.5 px-4">Author</th>
                    <th className="py-2.5 px-4 text-right">Borrowed</th>
                    <th className="py-2.5 px-4 text-right">Returned</th>
                    <th className="py-2.5 px-4 text-right">Total Loans</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {books.map((book) => (
                    <tr key={book.book_id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
                        #{book.book_id}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{book.book_name}</td>
                      <td className="py-3 px-4 text-slate-600">{book.author}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        <span
                          className={
                            book.active_borrows > 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {book.active_borrows}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-700 tabular-nums">
                        {book.returned_borrows}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                        {book.total_borrows}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onIssueBook(book.book_id)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            Issue
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(book)}
                            aria-label={`Edit ${book.book_name}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(book);
                            }}
                            aria-label={`Delete ${book.book_name}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100">
              {books.map((book) => (
                <div key={book.book_id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{book.book_name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono tabular-nums">#{book.book_id}</span> · {book.author}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
                    <span className={book.active_borrows > 0 ? 'text-amber-700 font-medium' : ''}>
                      {book.active_borrows} borrowed
                    </span>
                    <span className="text-emerald-700">{book.returned_borrows} returned</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onIssueBook(book.book_id)}
                      className="flex-1 px-3 py-2 min-h-[44px] rounded-lg bg-blue-700 text-xs font-medium text-white"
                    >
                      Issue Book
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(book)}
                      aria-label={`Edit ${book.book_name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(book);
                      }}
                      aria-label={`Delete ${book.book_name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Add / Edit Book Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="book-modal-title" className="text-base font-semibold text-slate-900">
                {editingBook ? `Edit Book #${editingBook.book_id}` : 'Add New Book'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBook} className="p-6 space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
                >
                  {formError}
                </div>
              )}

              {!editingBook && (
                <div className="space-y-1.5">
                  <label htmlFor="book-id-input" className="block text-sm font-medium text-slate-800">
                    Book ID <span className="text-xs font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    id="book-id-input"
                    type="number"
                    min={1}
                    value={formBookId}
                    onChange={(e) => setFormBookId(e.target.value)}
                    placeholder="Auto-assign next ID if left blank"
                    className="w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="book-title-input" className="block text-sm font-medium text-slate-800">
                  Book Title
                </label>
                <input
                  id="book-title-input"
                  type="text"
                  required
                  value={formBookName}
                  onChange={(e) => setFormBookName(e.target.value)}
                  placeholder="e.g., Operating System Concepts"
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="book-author-input" className="block text-sm font-medium text-slate-800">
                  Author
                </label>
                <input
                  id="book-author-input"
                  type="text"
                  value={formAuthor}
                  onChange={(e) => setFormAuthor(e.target.value)}
                  placeholder="e.g., Abraham Silberschatz"
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingBook ? 'Save Changes' : 'Add Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Book Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-book-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 space-y-4">
            <h2 id="delete-book-title" className="text-base font-semibold text-slate-900">
              Delete Book #{deleteTarget.book_id}?
            </h2>
            <p className="text-sm text-slate-600">
              Are you sure you want to remove{' '}
              <span className="font-medium text-slate-900">{deleteTarget.book_name}</span> from the
              catalog?
            </p>
            {deleteError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
              >
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 min-h-[44px] rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Book'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
