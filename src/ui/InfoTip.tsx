import { CircleHelpIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

interface InfoTipProps {
    text: string
}

/** Значок вопроса с подсказкой. */
export function InfoTip({ text }: InfoTipProps) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={<span />}
                className="inline-flex shrink-0 cursor-help text-muted-foreground"
            >
                <CircleHelpIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="top">{text}</TooltipContent>
        </Tooltip>
    );
}
