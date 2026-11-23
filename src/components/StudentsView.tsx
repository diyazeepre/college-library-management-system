import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, History, Pencil, Search, Trash2, UserPlus, X } from 'lucide-react';
import { libraryApi } from '../api';
import type { BorrowTransactionRecord, StudentRecord } from '../types';
import { formatBorrowDate } from '../utils/format';

interface StudentsViewProps {
  refreshKey: number;
  onIssueToStudent: (usn: string) => void;
  onDataChanged: (toastMessage?: string) => void;
}

export function StudentsView({
  refreshKey,
  onIssueToStudent,
  onDataChanged,
}: StudentsViewProps) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [formUsn, setFormUsn] = useState('');
  const [formName, setFormName] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<StudentRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Student history slide-over drawer
  const [historyStudent, setHistoryStudent] = useState<StudentRecord | null>(null);
  const [historyRows, setHistoryRows] = useState<BorrowTransactionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [updatingTxId, setUpdatingTxId] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    libraryApi
      .getStudents({ q: debouncedQuery, department: selectedDept })
      .then((res) => {
        if (!cancelled) {
          setStudents(res.students);
          setDepartments(res.departments);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load students.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedDept, refreshKey]);

  const openHistoryDrawer = async (student: StudentRecord) => {
    setHistoryStudent(student);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await libraryApi.getStudentHistory(student.usn);
      setHistoryRows(res.history);
    } catch (err: unknown) {
      setHistoryError(
        err instanceof Error ? err.message : 'Failed to load student borrowing history.'
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryToggleReturn = async (tx: BorrowTransactionRecord) => {
    setUpdatingTxId(tx.transaction_id);
    try {
      const updated = await libraryApi.setTransactionStatus(tx.transaction_id, !tx.return_status);
      setHistoryRows((prev) =>
        prev.map((item) => (item.transaction_id === updated.transaction_id ? updated : item))
      );
      onDataChanged(
        updated.return_status
          ? `Marked "${updated.book_name}" as returned.`
          : `Re-issued "${updated.book_name}" to ${updated.student_name}.`
      );
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to update transaction.');
    } finally {
      setUpdatingTxId(null);
    }
  };

  const openAddModal = () => {
    setEditingStudent(null);
    setFormUsn('');
    setFormName('');
    setFormDepartment('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (student: StudentRecord) => {
    setEditingStudent(student);
    setFormUsn(student.usn);
    setFormName(student.name);
    setFormDepartment(student.department === 'Unassigned' ? '' : student.department);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsn.trim() || !formName.trim()) {
      setFormError('Student USN and full name are required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingStudent) {
        await libraryApi.updateStudent(editingStudent.usn, {
          name: formName.trim(),
          department: formDepartment.trim(),
        });
        setModalOpen(false);
        onDataChanged(`Updated student ${editingStudent.usn}.`);
      } else {
        const created = await libraryApi.createStudent({
          usn: formUsn.trim().toUpperCase(),
          name: formName.trim(),
          department: formDepartment.trim(),
        });
        setModalOpen(false);
        onDataChanged(`Registered student ${created.usn} — ${created.name}.`);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save student.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await libraryApi.deleteStudent(deleteTarget.usn);
      const removedUsn = deleteTarget.usn;
      setDeleteTarget(null);
      onDataChanged(`Removed student ${removedUsn}.`);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete student.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage student accounts, departments, and view individual borrowing history.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span>Add Student</span>
        </button>
      </div>

      {/* Search & Department Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by USN, student name, or department..."
            aria-label="Search students"
            className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="dept-filter" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Department:
          </label>
          <select
            id="dept-filter"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
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
          <span className="text-sm font-semibold text-slate-900">Registered Students</span>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {students.length} {students.length === 1 ? 'student' : 'students'}
          </span>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-900">No students found</p>
            <p className="mt-1 text-xs text-slate-500">
              {query || selectedDept !== 'all'
                ? 'Try clearing your search or department filter.'
                : 'Add a student record to begin issuing books.'}
            </p>
            {!query && selectedDept === 'all' && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
              >
                Add First Student
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">USN</th>
                    <th className="py-2.5 px-4">Student Name</th>
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4 text-right">Borrowed</th>
                    <th className="py-2.5 px-4 text-right">Returned</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {students.map((student) => (
                    <tr key={student.usn} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
                        {student.usn}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{student.name}</td>
                      <td className="py-3 px-4 text-slate-600">{student.department}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        <span
                          className={
                            student.active_borrows > 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {student.active_borrows}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-emerald-700 tabular-nums">
                        {student.returned_borrows}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                        {student.total_borrows}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openHistoryDrawer(student)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <History className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            <span>History</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onIssueToStudent(student.usn)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-700 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            Issue
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(student)}
                            aria-label={`Edit ${student.name}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(student);
                            }}
                            aria-label={`Delete ${student.name}`}
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
              {students.map((student) => (
                <div key={student.usn} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{student.usn}</span> · {student.department}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
                    <span className={student.active_borrows > 0 ? 'text-amber-700 font-medium' : ''}>
                      {student.active_borrows} borrowed
                    </span>
                    <span className="text-emerald-700">{student.returned_borrows} returned</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openHistoryDrawer(student)}
                      className="flex-1 px-3 py-2 min-h-[44px] rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700"
                    >
                      History ({student.total_borrows})
                    </button>
                    <button
                      type="button"
                      onClick={() => onIssueToStudent(student.usn)}
                      className="flex-1 px-3 py-2 min-h-[44px] rounded-lg bg-blue-700 text-xs font-medium text-white"
                    >
                      Issue Book
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(student)}
                      aria-label={`Edit ${student.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(student);
                      }}
                      aria-label={`Delete ${student.name}`}
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

      {/* Add / Edit Student Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="student-modal-title" className="text-base font-semibold text-slate-900">
                {editingStudent ? `Edit Student ${editingStudent.usn}` : 'Register New Student'}
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

            <form onSubmit={handleSaveStudent} className="p-6 space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
                >
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="student-usn-input" className="block text-sm font-medium text-slate-800">
                  University Seat Number (USN)
                </label>
                <input
                  id="student-usn-input"
                  type="text"
                  required
                  disabled={Boolean(editingStudent)}
                  value={formUsn}
                  onChange={(e) => setFormUsn(e.target.value)}
                  placeholder="e.g., 1EP23CS014"
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 font-mono uppercase disabled:bg-slate-100 disabled:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="student-name-input" className="block text-sm font-medium text-slate-800">
                  Full Name
                </label>
                <input
                  id="student-name-input"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Aditi Sharma"
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="student-dept-input" className="block text-sm font-medium text-slate-800">
                  Department
                </label>
                <input
                  id="student-dept-input"
                  type="text"
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  placeholder="e.g., CSE, AIML, ECE, ME, Civil"
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
                  {saving ? 'Saving...' : editingStudent ? 'Save Changes' : 'Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-student-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-6 space-y-4">
            <h2 id="delete-student-title" className="text-base font-semibold text-slate-900">
              Delete Student {deleteTarget.usn}?
            </h2>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-medium text-slate-900">{deleteTarget.name}</span> from the
              directory?
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
                {deleting ? 'Deleting...' : 'Delete Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Borrowing History Slide-Over Drawer */}
      {historyStudent && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-history-title"
        >
          <div className="w-full max-w-xl bg-white h-full border-l border-slate-200 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 id="student-history-title" className="text-base font-semibold text-slate-900">
                  {historyStudent.name}
                </h2>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  {historyStudent.usn} · {historyStudent.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryStudent(null)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close history drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {historyError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
                >
                  {historyError}
                </div>
              )}

              {historyLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium text-slate-900">No borrowing history</p>
                  <p className="mt-1 text-xs text-slate-500">
                    This student has not borrowed any books yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const usn = historyStudent.usn;
                      setHistoryStudent(null);
                      onIssueToStudent(usn);
                    }}
                    className="mt-4 px-4 py-2 min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
                  >
                    Issue Book to {historyStudent.name}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {historyRows.map((tx) => (
                    <div key={tx.transaction_id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{tx.book_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono tabular-nums">#{tx.book_id}</span> · {tx.author}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs">
                          <span className="font-mono text-slate-400 tabular-nums">
                            Tx #{tx.transaction_id} · {formatBorrowDate(tx.borrow_date)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {tx.return_status ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Returned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            Borrowed
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={updatingTxId === tx.transaction_id}
                          onClick={() => handleHistoryToggleReturn(tx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                            tx.return_status
                              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              : 'bg-blue-700 text-white hover:bg-blue-800'
                          }`}
                        >
                          {updatingTxId === tx.transaction_id
                            ? 'Saving...'
                            : tx.return_status
                            ? 'Re-issue'
                            : 'Return Book'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
