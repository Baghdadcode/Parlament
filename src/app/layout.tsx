import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Emblem } from "../components/Emblem";
import { SoundToggle } from "../components/SoundToggle";
import { getKeyStatus, getMembers } from "../server/runtime";

export const metadata: Metadata = { title: "Parlament", description: "Fråga riksdagen: partiledarna debatterar och röstar fram ett beslut." };
export const dynamic = "force-dynamic";

const NAV = [
  ["/", "Fråga"],
  ["/sessions", "Protokoll"],
  ["/ledamoter", "Ledamöter"],
  ["/bakgrund", "Bakgrund"],
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await getKeyStatus();
  const members = getMembers();
  return (
    <html lang="sv">
      <body className="flex min-h-screen flex-col">
        <header className="no-print border-b-2 border-riks-gold bg-riks-navy text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Emblem />
              <span className="leading-none">
                <span className="block font-serif text-lg font-semibold tracking-wide">Parlament</span>
                <span className="block text-[10px] uppercase tracking-[0.25em] text-riks-gold-soft/80">Kammaren · simulering</span>
              </span>
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-300">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-white">
                  {label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {status.ok && status.fake && (
                <span
                  title="PARLAMENT_FAKE=1: inga API-anrop, påhittade svar, separat databas"
                  className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900"
                >
                  Offline-läge (fejk)
                </span>
              )}
              <SoundToggle />
            </div>
          </div>
        </header>
        {!status.ok && (
          <div role="alert" className="no-print border-b border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">Ingen AI-nyckel fungerar, så riksdagen kan inte sammanträda.</p>
              <p className="mt-1">
                Lägg minst en av <code>ANTHROPIC_API_KEY=...</code> (Claude, från console.anthropic.com; ett Claude.ai-abonnemang fungerar inte) och{" "}
                <code>GEMINI_API_KEY=...</code> (Gemini, från aistudio.google.com/apikey) i <code>.env.local</code> i projektmappen, och starta om{" "}
                <code>npm run dev</code>.
              </p>
            </div>
          </div>
        )}
        {(["anthropic", "google"] as const).map((p) => {
          const s = status.providers[p];
          // A key that is set but rejected deserves a banner; a missing key only greys out its models in the picker.
          if (s.ok || s.missing) return null;
          return (
            <div key={p} role="alert" className="no-print border-b border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="mx-auto max-w-6xl px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
                <span className="font-semibold">{p === "google" ? "Gemini" : "Claude"}-nyckeln fungerar inte:</span> {s.error}
              </div>
            </div>
          );
        })}
        {!members.ok && (
          <div role="alert" className="no-print border-b border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">En ledamotsfil i members/ går inte att läsa.</p>
              <p className="mt-1 font-mono text-xs">{members.error}</p>
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="no-print mx-auto w-full max-w-6xl px-4 pb-6 text-[11px] text-zinc-500">
          Simulering. Partiledarna är AI-personor (Claude) byggda på partiernas offentliga hållning; de är inte de verkliga personernas åsikter. Appen
          är inte knuten till Sveriges riksdag.
        </footer>
      </body>
    </html>
  );
}
