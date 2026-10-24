'use client';

import React from 'react';

import { TeamsScreen } from '@/features/teams/TeamsScreen.tsx';
import { useAuth } from '@/context/AuthContext.tsx';

export default function TeamsPage() {
  const { canWrite } = useAuth();

  return <TeamsScreen canWrite={canWrite} />;
}
