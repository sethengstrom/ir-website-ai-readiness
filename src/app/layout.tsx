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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=typeof document!=='undefined'?document:null;var s=typeof localStorage!=='undefined'?localStorage:null;if(d&&s){var t=s.getItem('ir-theme');d.documentElement.dataset.theme=(t==='light')?'light':'dark';}})();`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
