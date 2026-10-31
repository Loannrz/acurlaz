// Shared tap / drag thresholds, so a press is either a click on a zone
// (hotspots) or the start of an orbit drag (zoom), never both.
//   tapSlop(pointerType): movement in CSS pixels (screen space, so the same at
//   any zoom) above which a press becomes a drag. Fingers are less precise.
//   TAP_MAX_MS: a press held longer than this is not a click.
import { ORBIT } from '../config.js';

export const TAP_MAX_MS = 800;
const TOUCH_SLOP_PX = 10;

export function tapSlop(pointerType) {
  return pointerType === 'touch' ? Math.max(ORBIT.dragThreshold, TOUCH_SLOP_PX) : ORBIT.dragThreshold;
}
