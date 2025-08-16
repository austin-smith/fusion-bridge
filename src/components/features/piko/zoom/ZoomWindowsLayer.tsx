'use client';

import React from 'react';
import type { ZoomWindow } from '@/types/zoom-window';
import { ZoomWindowTile } from '@/components/features/piko/zoom/ZoomWindowTile';
import type { Layout } from 'react-grid-layout';
import type { HeaderStyle } from '@/types/play';

export interface ZoomWindowsLayerProps {
  windows: ZoomWindow[];
  layout: Layout[];
  locked: boolean;
  headerStyle: HeaderStyle;
  getSharedVideoEl: (sourceDeviceId: string) => HTMLVideoElement | null;
  onRemove: (id: string) => void;
}

export const ZoomWindowsLayer: React.FC<ZoomWindowsLayerProps> = ({
  windows,
  layout,
  locked,
  headerStyle,
  getSharedVideoEl,
  onRemove,
}) => {
  return (
    <>
      {windows.map((zw) => {
        return (
        <div key={zw.id} className="overflow-hidden grid-item-container">
          <div className="h-full w-full flex flex-col overflow-hidden rounded-lg">
            <div className="p-0 grow relative overflow-hidden rounded-b-lg">
              <ZoomWindowTile
                windowDef={zw}
                getSharedVideoEl={getSharedVideoEl}
                locked={locked}
                headerStyle={headerStyle}
                onRemove={onRemove}
              />
            </div>
          </div>
        </div>
        );
      })}
    </>
  );
};