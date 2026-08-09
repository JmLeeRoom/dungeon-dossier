/**
 * P0-3/P0-4 release gate (design §3.5.6). The atomic Submit turn loop and the
 * five-card with-replacement draw ship as ONE production switch: while it is
 * off the app keeps the legacy submit/endTurn loop, so no intermediate
 * adapter behavior (such as a one-card hand) is ever user-visible. P0-4 is
 * complete, so the combined gate is on by default. Development builds retain
 * `?v2turnloop=0` as an emergency comparison switch.
 */
export function interrogationV2TurnLoopEnabled(
  search?: string,
  development = false,
): boolean {
  if (!development) return true;
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const value = new URLSearchParams(query).get('v2turnloop');
  if (value === null) return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0';
}
