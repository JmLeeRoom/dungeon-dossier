/** Only explicit truthy values may erase the persisted run slot. */
export function isRunResetRequested(value: string | null): boolean {
  return value === '1' || value === 'true';
}
