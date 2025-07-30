import { EventType } from '../definitions';
import { createEventClassification } from '../event-hierarchy';

/**
 * YoLink event suffix patterns to event classification mapping
 * Maps the suffix of YoLink event.event strings to standardized classifications
 */
export const YOLINK_EVENT_SUFFIX_MAP = {
  '.powerReport': createEventClassification(EventType.POWER_CHECK_IN),
  '.Report': createEventClassification(EventType.DEVICE_CHECK_IN),
  '.Alert': createEventClassification(EventType.STATE_CHANGED),
  '.StatusChange': createEventClassification(EventType.STATE_CHANGED),
  '.setState': createEventClassification(EventType.STATE_CHANGED),
} as const;

/**
 * YoLink IPCamera sub-event to classification mapping
 * Maps the event.data.event strings for IPCamera.Alert events
 */
export const YOLINK_IPCAMERA_EVENT_MAP = {
  'sound_detected': createEventClassification(EventType.SOUND_DETECTED),
  'motion_detected': createEventClassification(EventType.MOTION_DETECTED),
} as const;

/**
 * YoLink SmartFob button press type to classification mapping
 * Maps the pressType from SmartFob button events
 */
export const YOLINK_SMARTFOB_PRESS_MAP = {
  'Press': createEventClassification(EventType.BUTTON_PRESSED),
  'LongPress': createEventClassification(EventType.BUTTON_LONG_PRESSED),
} as const;

/**
 * Fallback classification for unmapped YoLink events
 */
export const YOLINK_UNKNOWN_EVENT = createEventClassification(
  EventType.UNKNOWN_EXTERNAL_EVENT
);