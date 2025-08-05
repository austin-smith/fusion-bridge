import React, { useEffect, useState } from 'react';
import { WeatherIcon } from '@/components/ui/weather-icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type { WeatherData } from '@/types/openweather-types';

interface LocationWeatherIconProps {
  locationId: string;
}

export function LocationWeatherIcon({ locationId }: LocationWeatherIconProps) {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeatherData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/locations/${locationId}/weather`);
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch weather data');
        }
        
        setWeatherData(data.data?.weather || null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        console.error(`Error fetching weather for location ${locationId}:`, message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWeatherData();
  }, [locationId]);

  if (!weatherData || error) {
    return isLoading ? (
      <div className="flex items-center gap-1">
        <div className="h-4 w-4 bg-muted/50 rounded-sm animate-pulse" />
        <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
        <div className="h-4 w-12 bg-muted/50 rounded animate-pulse" />
      </div>
    ) : null;
  }

  const primaryWeather = weatherData.weather[0];
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <WeatherIcon
            iconCode={primaryWeather?.icon}
            size="sm"
            isLoading={isLoading}
            hasError={!!error}
          />
          <span className="font-medium">
            {Math.round(weatherData.temperature)}°F
          </span>
          {primaryWeather?.main && (
            <span className="text-muted-foreground">
              {primaryWeather.main}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-center">
          {primaryWeather?.description && (
            <p className="font-medium capitalize">{primaryWeather.description}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {Math.round(weatherData.temperature)}°F
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
} 