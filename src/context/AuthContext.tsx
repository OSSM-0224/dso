'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, getStoredRole, setStoredSession } from '@/lib/api.ts';
import { UserRole, UserSession } from '@/shared/types.ts';

interface AuthContextType {
  user: UserSession | null;
  role: UserRole;
  switchRole: (newRole: UserRole) => Promise<void>;
  loginAsSchool: (identifier: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  loginStaff: (identifier: string, password: string) => Promise<UserSession>;
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isLoading: boolean;
  canWrite: boolean;
  canScore: boolean;
  isParticipant: boolean;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Hydration-safe: the first (server + client) paint always uses the same
  // fixed default. The persisted role is restored from localStorage inside an
  // effect, AFTER hydration — reading it during the initial render would make
  // the client snapshot differ from the one the server rendered.
  const [role, setRole] = useState<UserRole>('organizer');
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialized = useRef(false);

  const initSession = async (targetRole: UserRole) => {
    try {
      setIsLoading(true);
      // If we should have a school session cookie (the client-persisted mirror
      // is the stored role), verify it / fetch me
      if (targetRole === 'participant') {
        try {
          const me = await api.auth.getMe();
          if (me && me.role === 'participant') {
            setUser(me);
            setRole('participant');
            return;
          }
        } catch {
          // Fall through to switchRole
        }
      }

      // Real staff logins (admin/organizer/scorer accounts) live on the staff
      // cookie: verify it first so a hard refresh keeps the actual account
      // instead of the generic role-preview session.
      if (targetRole === 'admin' || targetRole === 'organizer' || targetRole === 'scorer') {
        try {
          const me = await api.auth.getMe();
          if (me && me.role === targetRole && me.id && me.id !== 'default-organizer') {
            setUser(me);
            setRole(me.role);
            return;
          }
        } catch {
          // No valid staff cookie — fall through to the role_preview session.
        }
      }

      const res = await api.auth.switchRole(targetRole);
      setStoredSession(res.user.role);
      setRole(res.user.role);
      setUser(res.user);
    } catch (err) {
      console.error('Failed to init auth session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Guard against React 18 StrictMode double-invoke (two /auth/session calls).
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    const stored = getStoredRole();
    setRole(stored);
    initSession(stored);
  }, []);

  const switchRole = async (newRole: UserRole) => {
    await initSession(newRole);
  };

  const loginAsSchool = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login(identifier, password);
      setStoredSession('participant');
      setRole('participant');
      setUser(res.user);
      return { mustChangePassword: res.mustChangePassword };
    } finally {
      setIsLoading(false);
    }
  };

  // Real staff-account login (admin, organizer, or scorer). Keeps the role
  // returned by the server instead of forcing 'participant'.
  const loginStaff = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login(identifier, password);
      setStoredSession(res.user.role);
      setRole(res.user.role);
      setUser(res.user);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (newPassword: string, currentPassword?: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.changePassword(newPassword, currentPassword);
      setStoredSession('participant');
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await initSession('viewer');
  };

  const canWrite = role === 'admin' || role === 'organizer';
  const canScore = canWrite || role === 'scorer';
  const isParticipant = role === 'participant';
  const mustChangePassword = !!user?.mustChangePassword;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        switchRole,
        loginAsSchool,
        loginStaff,
        changePassword,
        signOut,
        isLoading,
        canWrite,
        canScore,
        isParticipant,
        mustChangePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
