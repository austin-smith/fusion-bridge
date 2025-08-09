import { ActionableState } from '@/lib/mappings/definitions';
import type { LucideIcon } from 'lucide-react';
import { Power as PowerIcon, PowerOff as PowerOffIcon, Lock as LockIcon, Timer as TimerIcon, Unlock as UnlockIcon } from 'lucide-react';

export function presentAction(action: ActionableState): { label: string; icon: LucideIcon } {
  switch (action) {
    case ActionableState.SET_ON:
      return { label: 'Turn On', icon: PowerIcon };
    case ActionableState.SET_OFF:
      return { label: 'Turn Off', icon: PowerOffIcon };
    case ActionableState.SET_LOCKED:
      return { label: 'Lock', icon: LockIcon };
    case ActionableState.SET_UNLOCKED:
      return { label: 'Unlock', icon: UnlockIcon };
    case ActionableState.QUICK_GRANT:
      // UX: Use Unlock icon as requested
      return { label: 'Quick Grant', icon: TimerIcon };
    default:
      return { label: String(action), icon: PowerIcon };
  }
}


