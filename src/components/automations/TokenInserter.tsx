'use client';

import * as React from 'react';
import { Code2, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import type { AutomationToken } from '@/lib/automation-tokens';
import { cn } from '@/lib/utils';
import { groupBy } from 'lodash-es'; // Using lodash for grouping

interface TokenInserterProps {
    tokens: AutomationToken[];
    onInsert: (token: string) => void;
    className?: string;
}

export function TokenInserter({ tokens, onInsert, className }: TokenInserterProps) {
    const [open, setOpen] = React.useState(false);

    // Group tokens for display
    const groupedTokens = groupBy(tokens, 'group');

    const handleTokenClick = (token: string) => {
        onInsert(token);
        setOpen(false); // Close popover after insertion
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button" // Prevent form submission
                    variant="outline"
                    size="sm"
                    className={cn("gap-1 text-muted-foreground", className)}
                    title="Insert Token"
                >
                    <Code2 className="h-4 w-4" />
                    <span>Insert Token</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 h-96 p-0 flex flex-col" align="end">
                <div className="p-2 text-sm font-semibold border-b flex-shrink-0">Available Tokens</div>
                <ScrollArea className="flex-grow">
                    <div className="p-2">
                        {Object.entries(groupedTokens).map(([groupName, groupTokens]) => (
                            <div key={groupName} className="mb-3 last:mb-0">
                                <h4 className="text-xs font-bold text-muted-foreground uppercase mb-1.5 px-2">{groupName}</h4>
                                <ul className="space-y-1">
                                    {groupTokens.map((token) => (
                                        <li key={token.token}>
                                            <button
                                                type="button"
                                                onClick={() => handleTokenClick(token.token)}
                                                className="w-full text-left p-2 rounded hover:bg-accent text-sm flex flex-col items-start"
                                            >
                                                <span className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{token.token}</span>
                                                <span className="text-muted-foreground text-xs mt-1" title={token.description}>{token.description}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
} 