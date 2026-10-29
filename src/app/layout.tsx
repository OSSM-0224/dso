import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono, Fraunces } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "../context/AuthContext.tsx";
import { LanguageProvider } from "../i18n/LanguageProvider.tsx";
import "./globals.css";

/**
 * Font Awesome Free kit. `data-auto-replace-svg="nest"` is REQUIRED: the kit
 * keeps the React-rendered <i> element in the DOM and nests its SVG inside it
 * (instead of replacing the node, which crashes React hydration).
 */
const FONT_AWESOME_KIT_URL = "https://kit.fontawesome.com/2aee0f29a0.js";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${jakartaSans.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}
    >
      <body
        className="bg-canvas text-ink antialiased font-sans"
        suppressHydrationWarning
      >
        <AuthProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </AuthProvider>
        <Script
          src={FONT_AWESOME_KIT_URL}
          crossOrigin="anonymous"
          strategy="afterInteractive"
          data-auto-replace-svg="nest"
        />
      </body>
    </html>
  );
}
