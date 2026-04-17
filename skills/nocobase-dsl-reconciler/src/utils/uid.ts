/**
 * Generate a random UID (11 lowercase alphanumeric chars, matching NocoBase style).
 */
export function generateUid(length = 11): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
