import React from 'react';

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
      <path
        d="M16 20H48M16 32H48M16 44H48"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 16L32 48"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="6" fill="white" />
    </svg>
  );
}; 