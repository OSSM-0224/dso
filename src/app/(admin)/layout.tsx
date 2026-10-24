import type { Metadata } from "next";

import { AdminShell } from "./admin-shell";

export const metadata: Metadata = {
  title: "DSO Navi Mumbai Fixtures",
};

export default function AdminGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AdminShell>{children}</AdminShell>;
}
