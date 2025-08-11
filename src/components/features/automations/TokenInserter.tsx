'use client';

import * as React from 'react';
import { Code2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
    const [searchTerm, setSearchTerm] = React.useState('');

    // Filter tokens based on search term
    const filteredTokens = React.useMemo(() => {
        if (!searchTerm.trim()) return tokens;
        
        const lowerSearch = searchTerm.toLowerCase();
        return tokens.filter(token => 
            token.token.toLowerCase().includes(lowerSearch) ||
            token.description.toLowerCase().includes(lowerSearch) ||
            token.group.toLowerCase().includes(lowerSearch)
        );
    }, [tokens, searchTerm]);

    // Group tokens for display
    const groupedTokens = groupBy(filteredTokens, 'group');

    const handleTokenClick = (token: string) => {
        onInsert(token);
        setOpen(false); // Close popover after insertion
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setSearchTerm(''); // Clear search when closing
        }
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
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
            <PopoverContent className="w-80 h-[560px] p-0 flex flex-col" align="end">
                <div className="p-3 text-sm font-semibold border-b shrink-0">Available Tokens</div>
                
                {/* Search Input */}
                <div className="p-3 border-b shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search tokens..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-8"
                        />
                    </div>
                </div>

                <ScrollArea className="grow">
                    <div className="p-2">
                        {Object.keys(groupedTokens).length === 0 ? (
                            <div className="text-center text-muted-foreground text-sm py-4">
                                No tokens found matching &ldquo;{searchTerm}&rdquo;
                            </div>
                        ) : (
                            Object.entries(groupedTokens).map(([groupName, groupTokens], index) => (
                                <div key={groupName}>
                                    {index > 0 && <Separator className="my-2" />}
                                    <div className="px-2 py-1.5">
                                        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                                            {groupName}
                                        </h4>
                                    </div>
                                    <div className="px-1 pb-2 space-y-1">
                                        {groupTokens.map((token) => (
                                            <button
                                                key={token.token}
                                                type="button"
                                                onClick={() => handleTokenClick(token.token)}
                                                className="w-full text-left p-3 rounded-md hover:bg-accent hover:text-accent-foreground text-sm flex flex-col items-start transition-colors border border-transparent hover:border-border/50"
                                            >
                                                <span className="font-mono bg-secondary px-1.5 py-0.5 rounded text-xs font-medium">
                                                    {token.token}
                                                </span>
                                                <span className="text-muted-foreground text-xs mt-1.5 leading-tight" title={token.description}>
                                                    {token.description}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
} 