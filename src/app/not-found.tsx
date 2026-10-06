import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-2 text-sm">
      <h1 className="text-lg font-semibold">Hittades inte</h1>
      <p className="text-zinc-500">Den sessionen finns inte, eller så avbröts den när servern startades om.</p>
      <Link href="/" className="text-indigo-600 hover:underline">
        Tillbaka till frågan
      </Link>
    </div>
  );
}
