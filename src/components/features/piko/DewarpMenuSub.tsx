'use client';

import React from 'react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Aperture, SlidersHorizontal } from 'lucide-react';

interface DewarpMenuSubProps {
  enabled: boolean;
  onToggleEnabled: () => void;
  onOpenSettings: () => void;
}

export const DewarpMenuSub: React.FC<DewarpMenuSubProps> = ({
  enabled,
  onToggleEnabled,
  onOpenSettings,
}) => {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Aperture className="mr-2 h-4 w-4" />
        Dewarp
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleEnabled();
          }}
        >
          <Aperture className="mr-2 h-4 w-4" />
          {enabled ? 'Disable dewarp' : 'Enable dewarp'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onOpenSettings()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenSettings();
          }}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Advanced
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};