import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { logger } from '@cion-suite/core';

const log = logger.child('Fonts');

const KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';
const WM_FONTCHANGE = 0x001d;

const quote = (text: string): string => text.replace(/'/g, "''");
const list = (paths: string[]): string => paths.map(item => `  '${quote(item)}'`).join(',\n');

function script(load: string[], unload: string[]): string {
    return `Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class _FT_ {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceW(string p);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int RemoveFontResourceW(string p);
  [DllImport("user32.dll")] public static extern int SendMessageTimeoutA(int hWnd, int msg, int wp, int lp, int flags, int timeout, out int result);
}
'@
$loads = @(
${list(load)}
)
$unloads = @(
${list(unload)}
)
foreach ($p in $loads) { [_FT_]::AddFontResourceW($p) | Out-Null }
foreach ($p in $unloads) { [_FT_]::RemoveFontResourceW($p) | Out-Null }
$o = 0
[_FT_]::SendMessageTimeoutA(-1, ${WM_FONTCHANGE}, 0, 0, 0, 1000, [ref]$o) | Out-Null
`;
}

/** Шрифты пользователя: значения HKCU и оповещение системы. */
export const registry = {
    // Значение реестра с id источника: два источника с Arial.ttf
    // не затрут запись друг друга
    name(sourceId: string, face: string, fileName: string): string {
        const kind = path.extname(fileName).toLowerCase() === '.otf' ? 'OpenType' : 'TrueType';
        return `[${sourceId.slice(0, 8)}] ${face} (${kind})`;
    },

    add(name: string, fontPath: string): { ok: boolean; stderr: string } {
        const result = spawnSync(
            'reg.exe',
            ['add', KEY, '/v', name, '/t', 'REG_SZ', '/d', fontPath, '/f'],
            { encoding: 'utf-8' },
        );
        return { ok: result.status === 0, stderr: result.stderr ?? '' };
    },

    delete(name: string): void {
        spawnSync('reg.exe', ['delete', KEY, '/v', name, '/f'], { stdio: 'ignore' });
    },

    /** Грузит и выгружает шрифты, шлёт WM_FONTCHANGE. */
    broadcast(load: string[], unload: string[]): Promise<void> {
        if (load.length === 0 && unload.length === 0) return Promise.resolve();
        return new Promise((resolve) => {
            const child = spawn(
                'powershell',
                ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script(load, unload)],
                { stdio: 'ignore', windowsHide: true },
            );
            child.on('exit', () => resolve());
            child.on('error', (e) => {
                log.warn('Font broadcast spawn failed', e);
                resolve();
            });
        });
    },

    script,
};
