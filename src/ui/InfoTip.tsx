import { CircleHelpIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

interface InfoTipProps {
    text: string
}

/** Значок вопроса с подсказкой. */
export function InfoTip({ text }: InfoTipProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <CircleHelpIcon className="size-3.5 shrink-0 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top">{text}</TooltipContent>
        </Tooltip>
    );
}
