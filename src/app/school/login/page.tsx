'use client';

/**
 * School portal login. Shows the very same School Login modal the admin
 * header used, now as a standalone page under /school (no DSO menu).
 */
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { SchoolLoginModal } from '@/features/participant/SchoolLoginModal.tsx';
import { ForcePasswordChangeModal } from '@/features/participant/ForcePasswordChangeModal.tsx';
import { useAuth } from '@/context/AuthContext.tsx';

export default function SchoolLoginPage() {
  const router = useRouter();
  const { isParticipant, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isParticipant) {
      router.replace('/school/dashboard');
    }
  }, [isParticipant, isLoading, router]);

  return (
    <div className="min-h-screen bg-slate-50">
      <SchoolLoginModal
        isOpen
        onClose={() => router.push('/')}
        onSuccess={() => {
          router.push('/school/dashboard');
        }}
      />
      <ForcePasswordChangeModal />
    </div>
  );
}
