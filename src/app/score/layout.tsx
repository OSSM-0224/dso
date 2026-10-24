'use client';

/**
 * Dedicated LIVE SCORER chrome — standalone, outside the (admin) shell.
 */
import React from 'react';
import { ScorerShell } from '@/features/scoring/ScorerShell.tsx';

export default function ScorerGroupLayout({ children }: { children: React.ReactNode }) {
  return <ScorerShell>{children}</ScorerShell>;
}
