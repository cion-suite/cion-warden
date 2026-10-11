import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/release-notes.mjs');
const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(content: string | null, version: string) {
    const file = join(dir, 'log.md');
    if (content !== null) writeFileSync(file, content);
    const r = spawnSync(process.execPath, [SCRIPT, content === null ? join(dir, 'missing.md') : file, version], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
}

const LOG = '### Версия v1.1.0\n\n- Новое.\n- Ещё.\n\n---\n\n### Версия v1.0.0\n\n- Старое.\n';

describe('release-notes', () => {
    it('selftest скрипта проходит', () => {
        const r = spawnSync(process.execPath, [SCRIPT, '--selftest'], { encoding: 'utf8' });
        expect(r.status).toBe(0);
    });

    it('отдаёт тело раздела без заголовка', () => {
        expect(run(LOG, '1.1.0')).toMatchObject({ code: 0, out: '- Новое.\n- Ещё.\n' });
    });

    it('категории раздела входят в тело', () => {
        const log = '### Версия v1.1.0\n\n#### Важно знать\n\n- A.\n\n#### Интерфейс\n\n- B.\n\n---\n\n### Версия v1.0.0\n\n- C.\n';

        expect(run(log, '1.1.0')).toMatchObject({
            code: 0,
            out: '#### Важно знать\n\n- A.\n\n#### Интерфейс\n\n- B.\n',
        });
    });

    it('принимает версию с префиксом v', () => {
        expect(run(LOG, 'v1.0.0')).toMatchObject({ code: 0, out: '- Старое.\n' });
    });

    it('падает, если раздела нет', () => {
        const r = run(LOG, '2.0.0');
        expect(r.code).toBe(1);
        expect(r.err).toContain('релиз без лога не создаётся');
    });

    it('падает на пустом файле и на пустом разделе', () => {
        expect(run('', '1.0.0').code).toBe(1);
        expect(run('### Версия v1.0.0\n\n---\n', '1.0.0').code).toBe(1);
    });

    it('падает, если файла нет', () => {
        expect(run(null, '1.0.0').code).toBe(1);
    });
});
