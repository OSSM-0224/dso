'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { ParticipantPortalScreen } from '@/features/participant/ParticipantPortalScreen.tsx';

export default function SchoolDashboardPage() {
  return <ParticipantPortalScreen initialTab="dashboard" />;
}
