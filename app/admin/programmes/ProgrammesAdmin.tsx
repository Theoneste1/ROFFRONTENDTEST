"use client";

/**
 * /admin/programmes — programme membership for administrators whose
 * GET /me/permissions lists programmes.manageMembers (Super Administrators, and
 * Administrators on a backend with owner decision D-5, 2026-11-14; the production
 * backend's frozen ADMIN list does not include it yet). Members:
 * GET/POST/DELETE /admin/programmes/:id/members; people to add: GET /admin/users (users.manage).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { programmesApi } from "@/lib/api/programmes";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { memberRolesManaged, peopleSearch, type MemberRole } from "@/lib/programmes/programme-rules";
import ProgrammeMembers from "@/app/components/programmes/ProgrammeMembers";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage, FilterPills, Notice, SelectFilter } from "../components/adminUi";

type View = "STUDENT" | "MENTOR" | "former-STUDENT" | "former-MENTOR";

export default function ProgrammesAdmin() {
  const { can, role, permissionsStatus } = useSession();
  const programmes = useQuery({ queryKey: queryKeys.programmes.list(), queryFn: programmesApi.list, enabled: can("programmes.manageMembers") });
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const [view, setView] = useState<View>("STUDENT");

  if (permissionsStatus === "loading") return <AdminPage title="Programmes"><LoadingBlock /></AdminPage>;
  if (!can("programmes.manageMembers"))
    return (
      <AdminPage title="Programmes">
        <Notice tone="info">Your account can&apos;t manage programme membership.</Notice>
      </AdminPage>
    );
  if (programmes.isPending) return <AdminPage title="Programmes"><LoadingBlock /></AdminPage>;
  if (programmes.isError)
    return (
      <AdminPage title="Programmes">
        <ErrorState error={programmes.error} onRetry={() => programmes.refetch()} />
      </AdminPage>
    );
  const list = programmes.data;
  const selected = list.find((p) => p.id === programmeId) ?? list[0];
  if (!selected)
    return (
      <AdminPage title="Programmes">
        <Notice tone="info">There are no programmes yet.</Notice>
      </AdminPage>
    );

  const memberRole = (view.replace("former-", "") as MemberRole);
  const former = view.startsWith("former-");
  return (
    <AdminPage title="Programmes" description="Students and coaches of each programme. Membership gives no course access by itself.">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {list.length > 1 && <SelectFilter label="Programme" value={selected.id} onChange={setProgrammeId} options={list.map((p) => ({ label: p.name, value: p.id }))} />}
        <FilterPills
          label="View"
          value={view}
          onChange={setView}
          options={[
            { label: "Students", value: "STUDENT" },
            { label: "Coaches", value: "MENTOR" },
            { label: "Former students", value: "former-STUDENT" },
            { label: "Former coaches", value: "former-MENTOR" },
          ]}
        />
      </div>
      <ProgrammeMembers key={`${selected.id}:${view}`} programmeId={selected.id} role={memberRole} former={former} managed={memberRolesManaged(role, can)} search={peopleSearch(role, can)} />
    </AdminPage>
  );
}
