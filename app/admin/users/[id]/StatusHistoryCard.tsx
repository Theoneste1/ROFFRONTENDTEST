"use client";

/** The account's state changes, newest first (users.viewStatusHistory; rules: lib/accounts/status-history.ts). */
import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { changedBy, statusHistoryApi, transitionText, STATUS_HISTORY_PAGE_SIZE } from "@/lib/accounts/status-history";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Card } from "../../components/adminUi";

export default function StatusHistoryCard({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: queryKeys.admin.userStatusHistory(userId, page),
    queryFn: () => statusHistoryApi.list(userId, page, STATUS_HISTORY_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  return (
    <Card className="p-6 lg:col-span-3">
      <h2 className="text-base font-bold text-gray-900 mb-1">Account history</h2>
      <p className="text-xs text-gray-500 mb-4">Every change of the account&apos;s state — who made it, when, and why.</p>
      {history.isPending ? (
        <LoadingBlock />
      ) : history.isError ? (
        <ErrorState error={history.error} title="Couldn't load the account history" onRetry={() => history.refetch()} />
      ) : history.data.data.length === 0 ? (
        <p className="text-sm text-gray-500">No state changes yet: the account has been active since it was created.</p>
      ) : (
        <>
          <ol className="divide-y divide-gray-100" data-testid="status-history">
            {history.data.data.map((c) => (
              <li key={c.id} className="py-2.5 text-sm">
                <p className="font-semibold text-gray-800">{transitionText(c)}</p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(c.createdAt)} · {changedBy(c)}
                  {c.operationId && (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/admin/users/bulk?operation=${encodeURIComponent(c.operationId)}`} className="underline">
                        view operation
                      </Link>
                    </>
                  )}
                </p>
                {c.reason && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">Reason: {c.reason}</p>}
              </li>
            ))}
          </ol>
          {history.data.meta.totalPages > 1 && (
            <Pagination page={page} totalPages={history.data.meta.totalPages} total={history.data.meta.total} onPage={setPage} disabled={history.isFetching} />
          )}
        </>
      )}
    </Card>
  );
}
