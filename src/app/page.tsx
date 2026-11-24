import { LibraryPortal } from '@/components/LibraryPortal';
import {
  queryBooksData,
  queryDashboardData,
  queryStudentsData,
  queryTransactionsData,
} from '@/lib/library-queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  try {
    const [dashboard, studentsRes, books, transactions] = await Promise.all([
      queryDashboardData(),
      queryStudentsData(),
      queryBooksData(),
      queryTransactionsData(),
    ]);

    return (
      <LibraryPortal
        initialDashboard={dashboard}
        initialStudents={studentsRes.students}
        initialDepartments={studentsRes.departments}
        initialBooks={books}
        initialTransactions={transactions}
      />
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load library data from PostgreSQL.';
    return <LibraryPortal initialError={message} />;
  }
}
