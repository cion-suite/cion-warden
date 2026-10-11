import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Separator } from '@/ui/shadcn/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/shadcn/table';
import { cn } from '@/lib/utils';

// Preflight сбросил типографику: вернуть нужное логам
const COMPONENTS: Components = {
    h1: ({ children }) => <h1 className="text-xl font-semibold tracking-tight">{children}</h1>,
    h2: ({ children }) => <h2 className="text-lg font-semibold tracking-tight">{children}</h2>,
    h3: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
    h4: ({ children }) => <h4 className="text-sm font-semibold">{children}</h4>,
    h5: ({ children }) => <h5 className="text-sm font-medium">{children}</h5>,
    h6: ({ children }) => <h6 className="text-sm font-medium text-muted-foreground">{children}</h6>,
    p: ({ children }) => <p className="text-pretty">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    ul: ({ children }) => (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-muted-foreground">{children}</ol>
    ),
    blockquote: ({ children }) => (
        <blockquote className="flex flex-col gap-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
    ),
    hr: () => <Separator />,
    code: ({ children }) => (
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[length:inherit]">
            {children}
        </pre>
    ),
    table: ({ children }) => (
        <div className="rounded-lg border">
            <Table>{children}</Table>
        </div>
    ),
    thead: ({ children }) => <TableHeader>{children}</TableHeader>,
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ children }) => <TableHead>{children}</TableHead>,
    td: ({ children }) => <TableCell className="whitespace-normal">{children}</TableCell>,
};

/** Markdown (GFM) без ссылок: клик по href увёл бы окно. */
export function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={cn('flex flex-col gap-3 text-sm leading-relaxed text-foreground/90', className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={COMPONENTS}
                disallowedElements={['a']}
                unwrapDisallowed
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
