'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle, XCircle, UserPlus } from 'lucide-react';

interface AddPushoverUserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUserAdded: () => void; // Callback to refresh the user list
}

export function AddPushoverUserModal({
  isOpen,
  onOpenChange,
  onUserAdded,
}: AddPushoverUserModalProps) {
  const [userKey, setUserKey] = useState('');
  const [device, setDevice] = useState('');
  const [memo, setMemo] = useState('');
  
  const [isValidating, setIsValidating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  
  const userKeyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset form and validation when modal opens or userKey/device changes
    if (isOpen) {
      setValidationStatus('idle');
      setValidationMessage(null);
    } else {
      // Delay reset when closing to avoid visual glitch
      setTimeout(() => {
        setUserKey('');
        setDevice('');
        setMemo('');
        setValidationStatus('idle');
        setValidationMessage(null);
        setIsValidating(false);
        setIsAdding(false);
      }, 300)
    }
  }, [isOpen]);

  useEffect(() => {
    setValidationStatus('idle');
    setValidationMessage(null);
  }, [userKey, device]);

  const handleValidate = async () => {
    if (!userKey) {
      toast.warning("Please enter a Pushover User Key to validate.");
      userKeyInputRef.current?.focus();
      return;
    }
    setIsValidating(true);
    setValidationStatus('idle');
    setValidationMessage(null);

    try {
      const response = await fetch('/api/services/pushover/group-users/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userKey, device: device || undefined }),
      });
      const data = await response.json();
      if (data.isValid) {
        setValidationStatus('valid');
        setValidationMessage(`User is valid. Devices: ${data.devices?.join(', ') || 'None specified'}`);
        toast.success('Validation Successful', { description: `User ${userKey.substring(0,5)}... is valid.` });
      } else {
        setValidationStatus('invalid');
        setValidationMessage(data.errorMessage || 'User or device is invalid.');
        toast.error('Validation Failed', { description: data.errorMessage || 'User or device is not valid.' });
      }
    } catch (error) {
      setValidationStatus('invalid');
      setValidationMessage('Network error during validation.');
      toast.error('Network Error', { description: 'Could not connect to server.' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!userKey) {
      toast.warning("Please enter a Pushover User Key.");
      userKeyInputRef.current?.focus();
      return;
    }

    let keyIsValid = validationStatus === 'valid';

    // If not yet validated or was invalid, re-validate before adding
    if (validationStatus === 'idle' || validationStatus === 'invalid') {
      setIsValidating(true);
      try {
        const valResponse = await fetch('/api/services/pushover/group-users/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userKey, device: device || undefined }),
        });
        const valData = await valResponse.json();
        keyIsValid = valData.isValid;
        if (keyIsValid) {
          setValidationStatus('valid');
          setValidationMessage('User key validated.');
        } else {
          setValidationStatus('invalid');
          setValidationMessage(valData.errorMessage || 'User or device is invalid.');
          toast.error('Validation Failed', { description: valData.errorMessage || 'Cannot add invalid user.' });
          setIsValidating(false);
          return;
        }
      } catch (error) {
        setValidationStatus('invalid');
        setValidationMessage('Network error during pre-add validation.');
        toast.error('Network Error', { description: 'Could not validate user.' });
        setIsValidating(false);
        return;
      } finally {
        setIsValidating(false);
      }
    }

    if (!keyIsValid) return; // Should not happen if logic above is correct

    setIsAdding(true);
    try {
      const response = await fetch('/api/services/pushover/group-users/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userKey, device: device || undefined, memo: memo || undefined }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success('User Added Successfully');
        onUserAdded(); // Trigger refresh in parent
        onOpenChange(false); // Close modal
      } else {
        toast.error('Failed to Add User', { description: data.error || 'An unexpected error occurred.' });
      }
    } catch (error) {
      toast.error('Network Error', { description: 'Could not connect to server.' });
    } finally {
      setIsAdding(false);
    }
  };

  const ValidationStatusIndicator = () => {
    if (validationStatus === 'idle') return null;
    
    return (
      <div className={`flex items-center text-xs mt-1 ${validationStatus === 'valid' ? 'text-green-600' : 'text-destructive'}`}>
        {validationStatus === 'valid' ? (
          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
        )}
        <span>{validationMessage}</span>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <UserPlus className="mr-2 h-5 w-5" /> Add User to Pushover Group
          </DialogTitle>
          <DialogDescription>
            Enter the Pushover user key and optionally a device name and memo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="modalUserKey" className="text-sm font-medium">
                Pushover User Key
              </label>
              <Input
                ref={userKeyInputRef}
                id="modalUserKey"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                placeholder="User Key"
                disabled={isValidating || isAdding}
              />
              <ValidationStatusIndicator />
              <p className="text-xs text-muted-foreground">The user&apos;s Pushover user key. Required.</p>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="modalDevice" className="text-sm font-medium">
                Device Name
              </label>
              <Input
                id="modalDevice"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="Device Name"
                disabled={isValidating || isAdding}
              />
              <p className="text-xs text-muted-foreground">A specific device name to send messages to. Leave blank to send messages to all devices of that user.</p>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="modalMemo" className="text-sm font-medium">
                Memo
              </label>
              <Input
                id="modalMemo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Memo"
                disabled={isValidating || isAdding}
              />
              <p className="text-xs text-muted-foreground">Free-text memo used to associate data with the user such as their name or e-mail address.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleValidate}
            disabled={isValidating || isAdding || !userKey}
            size="sm"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {isValidating ? 'Validating...' : 'Validate Key'}
          </Button>
          
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="sm" disabled={isAdding || isValidating}>
                Cancel
              </Button>
            </DialogClose>
            <Button 
              type="button" 
              onClick={handleSubmit} 
              disabled={isValidating || isAdding || !userKey}
              size="sm"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {isAdding ? 'Adding...' : 'Add User'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 