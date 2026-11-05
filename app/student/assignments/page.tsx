import type { Metadata } from 'next';
import AssignmentsContent from './components/AssignmentsContent';

export const metadata: Metadata = { title: 'Assignments' };

export default function AssignmentsPage() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto font-sans text-gray-800">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Assignments</h1>
        <p className="text-xs text-gray-400 mt-1">View assignments from all courses and track their status</p>
      </div>

      <AssignmentsContent />
    </div>
  );
}
