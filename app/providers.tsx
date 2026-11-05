"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { makeQueryClient } from "@/lib/query/client";
import { SessionProvider } from "@/lib/auth/session";

export default function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session (created lazily, never shared between requests).
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
