'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useFusionStore } from '@/stores/store';
import type { Area } from '@/types/index'; // Import Area from types instead of store
import { ArmedState, ArmedStateDisplayNames } from '@/lib/mappings/definitions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, ShieldOff, SkipForward, Info } from 'lucide-react';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';

interface AreaStatusDisplayProps {
  area: Area;
  compact?: boolean;
}

const AreaStatusDisplay: React.FC<AreaStatusDisplayProps> = ({ area, compact = false }) => {
  const { armArea, disarmArea, skipNextArmForArea } = useFusionStore(
    (state) => ({ 
      armArea: state.armArea, 
      disarmArea: state.disarmArea, 
      skipNextArmForArea: state.skipNextArmForArea 
    })
  );

  const [isLoadingArm, setIsLoadingArm] = useState(false);
  const [isLoadingDisarm, setIsLoadingDisarm] = useState(false);
  const [isLoadingSkip, setIsLoadingSkip] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const nextTransitionTimeISO = useMemo(() => {
    if (area.armedState === ArmedState.DISARMED || area.armedState === ArmedState.TRIGGERED) {
      return area.nextScheduledArmTime;
    } else if (area.armedState === ArmedState.ARMED) {
      return area.nextScheduledDisarmTime;
    }
    return null;
  }, [area.armedState, area.nextScheduledArmTime, area.nextScheduledDisarmTime]);

  const nextTransitionType = useMemo(() => {
    if (area.armedState === ArmedState.DISARMED || area.armedState === ArmedState.TRIGGERED) {
      return 'Arm';
    }
    return 'Disarm';
  }, [area.armedState]);

  useEffect(() => {
    if (!nextTransitionTimeISO) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      try {
        const targetDate = parseISO(nextTransitionTimeISO);
        if (targetDate > new Date()) {
          setCountdown(formatDistanceToNowStrict(targetDate, { addSuffix: true }));
        } else {
          setCountdown(null); // Time has passed
        }
      } catch (e) {
        console.error("Error parsing date for countdown:", nextTransitionTimeISO, e);
        setCountdown("Invalid date");
      }
    };

    calculateCountdown();
    const intervalId = setInterval(calculateCountdown, 10000); // Update every 10 seconds

    return () => clearInterval(intervalId);
  }, [nextTransitionTimeISO]);

  const handleArm = async () => {
    setIsLoadingArm(true);
    await armArea(area.id);
    setIsLoadingArm(false);
  };

  const handleDisarm = async () => {
    setIsLoadingDisarm(true);
    await disarmArea(area.id);
    setIsLoadingDisarm(false);
  };

  const handleSkip = async () => {
    setIsLoadingSkip(true);
    await skipNextArmForArea(area.id);
    setIsLoadingSkip(false);
  };

  const canArm = area.armedState === ArmedState.DISARMED || area.armedState === ArmedState.TRIGGERED;
  const canDisarm = area.armedState === ArmedState.ARMED || area.armedState === ArmedState.TRIGGERED;
  const canSkip = area.armedState === ArmedState.DISARMED && !!area.nextScheduledArmTime && new Date(area.nextScheduledArmTime) > new Date();
  
  const isSkipped = area.isArmingSkippedUntil && new Date(area.isArmingSkippedUntil) > new Date();

  const getStatusBadgeVariant = (): "default" | "destructive" | "outline" | "secondary" => {
    switch (area.armedState) {
      case ArmedState.ARMED:
        return 'default';
      case ArmedState.DISARMED:
        return 'secondary';
      case ArmedState.TRIGGERED:
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const StatusIcon = () => {
    switch (area.armedState) {
      case ArmedState.ARMED:
        return <Shield className="h-5 w-5 text-green-500" />;
      case ArmedState.DISARMED:
        return <ShieldOff className="h-5 w-5 text-gray-500" />;
      case ArmedState.TRIGGERED:
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-yellow-500" />;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIcon />
          <div>
            <Badge 
              variant={getStatusBadgeVariant()} 
              className="ml-2 whitespace-nowrap"
            >
              <StatusIcon />
              <span className="ml-1.5">{ArmedStateDisplayNames[area.armedState as ArmedState] || String(area.armedState)}</span>
            </Badge>
          </div>
        </div>
        
        {countdown && (
          <div className="flex items-center text-xs text-muted-foreground">
            <span>
              {nextTransitionType}s in {countdown}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{area.name}</CardTitle>
            <Badge variant={getStatusBadgeVariant()} className="ml-2 whitespace-nowrap">
                <StatusIcon />
                <span className="ml-1.5">{ArmedStateDisplayNames[area.armedState as ArmedState] || String(area.armedState)}</span>
            </Badge>
        </div>
        {area.locationName && <CardDescription>Location: {area.locationName}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {area.lastArmedStateChangeReason && (
            <p className="text-xs text-muted-foreground">
              Reason: {area.lastArmedStateChangeReason}
            </p>
          )}
          {isSkipped && area.isArmingSkippedUntil && (
            <p className="text-xs text-yellow-600">
              Next arming is skipped until {formatDistanceToNowStrict(parseISO(area.isArmingSkippedUntil), { addSuffix: true })}
            </p>
          )}
          {countdown && (
            <p className="text-sm font-medium">
              {nextTransitionType}s {countdown}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {canArm && (
              <Button onClick={handleArm} disabled={isLoadingArm} size="sm" variant="outline">
                {isLoadingArm ? 'Arming...' : 'Arm Now'}
              </Button>
            )}
            {canDisarm && (
              <Button onClick={handleDisarm} disabled={isLoadingDisarm} size="sm" variant="outline">
                {isLoadingDisarm ? 'Disarming...' : 'Disarm Now'}
              </Button>
            )}
            {canSkip && !isSkipped && (
              <Button onClick={handleSkip} disabled={isLoadingSkip} size="sm" variant="ghost" className="text-xs">
                <SkipForward className="mr-1 h-4 w-4" />
                {isLoadingSkip ? 'Skipping...' : 'Skip Next Arm'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AreaStatusDisplay; 