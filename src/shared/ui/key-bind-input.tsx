import { useEffect, useRef, useState } from 'react';
import { Eraser, Keyboard } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@/shared/ui/shadcn/context-menu';
import { Input } from '@/shared/ui/shadcn/input';

function normalizeKey(e: KeyboardEvent): string {
    switch (e.key) {
        case ' ':          return 'Space';
        case 'Control':    return 'Ctrl';
        case 'ArrowUp':    return 'Up';
        case 'ArrowDown':  return 'Down';
        case 'ArrowLeft':  return 'Left';
        case 'ArrowRight': return 'Right';
        case 'PageDown':   return 'PgDn';
        case 'PageUp':     return 'PgUp';
        default:           return e.key;
    }
}

function normalizeButton(button: number): string {
    switch (button) {
        case 0: return 'LButton';
        case 1: return 'MButton';
        case 2: return 'RButton';
        case 3: return 'XButton1';
        case 4: return 'XButton2';
        default: return '';
    }
}

interface KeyBindInputProps {
    value: string;
    onChange: (key: string) => void;
    className?: string;
}

export function KeyBindInput({ value, onChange, className }: KeyBindInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [listening, setListening] = useState(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    useEffect(() => {
        if (!listening) return;

        const commit = (key: string) => {
            setListening(false);
            onChangeRef.current(key);
            inputRef.current?.blur();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            commit(normalizeKey(e));
        };

        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            // preventDefault stops focus transfer + XButton navigation.
            // stopPropagation in capture stops Radix's document-level listener
            // (dialog stays open) and prevents local handlePointerDown from firing
            // (no re-enable loop).
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const key = normalizeButton(e.button);
            if (key) commit(key);
        };

        // Belt-and-suspenders: suppress XButton navigation that fires on pointerup
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

    // Only fires when NOT listening — global capture intercepts pointerdown
    // (stopPropagation in capture) before it reaches the element when listening.
    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return; // only left-click starts listening
        setListening(true);
    };

    const handleBlur = () => setListening(false);

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <Input
                    ref={inputRef}
                    value={listening ? '[-]' : value}
                    readOnly
                    placeholder="—"
                    onPointerDown={handlePointerDown}
                    onBlur={handleBlur}
                    className={cn(
                        'h-8 w-24 cursor-pointer text-center font-mono text-sm',
                        listening && 'border-red-500 text-red-500 focus-visible:ring-red-500/30',
                        className,
                    )}
                />
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem
                    onSelect={() => {
                        onChangeRef.current('Escape');
                        inputRef.current?.blur();
                    }}
                >
                    <Keyboard data-icon="inline-start" />
                    Bind &quot;Escape&quot;
                </ContextMenuItem>
                <ContextMenuItem
                    onSelect={() => {
                        onChangeRef.current('');
                        inputRef.current?.blur();
                    }}
                >
                    <Eraser data-icon="inline-start" />
                    Remove bind
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
