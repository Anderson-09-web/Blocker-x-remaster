import React, { createContext, useContext, useEffect, useRef } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
    }
  });

  const [location, setLocation] = useLocation();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      // Only redirect to login on an explicit 401 — not on network errors,
      // 500s, or any other transient failure. This prevents spurious logouts
      // when a single request blips while the user is actively using the app.
      const httpStatus = (error as any)?.status ?? (error as any)?.response?.status;
      const is401 = isError && httpStatus === 401;

      // Normalize to pathname only (strip any query/hash that wouter may include)
      const pathname = location.split("?")[0].split("#")[0];
      const PUBLIC_PATHS = ["/", "/privacy", "/usage"];
      if (
        is401 &&
        !redirectedRef.current &&
        !PUBLIC_PATHS.includes(pathname) &&
        !pathname.startsWith("/api/auth")
      ) {
        redirectedRef.current = true;
        setLocation("/");
      }
      return;
    }

    redirectedRef.current = false;

    if (user.isBanned) return;

    if (!user.hasInvite && !user.isAdmin && location !== "/invite") {
      setLocation("/invite");
    } else if ((user.hasInvite || user.isAdmin) && (location === "/" || location === "/invite")) {
      setLocation(user.isAdmin ? "/admin" : "/dashboard");
    }
  }, [user, isLoading, isError, error]);

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
