"use client";

import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import ResourceForm from "@/app/mentor/courses/upload-book/ResourceForm";
import { useAdminScopes } from "../useAdminScopes";

export default function AdminResourceForm() {
  const scopes = useAdminScopes();
  if (scopes.isPending) return <LoadingBlock />;
  if (scopes.isError || !scopes.data) return <ErrorState error={scopes.error} onRetry={scopes.refetch} />;
  return <ResourceForm scopeList={scopes.data} basePath="/admin/courses/resources" />;
}
