import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/features/auth";
import { SessionProvider } from "@/features/session";

export const Providers = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* SessionProviderは認証の切り替わりを購読するため、AuthProviderの内側に置く */}
      <AuthProvider>
        <SessionProvider>{children}</SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
