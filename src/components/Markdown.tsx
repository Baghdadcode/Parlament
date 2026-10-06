import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Model output rendered as markdown. Raw HTML is not rendered (react-markdown default). */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mt-3 text-base font-semibold" {...p} />,
          h2: (p) => <h3 className="mt-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400" {...p} />,
          h3: (p) => <h4 className="mt-2 font-semibold" {...p} />,
          ul: (p) => <ul className="ml-5 list-disc space-y-1" {...p} />,
          ol: (p) => <ol className="ml-5 list-decimal space-y-1" {...p} />,
          a: (p) => <a className="underline" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.85em] dark:bg-zinc-800" {...p} />,
          table: (p) => <table className="w-full border-collapse text-left text-xs" {...p} />,
          th: (p) => <th className="border-b border-zinc-300 px-2 py-1 dark:border-zinc-700" {...p} />,
          td: (p) => <td className="border-b border-zinc-200 px-2 py-1 dark:border-zinc-800" {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
