import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { EraserIcon, KeyboardIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@/ui/shadcn/context-menu';
import { Input } from '@/ui/shadcn/input';
import { keyBind } from './key-bind';

interface KeyBindInputProps {
    value: string
    onChange: (key: string) => void
    className?: string
}

const TAIL_RELEASE_MS = 100;

function swallow(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
}

// contextmenu и auxclick приходят после pointerup, click -
// элементу под курсором: хвост гасим, пока не отпустят кнопку
function swallowTail(button: number, onRelease: () => void): () => void {
    const swallowed = ['mouseup', 'click', 'auxclick', 'contextmenu'] as const;
    let timer: number | undefined;

    const release = () => {
        clearTimeout(timer);
        for (const type of swallowed) window.removeEventListener(type, swallow, { capture: true });
        window.removeEventListener('pointerup', onPointerUp, { capture: true });
        window.removeEventListener('pointerdown', release, { capture: true });
        window.removeEventListener('blur', release);
        onRelease();
    };

    const onPointerUp = (e: PointerEvent) => {
        swallow(e);
        if (e.button === button) timer = window.setTimeout(release, TAIL_RELEASE_MS);
    };

    for (const type of swallowed) window.addEventListener(type, swallow, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointerdown', release, { capture: true });
    window.addEventListener('blur', release);

    return release;
}

export function KeyBindInput({ value, onChange, className }: KeyBindInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const tailRef = useRef<(() => void) | null>(null);
    const [listening, setListening] = useState(false);
    const emit = useEffectEvent(onChange);

    useEffect(() => () => tailRef.current?.(), []);

    useEffect(() => {
        if (!listening) return;

        const commit = (key: string) => {
            setListening(false);
            emit(key);
            inputRef.current?.blur();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            commit(keyBind.key(e.key));
        };

        // Capture: диалог остаётся открытым. Эффект снимется до
        // pointerup - хвост нажатия гасит swallowTail
        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            swallow(e);
            const key = keyBind.button(e.button);
            if (!key) return;
            commit(key);
            tailRef.current = swallowTail(e.button, () => {
                tailRef.current = null;
            });
        };

        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('pointerdown', onPointerDown, { capture: true });

        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true });
            window.removeEventListener('pointerdown', onPointerDown, { capture: true });
        };
    }, [listening]);

    // Во время записи pointerdown глушит capture-слушатель выше
    const handlePointerDown = (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        setListening(true);
    };

    const choose = (key: string) => {
        onChange(key);
        inputRef.current?.blur();
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger
                render={
                    <Input
                        ref={inputRef}
                        value={listening ? '[-]' : value}
                        readOnly
                        placeholder="—"
                        onPointerDown={handlePointerDown}
                        onBlur={() => setListening(false)}
                        className={cn(
                            'h-8 w-27 cursor-pointer text-center font-mono text-sm',
                            listening && 'border-destructive text-destructive focus-visible:ring-destructive/30',
                            className,
                        )}
                    />
                }
            />
            <ContextMenuContent>
                <ContextMenuItem onClick={() => choose('Escape')}>
                    <KeyboardIcon data-icon="inline-start" />
                    Bind &quot;Escape&quot;
                </ContextMenuItem>
                <ContextMenuItem onClick={() => choose('')}>
                    <EraserIcon data-icon="inline-start" />
                    Remove bind
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
