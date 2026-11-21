"use client";

/**
 * Registration history (REG-13): the account's stages and every registration-related event, oldest first, from
 * GET /admin/users/:id/registration-timeline (users.manage). Older backends answer 404: the card says so.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/auth/roles";
import {
  actorText,
  detailText,
  stageRows,
  type RegistrationTimeline,
} from "@/lib/accounts/registration-timeline";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Card } from "../../components/adminUi";

export default function RegistrationHistoryCard({
  userId,
}: {
  userId: string;
}) {
  const q = useQuery({
    queryKey: ["admin", "users", userId, "registration-timeline"],
    queryFn: () =>
      api<RegistrationTimeline>(`/admin/users/${userId}/registration-timeline`),
    retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2,
  });

  return (
    <section className="lg:col-span-2" data-testid="registration-history">
      <Card className="p-6">
        <h2 className="text-base font-bold text-gray-900 mb-2">
          Registration history
        </h2>
        {q.isPending && <LoadingBlock />}
        {q.isError &&
          (isApiError(q.error) && q.error.status === 404 ? (
            <p className="text-sm text-gray-600">
              The registration history is not available on this server yet.
            </p>
          ) : (
            <Alert tone="error">{errorMessage(q.error)}</Alert>
          ))}
        {q.data && (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mb-4 text-sm">
              {stageRows(q.data, formatDateTime).map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 border-b border-gray-100 py-1"
                >
                  <dt className="text-gray-600">{label}</dt>
                  <dd className="text-gray-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
            {q.data.events.length === 0 ? (
              <p className="text-sm text-gray-600">
                No registration events were recorded for this account.
              </p>
            ) : (
              <ol className="space-y-3 border-l border-gray-200 pl-4">
                {q.data.events.map((e) => {
                  const detail = detailText(e.details);
                  return (
                    <li key={e.id} className="text-sm">
                      <p className="font-medium text-gray-900">{e.label}</p>
                      <p className="text-xs text-gray-600">
                        {formatDateTime(e.at)} ·{" "}
                        {actorText(e, (r) => roleLabel(r as never))}
                      </p>
                      {detail && (
                        <p className="text-xs text-gray-700 mt-0.5 break-words">
                          {detail}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
