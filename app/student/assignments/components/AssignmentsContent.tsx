'use client';

import React, { useDeferredValue, useMemo, useState } from 'react';
import { ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { useMyAssignments } from '@/lib/queries/assessment';
import { useCourses } from '@/lib/queries/learning';
import type { StudentDisplayStatus } from '@/lib/api/types';
import { EmptyState, ErrorState, LoadingBlock } from '@/app/components/ui/feedback';
import Pagination from '@/app/components/ui/Pagination';
import AssignmentSearch from './AssignmentSearch';
import AssignmentFilters from './AssignmentFilters';
import AssignmentTable from './AssignmentTable';
import { STUDENT_STATUSES } from '../../components/studentUi';

type StatusFilter = 'all' | StudentDisplayStatus;
type SortKey = 'deadline-asc' | 'deadline-desc' | 'title';

const PAGE_SIZE = 50;

/**
 * Search (`q`), course and paging run on the server. The backend has no
 * display-status filter or sort parameter, so those apply to the loaded page.
 */
export default function AssignmentsContent() {
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [courseId, setCourseId] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('deadline-asc');
  const [page, setPage] = useState(1);

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const onCourse = (value: string) => {
    setCourseId(value);
    setPage(1);
  };

  const courses = useCourses();
  const query = useMyAssignments({
    q: q || undefined,
    courseId: courseId === 'all' ? undefined : courseId,
    page,
    limit: PAGE_SIZE,
  });

  const rows = useMemo(() => {
    const items = (query.data?.data ?? []).filter((a) => status === 'all' || a.displayStatus === status);
    return items.slice().sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      const d = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      return sort === 'deadline-asc' ? d : -d;
    });
  }, [query.data, status, sort]);

  const courseOptions = [{ value: 'all', label: 'All courses' }, ...(courses.data ?? []).map((c) => ({ value: c.id, label: c.title }))];

  return (
    <>
      {/* Control bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <AssignmentSearch value={search} onChange={onSearch} />

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          <AssignmentFilters
            label="Course"
            icon={<SlidersHorizontal className="w-3.5 h-3.5 text-gray-600" />}
            options={courseOptions}
            value={courseId}
            onChange={onCourse}
          />
          <AssignmentFilters<StatusFilter>
            label="Filters"
            icon={<SlidersHorizontal className="w-3.5 h-3.5 text-gray-600" />}
            options={[{ value: 'all', label: 'All statuses' }, ...STUDENT_STATUSES.map((s) => ({ value: s, label: s }))]}
            value={status}
            onChange={setStatus}
          />
          <AssignmentFilters<SortKey>
            label="Sort By"
            icon={<ArrowUpDown className="w-3.5 h-3.5 text-gray-600" />}
            options={[
              { value: 'deadline-asc', label: 'Deadline (soonest)' },
              { value: 'deadline-desc', label: 'Deadline (latest)' },
              { value: 'title', label: 'Name (A–Z)' },
            ]}
            value={sort}
            onChange={setSort}
          />
        </div>
      </div>

      {query.isPending ? (
        <LoadingBlock label="Loading assignments…" />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Couldn't load assignments" onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <div className="border border-blue-200/80 rounded-2xl bg-white">
          <EmptyState
            title={query.data.meta.total === 0 && !q && courseId === 'all' ? 'No assignments yet' : 'No assignments match'}
            description={
              query.data.meta.total === 0 && !q && courseId === 'all'
                ? 'Assignments published for your division will appear here.'
                : 'Try a different search or filter.'
            }
          />
        </div>
      ) : (
        <div className={query.isFetching ? 'opacity-70 transition-opacity' : ''}>
          <AssignmentTable assignments={rows} />
        </div>
      )}

      {query.data && (
        <Pagination page={page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} onPage={setPage} disabled={query.isFetching} />
      )}
    </>
  );
}
