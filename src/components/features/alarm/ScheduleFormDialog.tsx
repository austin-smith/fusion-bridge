'use client';

import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFusionStore } from '@/stores/store';
import type { ArmingSchedule, NewArmingScheduleData, UpdateArmingScheduleData } from '@/stores/store';

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import { format, parse } from "date-fns";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

const scheduleFormSchema = z.object({
  name: z.string().min(1, { message: "Schedule name is required." }),
  daysOfWeek: z.array(z.number().min(0).max(6))
    .min(1, { message: "At least one day must be selected." }),
  armTimeLocal: z.string().regex(timeRegex, { message: "Invalid arm time. Use HH:MM format." }),
  disarmTimeLocal: z.string().regex(timeRegex, { message: "Invalid disarm time. Use HH:MM format." }),
  isEnabled: z.boolean().default(true),
});

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: ArmingSchedule | null; // For editing
  onSuccess?: () => void;
}

export const ScheduleFormDialog: React.FC<ScheduleFormDialogProps> = ({ open, onOpenChange, schedule, onSuccess }) => {
  const { addArmingSchedule, updateArmingSchedule } = useFusionStore((state) => ({
    addArmingSchedule: state.addArmingSchedule,
    updateArmingSchedule: state.updateArmingSchedule,
  }));

  const isEditMode = !!schedule;

  const form = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      name: '',
      daysOfWeek: [],
      armTimeLocal: '09:00',
      disarmTimeLocal: '17:00',
      isEnabled: true,
    },
  });

  useEffect(() => {
    if (schedule && open) {
      form.reset({
        name: schedule.name,
        // Ensure daysOfWeek from DB (numbers) are converted to strings for ToggleGroup value if needed
        // For this setup, numbers are fine as ToggleGroupItem value can be string, and we map to number.
        daysOfWeek: schedule.daysOfWeek || [], 
        armTimeLocal: schedule.armTimeLocal,
        disarmTimeLocal: schedule.disarmTimeLocal,
        isEnabled: schedule.isEnabled,
      });
    } else if (!schedule && open) {
      form.reset({
        name: '',
        daysOfWeek: [],
        armTimeLocal: '09:00',
        disarmTimeLocal: '17:00',
        isEnabled: true,
      });
    }
  }, [schedule, open, form]);

  const onSubmit = async (data: ScheduleFormData) => {
    let success = false;
    if (isEditMode && schedule) {
      const result = await updateArmingSchedule(schedule.id, data as UpdateArmingScheduleData);
      if (result) success = true;
    } else {
      const result = await addArmingSchedule(data as NewArmingScheduleData);
      if (result) success = true;
    }

    if (success) {
      onSuccess?.();
      onOpenChange(false); // Close dialog on success
    }
    // Toasts for success/error are handled in the store actions
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Arming Schedule' : 'Create New Arming Schedule'}</DialogTitle>
          <DialogDescription>
            {isEditMode ? 'Modify the details of your arming schedule.' : 'Set up a new recurring arming schedule.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div>
            <Label htmlFor="name">Schedule Name</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., Weekday Evenings" />
            {form.formState.errors.name && (
              <p className="text-sm text-red-500 mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label>Days of the Week</Label>
            <Controller
              name="daysOfWeek"
              control={form.control}
              render={({ field }) => (
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  value={field.value.map(String)} // ToggleGroup expects string values
                  onValueChange={(selectedStringValues) => {
                    field.onChange(selectedStringValues.map(Number)); // Convert back to numbers
                  }}
                  className="flex flex-wrap gap-1 mt-1"
                >
                  {dayLabels.map((day, index) => (
                    <ToggleGroupItem key={day} value={String(index)} aria-label={day} className="px-3 py-1.5 h-auto text-xs">
                      {day}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            {form.formState.errors.daysOfWeek && (
              <p className="text-sm text-red-500 mt-1">{form.formState.errors.daysOfWeek.message}</p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="armTimeLocal">Arm Time</Label>
              <Controller
                name="armTimeLocal"
                control={form.control}
                render={({ field }) => (
                  <div className="relative">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {field.value 
                            ? format(parse(field.value, 'HH:mm', new Date()), 'h:mm a')
                            : "Select time"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Input
                              id="armTime"
                              type="time"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-full"
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              />
              {form.formState.errors.armTimeLocal && (
                <p className="text-sm text-red-500 mt-1">{form.formState.errors.armTimeLocal.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="disarmTimeLocal">Disarm Time</Label>
              <Controller
                name="disarmTimeLocal"
                control={form.control}
                render={({ field }) => (
                  <div className="relative">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {field.value 
                            ? format(parse(field.value, 'HH:mm', new Date()), 'h:mm a')
                            : "Select time"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3 space-y-2">
                          <div className="flex items-center space-x-2">
                            <Input
                              id="disarmTime"
                              type="time"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-full"
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              />
              {form.formState.errors.disarmTimeLocal && (
                <p className="text-sm text-red-500 mt-1">{form.formState.errors.disarmTimeLocal.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Controller
                name="isEnabled"
                control={form.control}
                render={({ field }) => (
                    <Switch
                        id="isEnabled"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                    />
                )}
            />
            <Label htmlFor="isEnabled" className="cursor-pointer">Enabled</Label>
          </div>
          {form.formState.errors.isEnabled && (
              <p className="text-sm text-red-500 mt-1">{form.formState.errors.isEnabled.message}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save' : 'Create Schedule')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}; 