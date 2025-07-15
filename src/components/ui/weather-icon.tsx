import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Loader2, CloudOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface WeatherIconProps {
  /** Weather icon code from OpenWeather API (e.g., "01d", "10n") */
  iconCode?: string;
  /** Weather description for alt text and tooltip */
  description?: string;
  /** Temperature to display in tooltip */
  temperature?: number;
  /** Size of the icon */
  size?: 'sm' | 'md' | 'lg';
  /** Whether data is loading */
  isLoading?: boolean;
  /** Error state */
  hasError?: boolean;
  /** Custom class names */
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function WeatherIcon({ 
  iconCode, 
  description, 
  temperature, 
  size = 'md', 
  isLoading = false,
  hasError = false,
  className 
}: WeatherIconProps) {
  const iconSize = sizeMap[size];
  
  if (isLoading) {
    return (
      <div className={cn(iconSize, 'flex items-center justify-center', className)}>
        <Loader2 className="h-full w-full animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (hasError || !iconCode) {
    return (
      <div className={cn(iconSize, 'flex items-center justify-center', className)}>
        <CloudOff className="h-full w-full text-muted-foreground" />
      </div>
    );
  }
  
  const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  const altText = description || 'Weather condition';
  
  const iconElement = (
    <Image
      src={iconUrl}
      alt={altText}
      width={size === 'sm' ? 16 : size === 'md' ? 24 : 32}
      height={size === 'sm' ? 16 : size === 'md' ? 24 : 32}
      className={cn(iconSize, 'object-contain', className)}
      onError={(e) => {
        // Fallback to CloudOff icon if image fails to load
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        const fallback = target.nextElementSibling as HTMLElement;
        if (fallback) {
          fallback.style.display = 'flex';
        }
      }}
    />
  );
  
  const fallbackElement = (
    <div className={cn(iconSize, 'items-center justify-center', 'hidden')} style={{ display: 'none' }}>
      <CloudOff className="h-full w-full text-muted-foreground" />
    </div>
  );
  
  if (description || temperature !== undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            {iconElement}
            {fallbackElement}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            {description && <p className="font-medium">{description}</p>}
            {temperature !== undefined && (
              <p className="text-sm text-muted-foreground">
                {Math.round(temperature)}°F
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <div className="relative">
      {iconElement}
      {fallbackElement}
    </div>
  );
} 