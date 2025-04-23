import React from 'react';

interface FusionIconProps extends React.SVGProps<SVGSVGElement> {}

export const FusionIcon: React.FC<FusionIconProps> = (props) => {
  return (
    <svg
      viewBox="0 0 128 128" // Use the original viewBox
      xmlns="http://www.w3.org/2000/svg"
      {...props} // Spread props to allow className, size, etc.
    >
      {/* Outer circle */}
      <circle
        style={{
          fill: 'none',
          stroke: 'currentColor', // Use currentColor for inherited color
          strokeWidth: 16, // Updated stroke width
          strokeLinejoin: 'bevel',
          strokeDasharray: 'none',
          strokeOpacity: 1,
        }}
        cx="64.274071" // Updated cx
        cy="63.5"
        r="48.438419"
      />
      {/* Left dot */}
      <circle
        style={{
          fill: 'currentColor', // Use currentColor
          fillOpacity: 1,
          stroke: 'none',
          strokeWidth: 14, // Updated stroke width
          strokeLinejoin: 'bevel',
          strokeDasharray: 'none',
          strokeOpacity: 1,
        }}
        cx="17.769901" // Updated cx
        cy="63.5"
        r="17" // Updated r
      />
      {/* Right dot */}
      <circle
        style={{
          fill: 'currentColor', // Use currentColor
          fillOpacity: 1,
          stroke: 'none',
          strokeWidth: 14, // Updated stroke width
          strokeLinejoin: 'bevel',
          strokeDasharray: 'none',
          strokeOpacity: 1,
        }}
        cx="110.87759" // Updated cx
        cy="63.5"
        r="17" // Updated r
      />
    </svg>
  );
};

export default FusionIcon; 