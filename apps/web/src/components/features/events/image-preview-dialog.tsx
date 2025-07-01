'use client';

import React from 'react';
import {
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogClose
} from '@/components/ui/dialog';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

interface ImagePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  imageUrl?: string | null;
  imageAlt?: string;
  title?: string;
}

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  imageUrl, 
  imageAlt = 'Preview',
  title = 'Image Preview'
}) => {
  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] xl:max-w-[50vw] p-0 aspect-video flex flex-col">
        <DialogHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg font-medium">{title}</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <div className="relative flex-grow w-full h-full p-4 pt-0">
          <Image 
            src={imageUrl} 
            alt={imageAlt} 
            fill 
            className="object-contain" 
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}; 