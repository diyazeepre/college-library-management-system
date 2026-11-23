import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Plus, Search, Trash2 } from 'lucide-react';
import { libraryApi } from '../api';
import type { BorrowTransactionRecord } from '../types';
import { formatBorrowDate } from '../utils/format';

interface CirculationViewProps {
  refreshKey: number;
  onOpenIssueModal: () => void;
  onDataChanged: (toastMessage?: string) => void;
}

type StatusFilter = 'all' | 'borrowed' | 'returned';

export function CirculationView({
  refreshKey,
  onOpenIssueModal,
  onDataChanged,
}: CirculationViewProps) {
  const [transactions, setTransactions] = useState<BorrowTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<BorrowTransactionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    libraryApi
      .getTransactions({ q: debouncedQuery, status: statusFilter })
      .then((res) => {
        if (!cancelled) setTransactions(res.transactions);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load circulation history.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, statusFilter, refreshKey]);

  const handleToggleReturn = async (tx: BorrowTransactionRecord) => {
    setUpdatingId(tx.transaction_id);
    setError(null);
    try {
      const updated = await libraryApi.setTransactionStatus(tx.transaction_id, !tx.return_status);
      setTransactions((prev) =>
        prev.map((item) => (item.transaction_id === updated.transaction_id ? updated : item))
      );
      onDataChanged(
        updated.return_status
          ? `Marked "${updated.book_name}" as returned.`
          : `Re-issued "${updated.book_name}" to ${updated.student_name}.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteTx) return;
    setDeleting(true);
    setError(null);
    try {
      await libraryApi.deleteTransaction(confirmDeleteTx.transaction_id);
      setTransactions((prev) =>
        prev.filter((item) => item.transaction_id !== confirmDeleteTx.transaction_id)
      );
      const removedId = confirmDeleteTx.transaction_id;
      setConfirmDeleteTx(null);
      onDataChanged(`Removed transaction #${removedId}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Circulation &amp; Borrowing History
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track active loans, process returns, and search joined student-book transactions.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenIssueModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Issue Book</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by USN, student, book title, author, or ID..."
            aria-label="Search borrowing history"
            className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto"
          role="group"
          aria-label="Filter by return status"
        >
          {(['all', 'borrowed', 'returned'] as StatusFilter[]).map((tab) => {
            const active = statusFilter === tab;
            const label =
              tab === 'all' ? 'All Records' : tab === 'borrowed' ? 'Borrowed' : 'Returned';
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-2 min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            );
          })}
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

      {/* Table / List */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <span className="text-sm font-semibold text-slate-900">Joined Circulation Ledger</span>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {transactions.length} {transactions.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-900">No matching transactions found</p>
            <p className="mt-1 text-xs text-slate-500">
              Try clearing your search query or switch the status filter.
            </p>
            {(query || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                }}
                className="mt-4 px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Tx ID</th>
                    <th className="py-2.5 px-4">Student Details</th>
                    <th className="py-2.5 px-4">Book Details</th>
                    <th className="py-2.5 px-4">Borrow Date</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {transactions.map((tx) => (
                    <tr key={tx.transaction_id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        #{tx.transaction_id}
                      </td>
                      <td className="py-3 px-4 min-w-[180px]">
                        <p className="font-medium text-slate-900">{tx.student_name}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {tx.usn} · {tx.department}
                        </p>
                      </td>
                      <td className="py-3 px-4 min-w-[200px]">
                        <p className="font-medium text-slate-900">{tx.book_name}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono tabular-nums">#{tx.book_id}</span> · {tx.author}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatBorrowDate(tx.borrow_date)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {tx.return_status ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Returned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            Borrowed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={updatingId === tx.transaction_id}
                            onClick={() => handleToggleReturn(tx)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 ${
                              tx.return_status
                                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                : 'bg-blue-700 text-white hover:bg-blue-800'
                            }`}
                          >
                            {updatingId === tx.transaction_id
                              ? 'Saving...'
                              : tx.return_status
                              ? 'Mark Borrowed'
                              : 'Return Book'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTx(tx)}
                            aria-label={`Delete transaction ${tx.transaction_id}`}
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
              {transactions.map((tx) => (
                <div key={tx.transaction_id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{tx.book_name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono tabular-nums">#{tx.book_id}</span> · {tx.author}
                      </p>
                    </div>
                    {tx.return_status ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Returned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 shrink-0">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        Borrowed
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{tx.student_name}</span>
                    {' · '}
                    <span className="font-mono tabular-nums">{tx.usn}</span>
                    {' · '}
                    <span>{tx.department}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      #{tx.transaction_id} · {formatBorrowDate(tx.borrow_date)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={updatingId === tx.transaction_id}
                        onClick={() => handleToggleReturn(tx)}
                        className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-medium ${
                          tx.return_status
                            ? 'border border-slate-200 bg-white text-slate-700'
                            : 'bg-blue-700 text-white'
                        }`}
                      >
                        {tx.return_status ? 'Mark Borrowed' : 'Return Book'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTx(tx)}
                        aria-label={`Delete transaction ${tx.transaction_id}`}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {confirmDeleteTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tx-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 space-y-4">
            <h2 id="delete-tx-title" className="text-base font-semibold text-slate-900">
              Delete Transaction #{confirmDeleteTx.transaction_id}?
            </h2>
            <p className="text-sm text-slate-600">
              This will permanently remove the circulation record for{' '}
              <span className="font-medium text-slate-900">{confirmDeleteTx.book_name}</span>{' '}
              borrowed by{' '}
              <span className="font-medium text-slate-900">{confirmDeleteTx.student_name}</span>.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTx(null)}
                className="px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-4 py-2 min-h-[44px] rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
