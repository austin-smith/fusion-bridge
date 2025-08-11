'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Loader2, Hash, Trash2, Edit3, ArrowLeft, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useFusionStore } from '@/stores/store';
import type { User } from '@/lib/actions/user-actions';

interface PinManagementDialogProps {
  user: User;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isSelfService?: boolean;
}

type DialogState = 'overview' | 'change' | 'remove' | 'create';

export function PinManagementDialog({ user, isOpen, onOpenChange, isSelfService }: PinManagementDialogProps) {
  const [state, setState] = useState<DialogState>('overview');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  
  // Store actions
  const { setUserPin, removeUserPin } = useFusionStore();
  
  // Check if user has a PIN
  const userWithPin = user as any; // Type assertion for Better Auth additionalFields
  const hasExistingPin = userWithPin.keypadPin;

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setState(hasExistingPin ? 'overview' : 'create');
      setPin('');
      setIsLoading(false);
    } else {
      setState(hasExistingPin ? 'overview' : 'create');
    }
  }, [isOpen, hasExistingPin]);

  // Validate PIN format (6 digits)
  const validatePin = (pinValue: string): boolean => {
    return /^\d{6}$/.test(pinValue);
  };

  const handleSetPin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Validation
    if (!validatePin(pin)) {
      toast.error('PIN must be exactly 6 digits');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Use callback if provided, otherwise use store action
      const success = await setUserPin(user.id, pin);
      
      if (success) {
        onOpenChange(false);
        // Success toast is handled by the store action or parent
      }
    } catch (error) {
      console.error('Error in PIN dialog:', error);
      toast.error('Failed to set PIN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePin = async () => {
    setIsLoading(true);
    
    try {
      // Use callback if provided, otherwise use store action
      const success = await removeUserPin(user.id);
      
      if (success) {
        onOpenChange(false);
        // Success toast is handled by the store action or parent
      }
    } catch (error) {
      console.error('Error removing PIN:', error);
      toast.error('Failed to remove PIN');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setPin('');
  };

  const goBack = () => {
    resetForm();
    setState('overview');
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  // Overview state - when PIN exists
  if (state === 'overview' && hasExistingPin) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              Keypad PIN
            </DialogTitle>
            <DialogDescription>
              {isSelfService ? (
                'Manage your keypad PIN'
              ) : (
                <>Manage the keypad PIN for <strong>{user.name}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            <div className="flex items-center justify-center p-6 bg-green-50 rounded-lg border border-green-200">
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-3">
                  <Hash className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-medium text-green-900 mb-1">PIN is Active</h3>
                <p className="text-sm text-green-700">
                  Set on {formatDate(userWithPin.keypadPinSetAt)}
                </p>
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button 
              variant="outline" 
              onClick={() => setState('change')}
              className="w-full sm:w-auto"
            >
              <Edit3 className="h-4 w-4" />
              Change PIN
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setState('remove')}
              className="w-full sm:w-auto"
            >
              <Trash2 className="h-4 w-4" />
              Remove PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Remove PIN confirmation state
  if (state === 'remove') {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Remove PIN
            </DialogTitle>
            <DialogDescription>
              {isSelfService ? (
                'Are you sure you want to remove your keypad PIN?'
              ) : (
                <>Are you sure you want to remove the keypad PIN for <strong>{user.name}</strong>?</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </div>
                <div>
                  <h4 className="font-medium text-red-900 mb-1">This action cannot be undone</h4>
                  <p className="text-sm text-red-700">
                    {isSelfService ? (
                      'You will no longer be able to arm or disarm the alarm using the keypad.'
                    ) : (
                      <><strong>{user.name}</strong> will no longer be able to arm or disarm the alarm using the keypad.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button 
              variant="outline" 
              onClick={goBack}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRemovePin}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Change PIN or Create PIN form state
  const isChanging = state === 'change';
  const isCreating = state === 'create';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            {isChanging ? 'Change PIN' : 'Set Keypad PIN'}
          </DialogTitle>
          <DialogDescription>
            {isChanging ? (
              isSelfService ? (
                'Enter a new 6-digit PIN'
              ) : (
                <>Enter a new 6-digit PIN for <strong>{user.name}</strong></>
              )
            ) : (
              'Create a 6-digit PIN for alarm arming and disarming'
            )}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSetPin} ref={formRef}>
          <div className="space-y-4 py-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-center block">
                {isChanging ? 'New PIN' : 'Enter 6-Digit PIN'}
              </Label>
              <div className="flex justify-center">
                <InputOTP 
                  value={pin} 
                  onChange={setPin}
                  maxLength={6}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {isChanging ? (
              <Button 
                type="button"
                variant="outline" 
                onClick={goBack}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <DialogClose asChild>
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </DialogClose>
            )}
            <Button 
              type="submit" 
              disabled={isLoading || pin.length !== 6}
              className="w-full sm:w-auto"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Hash className="h-4 w-4" />
              )}
              {isChanging ? 'Update PIN' : 'Set PIN'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 