'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Brain } from 'lucide-react';
import { NaturalLanguageSearch } from './NaturalLanguageSearch';
import type { QueryResults } from '@/types/ai/natural-language-query-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NaturalLanguageSearchDialogProps {
  onResults?: (results: QueryResults) => void;
}

export function NaturalLanguageSearchDialog({ onResults }: NaturalLanguageSearchDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleResults = (results: QueryResults) => {
    onResults?.(results);
    // Keep dialog open so user can see results and try more queries
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                <Brain className="h-4 w-4" />
                <span className="sr-only">AI Search</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>AI Search - Ask questions in natural language</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            AI-Powered Event Search
          </DialogTitle>
          <DialogDescription>
            Ask questions about your events, devices, and system status in plain English
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          <NaturalLanguageSearch 
            onResults={handleResults}
            className="border-0 shadow-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
} 