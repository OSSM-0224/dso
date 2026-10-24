import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getStoredRole, setStoredSession } from '@/lib/api.ts';
import { UserRole, UserSession } from '@/shared/types.ts';

interface AuthContextType {
  user: UserSession | null;
  role: UserRole;
  switchRole: (newRole: UserRole) => Promise<void>;
  loginAsSchool: (identifier: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isLoading: boolean;
  canWrite: boolean;
  isParticipant: boolean;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole>(getStoredRole());
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

      const res = await api.auth.switchRole(targetRole);
      setStoredSession(res.token, res.user.role);
      setRole(res.user.role);
      setUser(res.user);
    } catch (err) {
      console.error('Failed to init auth session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initSession(role);
  }, []);

  const switchRole = async (newRole: UserRole) => {
    await initSession(newRole);
  };

  const loginAsSchool = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login(identifier, password);
      setStoredSession(res.token, 'participant');
      setRole('participant');
      setUser(res.user);
      return { mustChangePassword: res.mustChangePassword };
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (newPassword: string, currentPassword?: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.changePassword(newPassword, currentPassword);
      setStoredSession(res.token, 'participant');
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await initSession('viewer');
  };

  const canWrite = role === 'admin' || role === 'organizer';
  const isParticipant = role === 'participant';
  const mustChangePassword = !!user?.mustChangePassword;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        switchRole,
        loginAsSchool,
        changePassword,
        signOut,
        isLoading,
        canWrite,
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
