import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getKeyStatus, getMembers } from "../server/runtime";

export const metadata: Metadata = { title: "Parlament", description: "Fråga riksdagen: partiledarna debatterar och röstar fram ett svar." };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await getKeyStatus();
  const members = getMembers();
  return (
    <html lang="sv">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Parlament
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">Fråga</Link>
              <Link href="/sessions" className="hover:text-zinc-900 dark:hover:text-zinc-100">Historik</Link>
              <Link href="/ledamoter" className="hover:text-zinc-900 dark:hover:text-zinc-100">Ledamöter</Link>
              <Link href="/bakgrund" className="hover:text-zinc-900 dark:hover:text-zinc-100">Bakgrund</Link>
            </nav>
            {status.ok && status.fake && (
              <span
                title="PARLAMENT_FAKE=1: inga API-anrop, påhittade svar, separat databas"
                className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              >
                Offline-läge (fejk)
              </span>
            )}
          </div>
        </header>
        {!status.ok && (
          <div role="alert" className="border-b border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">Anthropic-nyckeln fungerar inte, så riksdagen kan inte sammanträda.</p>
              <p className="mt-1">{status.error}</p>
              <p className="mt-1">
                Lägg <code>ANTHROPIC_API_KEY=...</code> i <code>.env.local</code> i projektmappen, med en nyckel från console.anthropic.com (ett
                Claude.ai-abonnemang fungerar inte), och starta om <code>npm run dev</code>.
              </p>
            </div>
          </div>
        )}
        {!members.ok && (
          <div role="alert" className="border-b border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">En ledamotsfil i members/ går inte att läsa.</p>
              <p className="mt-1 font-mono text-xs">{members.error}</p>
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-[11px] text-zinc-400">
          Partiledarna är AI-simuleringar (Claude) byggda på partiernas offentliga hållning. De är inte de verkliga personernas åsikter.
        </footer>
      </body>
    </html>
  );
}
