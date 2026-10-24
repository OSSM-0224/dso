import type { Metadata, Viewport } from "next";
import { AuthProvider } from "../context/AuthContext.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSO Navi Mumbai Fixtures",
  description:
    "Multi-sport fixture generation, bracket management, and tournament administration platform for District Sports Office (DSO) Navi Mumbai.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "DSO Navi Mumbai Fixtures",
    description:
      "Multi-sport fixture generation, bracket management, and tournament administration platform for District Sports Office (DSO) Navi Mumbai.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
