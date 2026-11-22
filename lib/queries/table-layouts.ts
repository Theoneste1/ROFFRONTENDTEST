"use client";

/** The caller's layout of a configurable table (lib/admin/table-layouts.ts); the built-in one on older backends. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { builtInLayout, tableLayoutsApi, type ColumnSetting, type TableLayout } from "../admin/table-layouts";
import { queryKeys } from "../query/keys";

export function useTableLayout(table: string, supported: boolean) {
  const q = useQuery({ queryKey: queryKeys.tableLayout(table), queryFn: () => tableLayoutsApi.get(table), enabled: supported, staleTime: 5 * 60_000 });
  // Until the saved layout loads (or when it cannot), the built-in layout keeps the table usable.
  const layout: TableLayout = (supported && q.data) || builtInLayout(table);
  return { layout, query: q };
}

type Change = { kind: "saveMine" | "saveOrg"; columns: ColumnSetting[] } | { kind: "resetMine" | "resetOrg" };

export function useChangeTableLayout(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Change) =>
      c.kind === "saveMine" ? tableLayoutsApi.saveMine(table, c.columns)
        : c.kind === "saveOrg" ? tableLayoutsApi.saveOrg(table, c.columns)
          : c.kind === "resetMine" ? tableLayoutsApi.resetMine(table)
            : tableLayoutsApi.resetOrg(table),
    onSuccess: (data) => qc.setQueryData(queryKeys.tableLayout(table), data),
  });
}
