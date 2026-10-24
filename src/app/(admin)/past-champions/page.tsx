'use client';

import React from 'react';

import { PastTournamentsScreen } from '@/features/history/PastTournamentsScreen.tsx';
import { useAuth } from '@/context/AuthContext.tsx';

export default function PastChampionsPage() {
  const { canWrite } = useAuth();

  return <PastTournamentsScreen canWrite={canWrite} />;
}
