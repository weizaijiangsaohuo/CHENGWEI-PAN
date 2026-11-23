/** Legacy compatibility export: welcome emails through the retired provider are disabled.
 * Do not claim a delivery, modify delivery history, or bypass verification/reset emails.
 */
export async function ensureWelcomeEmail(_userId: string): Promise<void> {
  // No network requests or persistent state. Kept only for older imports.
}
