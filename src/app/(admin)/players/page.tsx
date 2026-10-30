'use client';

import React from 'react';

import { PlayersScreen } from '@/features/players/PlayersScreen.tsx';
import { useAuth } from '@/context/AuthContext.tsx';

export default function PlayersPage() {
  const { canWrite, user } = useAuth();

  return <PlayersScreen canWrite={canWrite} user={user} />;
}
