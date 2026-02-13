import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IR AI Readiness Scanner",
  description: "Compare two domains for investor relations AI/agent retrieval readiness",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
