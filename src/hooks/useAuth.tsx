'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  hasAffiliate: boolean;
  profilePicture?: string;
  onboardingComplete?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>;
  checkAuth: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ['/login', '/register'];

function isPublicPath(pathname: string | null) {
  if (!pathname) return false;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function useAuthState(): AuthContextValue {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const checkAuth = useCallback(async (): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        const user = userData.user as User;
        setAuthState({
          user,
          loading: false,
          error: null,
        });
        return user;
      }

      setAuthState({
        user: null,
        loading: false,
        error: null,
      });
      if (!isPublicPath(pathnameRef.current)) {
        router.push('/login');
      }
      return null;
    } catch (_error) {
      setAuthState({
        user: null,
        loading: false,
        error: 'Failed to check authentication',
      });
      if (!isPublicPath(pathnameRef.current)) {
        router.push('/login');
      }
      return null;
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAuthState({
        user: null,
        loading: false,
        error: null,
      });
      router.push('/login');
    }
  };

  return {
    ...authState,
    logout,
    checkAuth,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
