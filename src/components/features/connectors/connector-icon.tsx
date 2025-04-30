import React from 'react';
import Image from 'next/image';
import { formatConnectorCategory } from '@/lib/utils'; // For fallback text

// Map connector keys to icon paths and display names
const connectorIconMap: Record<string, { src: string; name: string }> = {
  yolink: { src: '/yolink.png', name: 'YoLink' },
  piko: { src: '/piko.png', name: 'Piko' },
  netbox: { src: '/lenel-s2.png', name: 'NetBox' },
  genea: { src: '/genea.png', name: 'Genea' },
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
    <Image
      src={connectorInfo.src}
      alt={connectorInfo.name}
      width={size}
      height={size}
      className={`object-contain inline-block ${className || ''}`}
    />
  );
} 