const DIRECTIVE = /^[ \t]*#Include(?:Again)?\b/i;

// Комментарий - только ` ;`: точка с запятой после
// непробела в AHK часто литерал, путь терять нельзя
function stripComment(line: string): string {
    const index = line.indexOf(' ;');
    return index >= 0 ? line.slice(0, index) : line;
}

/**
 * Цели #Include и #IncludeAgain из текста AHK. Без `<Func>`
 * и путей с `%Var%`: статически не разрешить.
 */
function includes(content: string): string[] {
    const out: string[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        if (!DIRECTIVE.test(rawLine)) continue;
        let rest = stripComment(rawLine).trim().replace(/^#Include(?:Again)?\b/i, '').trim();
        // Флаг `*i` отбрасываем
        if (rest.startsWith('*')) {
            const space = rest.search(/\s/);
            rest = space === -1 ? '' : rest.slice(space).trim();
        }
        if (rest === '' || rest.startsWith('<') || rest.includes('%')) continue;
        if (rest.startsWith('"')) {
            const end = rest.indexOf('"', 1);
            if (end > 1) out.push(rest.slice(1, end));
            continue;
        }
        out.push(rest);
    }
    return out;
}

export const ahk = { includes };
