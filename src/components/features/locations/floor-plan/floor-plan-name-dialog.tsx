'use client';

import React, { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FloorPlanNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
  currentName: string;
  isLoading?: boolean;
}

export function FloorPlanNameDialog({
  open,
  onOpenChange,
  onSubmit,
  currentName,
  isLoading = false
}: FloorPlanNameDialogProps) {
  const [name, setName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update name when currentName changes
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || name.trim() === currentName || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim());
    } catch (error) {
      console.error('Error renaming floor plan:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
      
      // Reset form when closing
      if (!newOpen) {
        setName(currentName);
      }
    }
  };

  const canSubmit = name.trim() && name.trim() !== currentName && !isSubmitting && !isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Floor Plan</DialogTitle>
            <DialogDescription>
              Enter a new name for this floor plan.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="floor-plan-name">Floor Plan Name</Label>
              <Input
                id="floor-plan-name"
                type="text"
                placeholder="e.g., First Floor, Second Floor, etc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting || isLoading}
                autoFocus
                required
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
            >
              {isSubmitting || isLoading ? (
                <>
                  <Pencil className="h-4 w-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}