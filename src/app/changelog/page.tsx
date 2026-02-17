import fs from "fs";
import path from "path";
import Link from "next/link";

export const metadata = {
  title: "Changelog | IR AI Readiness Scanner",
  description: "Version history and release notes for the IR AI Readiness Scanner.",
};

export default function ChangelogPage() {
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const content = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, "utf-8")
    : "Changelog not found.";

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] bg-[var(--card)]/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-sm text-[var(--accent)] hover:opacity-90"
          >
            ← Back to scanner
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mt-2">
            Changelog
          </h1>
          <p className="text-[var(--muted)] text-base mt-1">
            Version history and release notes
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--foreground)] bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 overflow-x-auto">
          {content}
        </pre>
        <p className="mt-4">
          <Link href="/" className="text-[var(--accent)] hover:opacity-90 text-sm">
            ← Back to scanner
          </Link>
        </p>
      </main>
    </div>
  );
}
