'use client';

import React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Crop } from 'lucide-react';

export const ZoomMenuItem: React.FC<{
  disabled?: boolean;
  onSelect: () => void;
}> = ({ disabled, onSelect }) => {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => {
        if (!disabled) onSelect();
      }}
    >
      <Crop className="mr-2 h-4 w-4" />
      Zoom Window
    </DropdownMenuItem>
  );
};