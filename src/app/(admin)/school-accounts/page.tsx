'use client';

import React from 'react';

import { ParticipantAccountsPanel } from '@/features/admin/ParticipantAccountsPanel.tsx';
import { useAdminPortal } from '../admin-shell';

export default function SchoolAccountsPage() {
  const { schools, reloadSchools, viewAsSchool } = useAdminPortal();

  return (
    <ParticipantAccountsPanel
      schools={schools}
      onAccountCreated={reloadSchools}
      onViewAsSchool={(acc) => viewAsSchool(acc)}
    />
  );
}
