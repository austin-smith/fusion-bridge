'use client';

import React, { useState, useCallback } from 'react';
import { Upload, X, FileText, Image as ImageIcon, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FloorPlanUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  selectedFile: File | null;
  isUploading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FloorPlanUpload({
  onFileSelect,
  onFileRemove,
  selectedFile,
  isUploading = false,
  disabled = false,
  className
}: FloorPlanUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleFileValidation = useCallback((file: File) => {
    const errors: string[] = [];
    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf', 'image/svg+xml'];
    const maxBytes = 5 * 1024 * 1024;
    if (!allowedTypes.includes(file.type)) {
      errors.push('Unsupported file type. Allowed: PNG, JPG, PDF, SVG');
    }
    if (file.size > maxBytes) {
      errors.push('File is too large. Max size is 5MB');
    }
    if (errors.length === 0) {
      setValidationErrors([]);
      onFileSelect(file);
    } else {
      setValidationErrors(errors);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  }, [disabled, isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled || isUploading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileValidation(files[0]);
    }
  }, [disabled, isUploading, handleFileValidation]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileValidation(files[0]);
    }
    e.target.value = '';
  }, [handleFileValidation]);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="h-6 w-6" aria-hidden="true" />;
    } else if (file.type === 'application/pdf') {
      return <FileText className="h-6 w-6" aria-hidden="true" />;
    }
    return <File className="h-6 w-6" aria-hidden="true" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={cn("space-y-4", className)}>
      {!selectedFile ? (
        <Card
          className={cn(
            "border-2 border-dashed transition-colors cursor-pointer",
            isDragging && "border-primary bg-primary/5",
            disabled && "opacity-50 cursor-not-allowed",
            validationErrors.length > 0 && "border-destructive"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <Upload className={cn(
              "h-10 w-10 mb-4 text-muted-foreground",
              isDragging && "text-primary"
            )} />
            
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Drop your floor plan here, or{' '}
                <label className={cn(
                  "text-primary underline cursor-pointer",
                  disabled && "cursor-not-allowed"
                )}>
                  browse files
                  <input
                    type="file"
                    className="sr-only"
                    accept=".png,.jpg,.jpeg,.pdf,.svg"
                    onChange={handleFileInput}
                    disabled={disabled || isUploading}
                  />
                </label>
              </p>
              
              <p className="text-xs text-muted-foreground">
                PNG, JPG, PDF, or SVG up to 5MB
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              {getFileIcon(selectedFile)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            
            {!isUploading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onFileRemove}
                disabled={disabled}
                className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove file</span>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {validationErrors.length > 0 && (
        <div className="space-y-1">
          {validationErrors.map((error, index) => (
            <p key={index} className="text-sm text-destructive">
              {error}
            </p>
          ))}
        </div>
      )}

      {isUploading && selectedFile && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Uploading...</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div className="bg-primary h-2 rounded-full animate-pulse w-1/2" />
          </div>
        </div>
      )}
    </div>
  );
}


