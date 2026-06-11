import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer for assistant chat bubbles. Tailwind preflight strips
 * default list/heading styles, so each element gets explicit classes sized
 * for the text-sm bubble. User messages stay plain text.
 */
export function CoachMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
        h1: ({ children }) => <h3 className="font-display font-bold text-base mt-3 first:mt-0 mb-1">{children}</h3>,
        h2: ({ children }) => <h3 className="font-display font-bold text-base mt-3 first:mt-0 mb-1">{children}</h3>,
        h3: ({ children }) => <h4 className="font-display font-semibold mt-3 first:mt-0 mb-1">{children}</h4>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
             className="text-primary-600 dark:text-primary-400 underline">
            {children}
          </a>
        ),
        code: ({ children, className }) => (
          className ? (
            // Block code (inside pre) — pre handles the box
            <code className="font-mono text-xs">{children}</code>
          ) : (
            <code className="bg-gray-100 dark:bg-surface-900 px-1 py-0.5 rounded font-mono text-[0.85em]">
              {children}
            </code>
          )
        ),
        pre: ({ children }) => (
          <pre className="bg-gray-100 dark:bg-surface-900 rounded-lg p-3 mb-2 last:mb-0 overflow-x-auto">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2 last:mb-0">
            <table className="text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-gray-200 dark:border-surface-700 px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-200 dark:border-surface-700 px-2 py-1">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 dark:border-surface-700 pl-3 mb-2 last:mb-0 text-gray-600 dark:text-gray-400">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-gray-200 dark:border-surface-700" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
