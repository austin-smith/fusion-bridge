import { useState, useCallback } from 'react';
import type { DewarpSettings } from '@/types/video-dewarp';

const DEFAULT_DEWARP_SETTINGS: DewarpSettings = {
  lensModel: 'equidistant',
  fovDeg: 90,
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
};

export interface DewarpDeviceState {
  enabled: boolean;
  settings: DewarpSettings;
}

export interface UseDewarpControlsReturn {
  dewarpById: Record<string, DewarpDeviceState>;
  enableDewarp: (deviceId: string, settings?: DewarpSettings) => void;
  disableDewarp: (deviceId: string) => void;
  toggleDewarp: (deviceId: string) => void;
  updateSettings: (deviceId: string, settings: DewarpSettings) => void;
  getSettings: (deviceId: string) => DewarpSettings;
  isEnabled: (deviceId: string) => boolean;
}

export function useDewarpControls(): UseDewarpControlsReturn {
  const [dewarpById, setDewarpById] = useState<Record<string, DewarpDeviceState>>({});

  const enableDewarp = useCallback((deviceId: string, settings = DEFAULT_DEWARP_SETTINGS) => {
    setDewarpById((prev) => ({
      ...prev,
      [deviceId]: { enabled: true, settings }
    }));
  }, []);

  const disableDewarp = useCallback((deviceId: string) => {
    setDewarpById((prev) => {
      const current = prev[deviceId];
      if (!current) return prev;
      return {
        ...prev,
        [deviceId]: { ...current, enabled: false }
      };
    });
  }, []);

  const toggleDewarp = useCallback((deviceId: string) => {
    setDewarpById((prev) => {
      const current = prev[deviceId];
      if (current?.enabled) {
        return { ...prev, [deviceId]: { ...current, enabled: false } };
      }
      return { 
        ...prev, 
        [deviceId]: { 
          enabled: true, 
          settings: current?.settings || DEFAULT_DEWARP_SETTINGS 
        } 
      };
    });
  }, []);

  const updateSettings = useCallback((deviceId: string, settings: DewarpSettings) => {
    setDewarpById((prev) => ({
      ...prev,
      [deviceId]: {
        enabled: true, // Auto-enable when updating settings
        settings
      }
    }));
  }, []);

  const getSettings = useCallback((deviceId: string): DewarpSettings => {
    return dewarpById[deviceId]?.settings || DEFAULT_DEWARP_SETTINGS;
  }, [dewarpById]);

  const isEnabled = useCallback((deviceId: string): boolean => {
    return Boolean(dewarpById[deviceId]?.enabled);
  }, [dewarpById]);

  return {
    dewarpById,
    enableDewarp,
    disableDewarp,
    toggleDewarp,
    updateSettings,
    getSettings,
    isEnabled
  };
}
