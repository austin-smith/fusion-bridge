'use client';

import React, { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { FloorPlan } from '@/types';

interface FloorPlanTabsProps {
  floorPlans: FloorPlan[];
  activeFloorPlanId: string | null;
  onFloorPlanSelect: (id: string) => void;
  onFloorPlanUpdate: (id: string, name?: string, file?: File) => Promise<void>;
  onFloorPlanDelete: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export function FloorPlanTabs({
  floorPlans,
  activeFloorPlanId,
  onFloorPlanSelect,
  onFloorPlanUpdate,
  onFloorPlanDelete,
  isLoading = false
}: FloorPlanTabsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [floorPlanToDelete, setFloorPlanToDelete] = useState<FloorPlan | null>(null);

  const handleDeleteClick = (floorPlan: FloorPlan) => {
    setFloorPlanToDelete(floorPlan);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (floorPlanToDelete) {
      await onFloorPlanDelete(floorPlanToDelete.id);
      setDeleteDialogOpen(false);
      setFloorPlanToDelete(null);
    }
  };

  const handleRenameClick = (floorPlan: FloorPlan) => {
    // This would trigger a rename dialog in the parent component
    // For now, we'll use a simple prompt
    const newName = prompt('Enter new name for floor plan:', floorPlan.name);
    if (newName && newName.trim() && newName !== floorPlan.name) {
      onFloorPlanUpdate(floorPlan.id, newName.trim());
    }
  };

  if (floorPlans.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {floorPlans.map((floorPlan) => (
          <div key={floorPlan.id} className="flex items-center gap-1">
            <Button
              variant={activeFloorPlanId === floorPlan.id ? "default" : "outline"}
              size="sm"
              onClick={() => onFloorPlanSelect(floorPlan.id)}
              disabled={isLoading}
              className="h-9"
            >
              {floorPlan.name}
              {floorPlans.length === 1 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Only
                </Badge>
              )}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0"
                  disabled={isLoading}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Floor plan options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleRenameClick(floorPlan)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleDeleteClick(floorPlan)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Floor Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{floorPlanToDelete?.name}&rdquo;? 
              This will also remove all device positions on this floor plan. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}