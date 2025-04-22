import React from 'react';
import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatConnectorCategory } from '@/lib/utils'; // For fallback text

// Map connector keys to icon paths and display names
const connectorIconMap: Record<string, { src: string; name: string }> = {
  yolink: { src: '/yolink.png', name: 'YoLink' },
  piko: { src: '/piko.png', name: 'Piko' },
  // Add more connectors here as needed
};

interface ConnectorIconProps {
  connectorCategory: string; // e.g., 'yolink', 'piko'
  size?: number;
  className?: string;
}

export function ConnectorIcon({ connectorCategory, size = 16, className }: ConnectorIconProps) {
  const connectorInfo = connectorIconMap[connectorCategory?.toLowerCase()];

  if (!connectorInfo) {
    // Fallback for unknown categories
    return <span className={className}>{formatConnectorCategory(connectorCategory)}</span>;
  }

  return (
    // Ensure TooltipProvider exists higher up in the tree where this is used
    <Tooltip>
      <TooltipTrigger asChild>
        <Image
          src={connectorInfo.src}
          alt={connectorInfo.name}
          width={size}
          height={size}
          className={`object-contain inline-block ${className || ''}`}
        />
      </TooltipTrigger>
      <TooltipContent>{connectorInfo.name}</TooltipContent>
    </Tooltip>
  );
} 