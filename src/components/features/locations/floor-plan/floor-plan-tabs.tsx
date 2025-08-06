'use client';

import React, { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [floorPlanToRename, setFloorPlanToRename] = useState<FloorPlan | null>(null);
  const [newName, setNewName] = useState('');

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
    setFloorPlanToRename(floorPlan);
    setNewName(floorPlan.name);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (floorPlanToRename && newName.trim() && newName.trim() !== floorPlanToRename.name) {
      await onFloorPlanUpdate(floorPlanToRename.id, newName.trim());
      setRenameDialogOpen(false);
      setFloorPlanToRename(null);
      setNewName('');
    }
  };

  const handleRenameCancel = () => {
    setRenameDialogOpen(false);
    setFloorPlanToRename(null);
    setNewName('');
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

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Floor Plan</DialogTitle>
            <DialogDescription>
              Enter a new name for &ldquo;{floorPlanToRename?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="col-span-3"
                placeholder="Enter floor plan name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRenameConfirm();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleRenameCancel();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleRenameCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleRenameConfirm}
              disabled={!newName.trim() || newName.trim() === floorPlanToRename?.name}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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