import type { Metadata } from 'next';
import { Suspense } from 'react';
import AssignmentDetail from './AssignmentDetail';
import { LoadingBlock } from '@/app/components/ui/feedback';

export const metadata: Metadata = { title: 'Assignment' };

export default async function AssignmentPage({ params }: PageProps<'/student/assignments/[id]'>) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AssignmentDetail assignmentId={id} />
    </Suspense>
  );
}
