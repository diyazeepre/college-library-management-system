'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Menu, Plus, X } from 'lucide-react';
import { libraryApi } from '@/api';
import { BooksView } from '@/components/BooksView';
import { CirculationView } from '@/components/CirculationView';
import { DashboardView } from '@/components/DashboardView';
import { IssueBookModal } from '@/components/IssueBookModal';
import { Sidebar } from '@/components/Sidebar';
import { StudentsView } from '@/components/StudentsView';
import type {
  BookRecord,
  BorrowTransactionRecord,
  DashboardStats,
  DepartmentSummary,
  NavSection,
  StudentRecord,
} from '@/types';

const SECTION_LABELS: Record<NavSection, string> = {
  overview: 'Overview',
  circulation: 'Circulation & History',
  books: 'Book Catalog',
  students: 'Student Directory',
};

interface LibraryPortalProps {
  initialDashboard?: {
    stats: DashboardStats;
    departments: DepartmentSummary[];
    recentTransactions: BorrowTransactionRecord[];
  };
  initialStudents?: StudentRecord[];
  initialDepartments?: string[];
  initialBooks?: BookRecord[];
  initialTransactions?: BorrowTransactionRecord[];
  initialError?: string;
}

export function LibraryPortal({
  initialDashboard,
  initialStudents,
  initialDepartments,
  initialBooks,
  initialTransactions,
  initialError,
}: LibraryPortalProps) {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(initialDashboard?.stats ?? null);
  const [departments, setDepartments] = useState<DepartmentSummary[]>(
    initialDashboard?.departments ?? []
  );
  const [recentTransactions, setRecentTransactions] = useState<BorrowTransactionRecord[]>(
    initialDashboard?.recentTransactions ?? []
  );
  const [dashboardLoading, setDashboardLoading] = useState(!initialDashboard && !initialError);
  const [dashboardError, setDashboardError] = useState<string | null>(initialError ?? null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingRecentId, setUpdatingRecentId] = useState<number | null>(null);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [preselectedUsn, setPreselectedUsn] = useState<string | undefined>(undefined);
  const [preselectedBookId, setPreselectedBookId] = useState<number | undefined>(undefined);

  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message?: string) => {
    if (!message) return;
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const data = await libraryApi.getDashboard();
      setStats(data.stats);
      setDepartments(data.departments);
      setRecentTransactions(data.recentTransactions);
    } catch (err: unknown) {
      setDashboardError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (refreshKey === 0 && initialDashboard) {
      return;
    }
    loadDashboard();
  }, [loadDashboard, refreshKey, initialDashboard]);

  const triggerDataRefresh = useCallback(
    (toastMessage?: string) => {
      setRefreshKey((k) => k + 1);
      if (toastMessage) showToast(toastMessage);
    },
    [showToast]
  );

  const handleToggleRecentReturn = async (tx: BorrowTransactionRecord) => {
    setUpdatingRecentId(tx.transaction_id);
    try {
      const updated = await libraryApi.setTransactionStatus(tx.transaction_id, !tx.return_status);
      triggerDataRefresh(
        updated.return_status
          ? `Marked "${updated.book_name}" as returned.`
          : `Re-issued "${updated.book_name}" to ${updated.student_name}.`
      );
    } catch (err: unknown) {
      setDashboardError(err instanceof Error ? err.message : 'Failed to update transaction.');
    } finally {
      setUpdatingRecentId(null);
    }
  };

  const openIssueModal = (options?: { usn?: string; bookId?: number }) => {
    setPreselectedUsn(options?.usn);
    setPreselectedBookId(options?.bookId);
    setIssueModalOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        counts={
          stats
            ? {
                students: stats.total_students,
                books: stats.total_books,
                borrowed: stats.borrowed_books,
              }
            : undefined
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-medium text-slate-500 whitespace-nowrap">Library Portal</span>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {SECTION_LABELS[activeSection]}
              </span>
            </nav>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => openIssueModal()}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-lg bg-blue-700 text-xs sm:text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap transition-colors duration-150"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Issue Book</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          {activeSection === 'overview' && (
            <DashboardView
              stats={stats}
              departments={departments}
              recentTransactions={recentTransactions}
              loading={dashboardLoading}
              error={dashboardError}
              onRetry={loadDashboard}
              onNavigate={setActiveSection}
              onOpenIssueModal={() => openIssueModal()}
              onToggleReturnStatus={handleToggleRecentReturn}
              updatingId={updatingRecentId}
            />
          )}

          {activeSection === 'circulation' && (
            <CirculationView
              refreshKey={refreshKey}
              initialTransactions={initialTransactions}
              onOpenIssueModal={() => openIssueModal()}
              onDataChanged={triggerDataRefresh}
            />
          )}

          {activeSection === 'books' && (
            <BooksView
              refreshKey={refreshKey}
              initialBooks={initialBooks}
              onIssueBook={(bookId) => openIssueModal({ bookId })}
              onDataChanged={triggerDataRefresh}
            />
          )}

          {activeSection === 'students' && (
            <StudentsView
              refreshKey={refreshKey}
              initialStudents={initialStudents}
              initialDepartments={initialDepartments}
              onIssueToStudent={(usn) => openIssueModal({ usn })}
              onDataChanged={triggerDataRefresh}
            />
          )}
        </main>
      </div>

      <IssueBookModal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        preselectedUsn={preselectedUsn}
        preselectedBookId={preselectedBookId}
        onIssued={(tx) => {
          triggerDataRefresh(`Issued "${tx.book_name}" to ${tx.student_name} (${tx.usn}).`);
        }}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg max-w-sm"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
