'use client';

import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface SortIconProps {
  isSorted: false | 'asc' | 'desc';
}

// A simple component for sort indicators
export function SortIcon({ isSorted }: SortIconProps) {
  if (!isSorted) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
  return isSorted === 'asc' ? 
    <ArrowUp className="ml-2 h-4 w-4" /> : 
    <ArrowDown className="ml-2 h-4 w-4" />;
} 