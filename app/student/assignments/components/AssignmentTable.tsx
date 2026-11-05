import React from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { StudentAssignment } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { StatusBadge } from '../../components/studentUi';

export default function AssignmentTable({ assignments }: { assignments: StudentAssignment[] }) {
  return (
    <div className="border border-blue-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto relative">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#DCE3F6] text-gray-700 text-sm font-bold">
              <th className="py-4 px-6">Assignment Name</th>
              <th className="py-4 px-6">Course</th>
              <th className="py-4 px-6">Deadline</th>
              <th className="py-4 px-6">Status</th>
              <th className="py-4 px-6"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {assignments.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-6 font-bold text-gray-900 text-xs max-w-xs">
                  <Link href={`/student/assignments/${item.id}`} className="block truncate hover:text-indigo-700" title={item.title}>
                    {item.title}
                  </Link>
                  {item.status === 'CLOSED' && <span className="text-[10px] font-semibold text-gray-400">Closed</span>}
                </td>
                <td className="py-4 px-6">
                  <div className="font-bold text-gray-800 text-xs">{item.course.title}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{item.division.name} division</div>
                </td>
                <td className="py-4 px-6 text-xs font-bold text-gray-800">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Clock className="w-4 h-4 text-gray-500 stroke-[1.5]" />
                    <span>{formatDateTime(item.deadline)}</span>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <StatusBadge status={item.displayStatus} />
                </td>
                <td className="py-4 px-6 text-right">
                  <Link href={`/student/assignments/${item.id}`} className="text-xs font-bold text-gray-600 hover:text-gray-900 transition">
                    {item.canSubmit && item.displayStatus === 'Not Started' ? 'Start' : 'View'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
