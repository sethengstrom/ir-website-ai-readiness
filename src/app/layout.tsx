import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: "IR AI Readiness Scanner",
  description: "See how ready your IR site is for AI to answer investor questions. Compare domains and get actionable improvements.",
  openGraph: {
    title: "IR AI Readiness Scanner",
    description: "See how ready your IR site is for AI to answer investor questions. Compare domains and get actionable improvements.",
    siteName: "IR AI Readiness Scanner",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IR AI Readiness Scanner",
    description: "See how ready your IR site is for AI to answer investor questions. Compare domains and get actionable improvements.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen font-sans">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-50 -translate-y-16 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[var(--background)]"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
