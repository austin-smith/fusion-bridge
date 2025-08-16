'use client';

import React from 'react';
import type { HeaderStyle } from '@/types/play';
import { Box, Building } from 'lucide-react';

export interface TileHeaderProps {
  headerStyle: HeaderStyle;
  icon: React.ReactNode;
  title?: string;
  spaceName?: string;
  locationName?: string;
  actions?: React.ReactNode;
}

export const TileHeader: React.FC<TileHeaderProps> = ({
  headerStyle,
  icon,
  title,
  spaceName,
  locationName,
  actions,
}) => {
  const isOverlay = headerStyle !== 'standard';
  const hoverClasses = headerStyle === 'overlay-hover'
    ? 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity'
    : '';

  const Left = (
    <div className="min-w-0 flex items-center gap-1.5 text-xs">
      <span className={isOverlay ? 'text-white/80' : 'text-muted-foreground'}>
        {icon}
      </span>
      {title ? <span className="truncate">{title}</span> : null}
      {spaceName ? (
        <>
          <span className={isOverlay ? 'text-white/60' : 'text-muted-foreground'}>•</span>
          <span className={`inline-flex items-center gap-1 truncate ${isOverlay ? 'text-white/80' : 'text-muted-foreground'}`}>
            <Box className="h-3.5 w-3.5" />
            <span className="truncate">{spaceName}</span>
          </span>
        </>
      ) : null}
      {locationName ? (
        <>
          <span className={isOverlay ? 'text-white/60' : 'text-muted-foreground'}>•</span>
          <span className={`inline-flex items-center gap-1 truncate ${isOverlay ? 'text-white/80' : 'text-muted-foreground'}`}>
            <Building className="h-3.5 w-3.5" />
            <span className="truncate">{locationName}</span>
          </span>
        </>
      ) : null}
    </div>
  );

  if (!isOverlay) {
    return (
      <div className="px-2 py-1.5 shrink-0 bg-black text-white rounded-t-lg flex items-center justify-between gap-2">
        {Left}
        {actions}
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 top-0">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.38)_38%,rgba(0,0,0,0.14)_78%,rgba(0,0,0,0)_100%)] backdrop-blur-[2px] z-0"
        aria-hidden="true"
      />
      <div className={`relative z-20 px-2 py-1 flex items-center justify-between gap-2 text-white ${hoverClasses}`}>
        {Left}
        {actions}
      </div>
    </div>
  );
};