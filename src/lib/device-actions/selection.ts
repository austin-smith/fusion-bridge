import { type DisplayState, ActionableState, DeviceType, ON, OFF, LOCKED, UNLOCKED } from '@/lib/mappings/definitions';
import { getSupportedStateActions } from './capabilities';
import { presentAction } from './presentation';

export interface ActionSpec {
  action: ActionableState;
  label: string;
  icon: ReturnType<typeof presentAction>['icon'];
}

export interface Selection {
  primary: ActionSpec | null;
  secondary: ActionSpec[];
}

export function deriveQuickActions(args: {
  connectorCategory: string | undefined | null;
  deviceType: DeviceType;
  displayState?: DisplayState;
}): Selection {
  const { connectorCategory, deviceType, displayState } = args;
  const supported = getSupportedStateActions(connectorCategory, deviceType);
  if (!supported.length) return { primary: null, secondary: [] };

  // Remove actions that are no-ops for the current state
  let filtered = [...supported];
  // Binary devices
  if (displayState === ON) {
    filtered = filtered.filter((a) => a !== ActionableState.SET_ON);
  } else if (displayState === OFF) {
    filtered = filtered.filter((a) => a !== ActionableState.SET_OFF);
  }
  // Locks/doors
  if (displayState === UNLOCKED) {
    filtered = filtered.filter(
      (a) => a !== ActionableState.SET_UNLOCKED && a !== ActionableState.QUICK_GRANT
    );
  } else if (displayState === LOCKED) {
    filtered = filtered.filter((a) => a !== ActionableState.SET_LOCKED);
  }

  let primary: ActionableState | null = null;

  // Binary on/off selection
  if (filtered.includes(ActionableState.SET_ON) && filtered.includes(ActionableState.SET_OFF)) {
    if (displayState === ON) primary = ActionableState.SET_OFF;
    else primary = ActionableState.SET_ON;
  }

  // Lock/unlock selection
  if (!primary && filtered.includes(ActionableState.SET_LOCKED) && filtered.includes(ActionableState.SET_UNLOCKED)) {
    if (displayState === LOCKED) primary = ActionableState.SET_UNLOCKED;
    else primary = ActionableState.SET_LOCKED;
  }

  // Fallback to first supported if still not determined
  if (!primary) {
    primary = filtered[0] ?? null;
  }

  if (!primary) return { primary: null, secondary: [] };

  const primarySpec: ActionSpec = { action: primary, ...presentAction(primary) };
  const secondary = filtered
    .filter(a => a !== primary)
    .map(a => ({ action: a, ...presentAction(a) }));

  return { primary: primarySpec, secondary };
}


