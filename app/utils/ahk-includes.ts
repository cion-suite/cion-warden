// Extracts #Include directive targets from an AHK source string.
//
// Recognized forms:
//   #Include FileName
//   #Include "Quoted Path.ahk"
//   #Include *i FileName            ; *i flag (suppress missing-file error)
//   #IncludeAgain FileName
//
// Skipped intentionally:
//   #Include <FuncName>             ; library-function lookup, separate mechanism
//   #Include %Var%\...              ; dynamic paths can't be resolved statically
//
// Comment handling: only ` ;` (space + semicolon) is treated as a line comment —
// AHK's full comment rules are stricter (semicolons after non-whitespace are
// often literal), and being conservative here avoids dropping legitimate paths
// containing `;`.

const DIRECTIVE = /^[ \t]*#Include(?:Again)?\b/i;

export function parseAhkIncludes(content: string): string[] {
    const out: string[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        if (!DIRECTIVE.test(rawLine)) continue;
        const line = stripLineComment(rawLine).trim();
        let rest = line.replace(/^#Include(?:Again)?\b/i, '').trim();
        if (rest.startsWith('*')) {
            // `*i`, `*I` — option flag, drop it
            const sp = rest.search(/\s/);
            rest = sp === -1 ? '' : rest.slice(sp).trim();
        }
        if (!rest) continue;
        if (rest.startsWith('<')) continue;
        if (rest.includes('%')) continue;
        if (rest.startsWith('"')) {
            const end = rest.indexOf('"', 1);
            if (end > 1) out.push(rest.slice(1, end));
            continue;
        }
        out.push(rest);
    }
    return out;
}

function stripLineComment(line: string): string {
    const idx = line.indexOf(' ;');
    return idx >= 0 ? line.slice(0, idx) : line;
}
