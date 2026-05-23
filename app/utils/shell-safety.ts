// scripts:run uses `spawn(filePath, [], { shell: true })`, which on Windows
// invokes `cmd /d /s /c "<path>"` and parses metacharacters inside the path
// itself. A repo-published filename like `pwn & calc.exe.ahk` would otherwise
// turn the download flow into RCE the moment the user clicks Run.
const UNSAFE_SHELL_CHARS = /[&|<>^"`$;()\r\n\t]/;
// Manifest-side check is stricter: rejects `/` and `\` too, since a file
// name is one path segment and a slash would let upstream point at parent
// directories.
const UNSAFE_FILENAME_CHARS = /[&|<>^"`$;()\r\n\t\\/]/;

export function isSafeForShell(p: string): boolean {
    return !UNSAFE_SHELL_CHARS.test(p);
}

export function isSafeManifestFileName(name: string): boolean {
    return !UNSAFE_FILENAME_CHARS.test(name);
}
