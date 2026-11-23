import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import type {
  BorrowTransactionRecord,
  DashboardStats,
  DepartmentSummary,
  NavSection,
} from '../types';
import { formatBorrowDate } from '../utils/format';

interface DashboardViewProps {
  stats: DashboardStats | null;
  departments: DepartmentSummary[];
  recentTransactions: BorrowTransactionRecord[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate: (section: NavSection) => void;
  onOpenIssueModal: () => void;
  onToggleReturnStatus: (tx: BorrowTransactionRecord) => Promise<void>;
  updatingId: number | null;
}

export function DashboardView({
  stats,
  departments,
  recentTransactions,
  loading,
  error,
  onRetry,
  onNavigate,
  onOpenIssueModal,
  onToggleReturnStatus,
  updatingId,
}: DashboardViewProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Unable to load dashboard</h2>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const kpis = [
    {
      label: 'Total Students',
      value: stats?.total_students ?? 0,
      detail: 'Registered borrowers',
      target: 'students' as NavSection,
    },
    {
      label: 'Total Books',
      value: stats?.total_books ?? 0,
      detail: 'Catalogued titles',
      target: 'books' as NavSection,
    },
    {
      label: 'Borrowed Books',
      value: stats?.borrowed_books ?? 0,
      detail: 'Currently on loan',
      target: 'circulation' as NavSection,
      accent: 'text-amber-700',
    },
    {
      label: 'Returned Books',
      value: stats?.returned_books ?? 0,
      detail: 'Completed returns',
      target: 'circulation' as NavSection,
      accent: 'text-emerald-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Library Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Live student roster, book inventory, and joined circulation metrics from PostgreSQL.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('circulation')}
            className="px-4 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap"
          >
            Full History
          </button>
          <button
            type="button"
            onClick={onOpenIssueModal}
            className="px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap"
          >
            Issue Book
          </button>
        </div>
      </div>

      {/* 4-column KPI strip */}
      <section aria-label="Library totals" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.target)}
            className="text-left rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            {loading ? (
              <div className="mt-2 h-8 w-16 rounded bg-slate-100 animate-pulse" />
            ) : (
              <p
                className={`mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums ${
                  kpi.accent ?? 'text-slate-900'
                }`}
              >
                {kpi.value}
              </p>
            )}
            <p className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{kpi.detail}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </p>
          </button>
        ))}
      </section>

      {/* Main 2-column operational split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Recent Joined Circulation Activity */}
        <section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recent Circulation Activity
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Joined records across Students, Books, and Borrow Transactions
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('circulation')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
            >
              View all ({stats?.total_transactions ?? 0})
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-900">No borrow transactions yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Issue a book to a student to start tracking circulation.
              </p>
              <button
                type="button"
                onClick={onOpenIssueModal}
                className="mt-4 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
              >
                Issue First Book
              </button>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-4">ID</th>
                      <th className="py-2.5 px-4">Student</th>
                      <th className="py-2.5 px-4">Book</th>
                      <th className="py-2.5 px-4">Issued</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {recentTransactions.map((tx) => (
                      <tr key={tx.transaction_id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          #{tx.transaction_id}
                        </td>
                        <td className="py-3 px-4 min-w-[160px]">
                          <p className="font-medium text-slate-900">{tx.student_name}</p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {tx.usn} · {tx.department}
                          </p>
                        </td>
                        <td className="py-3 px-4 min-w-[180px]">
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
                          <button
                            type="button"
                            disabled={updatingId === tx.transaction_id}
                            onClick={() => onToggleReturnStatus(tx)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 ${
                              tx.return_status
                                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                : 'bg-blue-700 text-white hover:bg-blue-800'
                            }`}
                          >
                            {updatingId === tx.transaction_id
                              ? 'Saving...'
                              : tx.return_status
                              ? 'Re-issue'
                              : 'Return Book'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile compact list */}
              <div className="md:hidden divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <div key={tx.transaction_id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{tx.book_name}</p>
                        <p className="text-xs text-slate-500">
                          {tx.student_name} · <span className="font-mono">{tx.usn}</span>
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
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        #{tx.transaction_id} · {formatBorrowDate(tx.borrow_date)}
                      </span>
                      <button
                        type="button"
                        disabled={updatingId === tx.transaction_id}
                        onClick={() => onToggleReturnStatus(tx)}
                        className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium ${
                          tx.return_status
                            ? 'border border-slate-200 bg-white text-slate-700'
                            : 'bg-blue-700 text-white'
                        }`}
                      >
                        {tx.return_status ? 'Re-issue' : 'Return Book'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Department Breakdown */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Department Circulation</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active and returned loans grouped by department
            </p>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : departments.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No department records found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {departments.map((dept) => {
                const total = dept.active_borrows + dept.returned_borrows;
                const returnRate = total > 0 ? Math.round((dept.returned_borrows / total) * 100) : 0;

                return (
                  <div key={dept.department} className="px-5 py-3.5 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900">{dept.department}</span>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {dept.student_count} {dept.student_count === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-blue-700 transition-all duration-300"
                        style={{ width: `${total > 0 ? Math.max(8, returnRate) : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                      <span>{dept.active_borrows} borrowed</span>
                      <span>{dept.returned_borrows} returned</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
