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

export function KeyBindInput({ value, onChange, className }: KeyBindInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [listening, setListening] = useState(false);
    const emit = useEffectEvent(onChange);

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

        // Перехват в capture: диалог Radix остаётся открытым,
        // а preventDefault гасит переход по XButton
        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const key = keyBind.button(e.button);
            if (key) commit(key);
        };

        const onPointerUp = (e: PointerEvent) => {
            if (e.button === 3 || e.button === 4) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('pointerdown', onPointerDown, { capture: true });
        window.addEventListener('pointerup', onPointerUp, { capture: true });
        window.addEventListener('contextmenu', onContextMenu, { capture: true });

        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true });
            window.removeEventListener('pointerdown', onPointerDown, { capture: true });
            window.removeEventListener('pointerup', onPointerUp, { capture: true });
            window.removeEventListener('contextmenu', onContextMenu, { capture: true });
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
            <ContextMenuTrigger asChild>
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
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onSelect={() => choose('Escape')}>
                    <KeyboardIcon data-icon="inline-start" />
                    Bind &quot;Escape&quot;
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => choose('')}>
                    <EraserIcon data-icon="inline-start" />
                    Remove bind
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
