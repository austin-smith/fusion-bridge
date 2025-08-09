'use client';

import React, { useState } from 'react';
import { Upload } from 'lucide-react';
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
import { FloorPlanUpload } from '@/components/features/locations/floor-plan/floor-plan-upload';

interface FloorPlanUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, file: File) => Promise<void>;
  isLoading?: boolean;
}

export function FloorPlanUploadDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false
}: FloorPlanUploadDialogProps) {
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedFile || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim(), selectedFile);
      setName('');
      setSelectedFile(null);
    } catch (error) {
      console.error('Error submitting floor plan:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    if (!name.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setName(baseName);
    }
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setName('');
        setSelectedFile(null);
      }
    }
  };

  const canSubmit = !!name.trim() && !!selectedFile && !isSubmitting && !isLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Floor Plan</DialogTitle>
            <DialogDescription>
              Upload a floor plan image or PDF for this location.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="floor-plan-name">Floor Plan Name</Label>
              <Input
                id="floor-plan-name"
                type="text"
                placeholder="e.g., First Floor, Basement, etc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting || isLoading}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label>Floor Plan File</Label>
              <FloorPlanUpload
                onFileSelect={handleFileSelect}
                onFileRemove={handleFileRemove}
                selectedFile={selectedFile}
                isUploading={isSubmitting || isLoading}
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
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting || isLoading ? (
                <>
                  <Upload className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Floor Plan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}



