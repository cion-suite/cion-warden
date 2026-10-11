// Менеджер тостов и лог подменены: читаем ушедший тост
import { describe, it, expect, vi, beforeEach } from 'vitest';

const manager = vi.hoisted(() => ({
    add: vi.fn((options: { id?: string; type?: string; title?: unknown }) => options.id ?? 'generated'),
    close: vi.fn(),
}));
const logError = vi.hoisted(() => vi.fn());

vi.mock('@/ui/shadcn/toast', () => ({ toast: manager, Toaster: () => null }));
vi.mock('@cion-suite/core/renderer', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@cion-suite/core/renderer')>()),
    logger: { error: logError },
}));

import { errors } from '@cion-suite/core/renderer';
import { toast } from '@/ui/toast';

const reject = (message: string) => Promise.reject(new Error(message));

const shown = () => manager.add.mock.calls.map(([{ type, title }]) => `${type}: ${title}`);

beforeEach(() => {
    manager.add.mockClear();
    manager.close.mockClear();
    logError.mockClear();
});

describe('toast.result', () => {
    it('success строкой -> тост с этой строкой, true', async () => {
        const done = await toast.result(Promise.resolve(), { success: 'Готово', error: 'Не удалось сделать' });

        expect(done).toBe(true);
        expect(shown()).toEqual(['success: Готово']);
    });

    it('success функцией получает результат операции', async () => {
        await toast.result(Promise.resolve({ name: 'G1' }), {
            success: (r) => `Создана ${r.name}`,
            error: 'Не удалось создать',
        });

        expect(shown()).toEqual(['success: Создана G1']);
    });

    it('success не задан или пустой текст -> без тоста, true', async () => {
        expect(await toast.result(Promise.resolve(), { error: 'Не удалось' })).toBe(true);
        expect(await toast.result(Promise.resolve(1), { success: () => '', error: 'Не удалось' })).toBe(true);
        expect(shown()).toEqual([]);
    });

    it('reject: не бросает, показывает "фраза: причина", возвращает false', async () => {
        const done = await toast.result(reject('сеть пропала'), { error: 'Не удалось переместить' });

        expect(done).toBe(false);
        expect(shown()).toEqual(['error: Не удалось переместить: сеть пропала']);
        expect(logError).toHaveBeenCalledWith(
            'Не удалось переместить',
            expect.objectContaining({ message: 'сеть пропала' }),
        );
    });

    it('снимает префикс Electron с причины и не логирует отказ из main', async () => {
        await toast.result(reject("Error invoking remote method 'updater:refresh': Error: [failed] Нет сети"), {
            error: 'Не удалось проверить',
        });

        expect(shown()).toEqual(['error: Не удалось проверить: Нет сети']);
        expect(logError).not.toHaveBeenCalled();
    });

    it('reject со строкой -> причина - эта строка', async () => {
        await toast.result(Promise.reject('строка'), { error: 'Не удалось сделать' });

        expect(shown()).toEqual(['error: Не удалось сделать: строка']);
    });
});

describe('toast.error', () => {
    it('без cause - только фраза, лога нет', () => {
        toast.error('Не удалось сохранить');

        expect(shown()).toEqual(['error: Не удалось сохранить']);
        expect(logError).not.toHaveBeenCalled();
    });

    it('локальная ошибка - в лог фраза и сама ошибка', () => {
        const cause = new Error('диск полон');
        toast.error('Не удалось сохранить', { cause });

        expect(shown()).toEqual(['error: Не удалось сохранить: диск полон']);
        expect(logError).toHaveBeenCalledWith('Не удалось сохранить', cause);
    });

    it('errors.fail с кодом - в лог', () => {
        toast.error('Не удалось запустить', { cause: errors.fail('failed', 'VM упала') });

        expect(shown()).toEqual(['error: Не удалось запустить: VM упала']);
        expect(logError).toHaveBeenCalledTimes(1);
    });

    it('id и прочие опции уходят в менеджер, cause - нет', () => {
        const onClick = vi.fn();
        toast.error('Не удалось подключиться', {
            id: 'loading-1',
            duration: Infinity,
            action: { label: 'Повторить', onClick },
            cause: new Error('x'),
        });

        const [options] = manager.add.mock.calls[0];
        expect(options).toMatchObject({
            id: 'loading-1',
            type: 'error',
            title: 'Не удалось подключиться: x',
            timeout: 0,
            actionProps: { children: 'Повторить', onClick },
        });
        expect(options).not.toHaveProperty('cause');
    });

    it('duration уходит в timeout как есть', () => {
        toast.info('Привет', { duration: 1500 });

        expect(manager.add.mock.calls[0][0]).toMatchObject({ timeout: 1500 });
    });
});

describe('toast.close', () => {
    it('закрывает тост по id через менеджер', () => {
        toast.close('job');

        expect(manager.close).toHaveBeenCalledWith('job');
    });
});

describe('toast: дедупликация', () => {
    it('одинаковый текст без id получает один и тот же id', () => {
        const first = toast.info('Привет');
        const second = toast.info('Привет');

        expect(second).toBe(first);
    });

    it('явный id возвращается как есть и заменяет тост', () => {
        const id = toast.loading('Загрузка', { id: 'job' });
        toast.success('Готово', { id });

        expect(id).toBe('job');
        expect(manager.add).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'job', type: 'success', title: 'Готово' }));
    });
});
