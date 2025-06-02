'use client';

import React, { useEffect, useState } from 'react';
import { useFusionStore } from '@/stores/store';
import type { ArmingSchedule } from '@/stores/store'; // Using the type from the store
import { Button } from '@/components/ui/button';
// DataTable and ColumnDef are no longer needed
import { PlusCircle, MoreHorizontal, CalendarClock, Clock, Check, X, Pencil, Trash2, ArrowRight } from 'lucide-react'; 
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from 'sonner';
import { ScheduleFormDialog } from '@/components/features/alarm/ScheduleFormDialog';
import { PageHeader } from '@/components/layout/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"; // <<< Added Card imports
import { Badge } from "@/components/ui/badge"; // <<< Added Badge import
import { format, parse } from 'date-fns'; // <<< Import format and parse from date-fns
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// TODO: Define Create/Edit Schedule Dialog/Sheet component
// const ScheduleFormDialog = ({ open, onOpenChange, schedule, onSuccess }) => { ... };

const ArmingSchedulesPage: React.FC = () => {
  const {
    armingSchedules,
    isLoadingArmingSchedules,
    fetchArmingSchedules,
    deleteArmingSchedule,
  } = useFusionStore((state) => ({
    armingSchedules: state.armingSchedules,
    isLoadingArmingSchedules: state.isLoadingArmingSchedules,
    fetchArmingSchedules: state.fetchArmingSchedules,
    deleteArmingSchedule: state.deleteArmingSchedule,
  }));

  // State for managing the Create/Edit Dialog
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ArmingSchedule | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<ArmingSchedule | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    fetchArmingSchedules();
  }, [fetchArmingSchedules]);

  const handleOpenCreateDialog = () => {
    setEditingSchedule(null); // Ensure it's in create mode
    setIsScheduleDialogOpen(true);
  };

  const handleEditSchedule = (schedule: ArmingSchedule) => {
    setEditingSchedule(schedule);
    setIsScheduleDialogOpen(true);
  };

  const handleDeleteSchedule = async () => {
    if (!scheduleToDelete) return;

    setIsDeleting(true);
    const success = await deleteArmingSchedule(scheduleToDelete.id);
    if (success) {
      toast.success(`Schedule "${scheduleToDelete.name}" deleted successfully.`);
    } else {
      // Error toast is handled within the store action
    }
    setIsDeleting(false);
    setScheduleToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const handleOpenDeleteDialog = (schedule: ArmingSchedule) => {
    setScheduleToDelete(schedule);
    setIsDeleteDialogOpen(true);
  };

  const handleDialogSuccess = () => {
    fetchArmingSchedules(); // Refetch schedules on successful save
  };

  const getDayName = (dayIndex: number): string => {
    // Create a date that falls on the given dayIndex (0 for Sunday, 1 for Monday, etc.)
    // Using a known Sunday (e.g., 2023-01-01) and adding dayIndex days to it.
    const baseSunday = new Date(2023, 0, 1); // January 1, 2023, is a Sunday
    const targetDate = new Date(baseSunday);
    targetDate.setDate(baseSunday.getDate() + dayIndex);
    return format(targetDate, 'EEE'); // E.g., 'Sun', 'Mon'
  };

  const formatDaysOfWeek = (days: number[]): string => {
    const sortedDays = [...days].sort((a, b) => a - b);
    const daySet = new Set(sortedDays);

    const isEveryDay = daySet.size === 7 && [0, 1, 2, 3, 4, 5, 6].every(d => daySet.has(d));
    if (isEveryDay) return 'Every Day';

    const isWeekdays = daySet.size === 5 && [1, 2, 3, 4, 5].every(d => daySet.has(d));
    if (isWeekdays) return 'Weekdays';

    const isWeekends = daySet.size === 2 && [0, 6].every(d => daySet.has(d));
    if (isWeekends) return 'Weekends';

    return sortedDays.map(d => getDayName(d)).join(', ');
  };

  const formatDisplayTime = (timeString: string): string => {
    try {
      const date = parse(timeString, 'HH:mm', new Date());
      return format(date, 'h:mm a');
    } catch (error) {
      console.warn(`Invalid time string for formatting: ${timeString}`, error);
      return timeString; // Fallback to original string if parsing fails
    }
  };

  // Get status color class based on enabled state
  const getStatusColorClass = (enabled: boolean): string => {
    return enabled 
      ? 'bg-green-500/20 text-green-600 border border-green-500/20' 
      : 'bg-slate-300/20 text-slate-500 border border-slate-300/20';
  };

  return (
    <TooltipProvider>
      <div className="container mx-auto py-10">
        <PageHeader
          title="Arming Schedules"
          description="Manage your arming and disarming schedules."
          icon={<CalendarClock className="h-6 w-6" />}
          actions={
            <Button onClick={handleOpenCreateDialog} size="sm">
              <PlusCircle className="h-4 w-4" /> New Schedule
            </Button>
          }
        />

        <ScheduleFormDialog 
          open={isScheduleDialogOpen} 
          onOpenChange={setIsScheduleDialogOpen} 
          schedule={editingSchedule}
          onSuccess={handleDialogSuccess}
        />

        {isLoadingArmingSchedules && armingSchedules.length === 0 && (
          <div className="text-center py-10">Loading schedules...</div> // Basic loading indicator
        )}
        {!isLoadingArmingSchedules && armingSchedules.length === 0 && (
          <Card className="mt-6">
            <CardContent className="py-10 flex flex-col items-center text-center">
              <CalendarClock className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Arming Schedules Yet</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating a new arming schedule.
              </p>
            </CardContent>
          </Card>
        )}
        {armingSchedules.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
            {armingSchedules.map((schedule) => (
              <Card 
                key={schedule.id}
                className="transition-all hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg font-semibold">{schedule.name}</CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>{formatDaysOfWeek(schedule.daysOfWeek)}</span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditSchedule(schedule)}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit schedule</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit schedule</p>
                        </TooltipContent>
                      </Tooltip>
                      
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleOpenDeleteDialog(schedule)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete schedule</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete schedule</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-col gap-2 mb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Schedule Time</div>
                    <div className="relative flex items-center gap-2 pl-1">
                      <div className="flex items-center">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                        <span className="text-xs">{formatDisplayTime(schedule.armTimeLocal)}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex items-center">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                        <span className="text-xs">{formatDisplayTime(schedule.disarmTimeLocal)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 pb-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${getStatusColorClass(schedule.isEnabled)}`}>
                        {schedule.isEnabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {schedule.isEnabled ? 'Schedule is active' : 'Schedule is inactive'}
                    </TooltipContent>
                  </Tooltip>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the schedule
                <span className="font-semibold"> {scheduleToDelete?.name}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting} onClick={() => setScheduleToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteSchedule} 
                disabled={isDeleting} 
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default ArmingSchedulesPage; 