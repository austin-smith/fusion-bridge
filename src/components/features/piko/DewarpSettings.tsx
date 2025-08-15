'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal } from 'lucide-react';
import type { DewarpSettings, LensModel } from '@/types/video-dewarp';

export interface DewarpSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DewarpSettings;
  onChange: (s: DewarpSettings) => void;
}

export const DewarpSettingsDialog: React.FC<DewarpSettingsDialogProps> = ({ 
  open, 
  onOpenChange, 
  settings, 
  onChange 
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Advanced Dewarp Settings
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Primary View Controls */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Field of View</Label>
              <p className="text-xs text-muted-foreground">How wide the output view should be</p>
              <div className="flex items-center gap-3">
                <Slider 
                  className="flex-1" 
                  min={30} max={150} step={1} 
                  value={[settings.fovDeg]} 
                  onValueChange={(v)=>onChange({ ...settings, fovDeg: v[0] ?? settings.fovDeg })} 
                />
                <Input 
                  className="h-8 w-16 text-right" 
                  value={Math.round(settings.fovDeg)} 
                  onChange={(e)=>{
                    const n = Number(e.currentTarget.value); 
                    if(!Number.isNaN(n)) onChange({ ...settings, fovDeg: Math.max(1, Math.min(170, n)) });
                  }} 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Yaw</Label>
                <p className="text-xs text-muted-foreground">Pan left/right</p>
                <Slider min={-180} max={180} step={1} value={[settings.yawDeg]} onValueChange={(v)=>onChange({ ...settings, yawDeg: v[0] ?? settings.yawDeg })} />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Pitch</Label>
                <p className="text-xs text-muted-foreground">Tilt up/down</p>
                <Slider min={-89} max={89} step={1} value={[settings.pitchDeg]} onValueChange={(v)=>onChange({ ...settings, pitchDeg: v[0] ?? settings.pitchDeg })} />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Roll</Label>
                <p className="text-xs text-muted-foreground">Rotate image</p>
                <Slider min={-180} max={180} step={1} value={[settings.rollDeg]} onValueChange={(v)=>onChange({ ...settings, rollDeg: v[0] ?? settings.rollDeg })} />
              </div>
            </div>
          </div>

          {/* Lens Calibration */}
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label className="text-sm font-medium">Lens Calibration</Label>
              <p className="text-xs text-muted-foreground">Advanced settings for specific fisheye lenses</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Lens Model</Label>
                <p className="text-xs text-muted-foreground">Mathematical model for lens distortion</p>
                <Select value={settings.lensModel} onValueChange={(v)=> onChange({ ...settings, lensModel: v as LensModel })}>
                  <SelectTrigger className="w-full text-left">
                    <SelectValue placeholder="Lens model">
                      {settings.lensModel === 'equidistant' && 'Equidistant'}
                      {settings.lensModel === 'equisolid' && 'Equisolid'}
                      {settings.lensModel === 'orthographic' && 'Orthographic'}
                      {settings.lensModel === 'stereographic' && 'Stereographic'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equidistant">
                      <div>
                        <div>Equidistant</div>
                        <div className="text-xs text-muted-foreground">Standard fisheye - distance from center proportional to angle</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="equisolid">
                      <div>
                        <div>Equisolid</div>
                        <div className="text-xs text-muted-foreground">Equal area projection - preserves relative sizes</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="orthographic">
                      <div>
                        <div>Orthographic</div>
                        <div className="text-xs text-muted-foreground">Wide angle lenses - sine projection</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="stereographic">
                      <div>
                        <div>Stereographic</div>
                        <div className="text-xs text-muted-foreground">Perspective projection - preserves angles</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Optical Center & Focal Length</Label>
                <p className="text-xs text-muted-foreground">Fine-tune lens center position and distortion strength</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Center X</Label>
                    <Input 
                      placeholder="auto" 
                      className="h-8" 
                      value={settings.cx ?? ''} 
                      onChange={(e)=>{
                        const n = Number(e.currentTarget.value); 
                        onChange({ ...settings, cx: Number.isNaN(n) ? undefined : n });
                      }} 
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Center Y</Label>
                    <Input 
                      placeholder="auto" 
                      className="h-8" 
                      value={settings.cy ?? ''} 
                      onChange={(e)=>{
                        const n = Number(e.currentTarget.value); 
                        onChange({ ...settings, cy: Number.isNaN(n) ? undefined : n });
                      }} 
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Focal (px)</Label>
                    <Input 
                      placeholder="auto" 
                      className="h-8" 
                      value={settings.focalPx ?? ''} 
                      onChange={(e)=>{
                        const n = Number(e.currentTarget.value); 
                        onChange({ ...settings, focalPx: Number.isNaN(n) ? undefined : n });
                      }} 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};