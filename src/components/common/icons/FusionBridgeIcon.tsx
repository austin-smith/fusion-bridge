import React from 'react';
import { LuMerge } from 'react-icons/lu';

interface FusionBridgeIconProps {
  size?: number;
  color?: string;
}

export const FusionBridgeIcon: React.FC<FusionBridgeIconProps> = ({ 
  size = 64, 
  color = '#4F46E5' 
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="12" fill={color} />
      <foreignObject width="64" height="64">
        <div className="flex items-center justify-center w-full h-full">
          <LuMerge color="white" size={size * 0.6} />
        </div>
      </foreignObject>
    </svg>
  );
}; 