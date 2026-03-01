/**
 * Detect if a viem/wagmi error is a user rejection (user cancelled in wallet).
 */
export function isUserRejection(error: Error): boolean {
  const msg = error.message?.toLowerCase() ?? '';
  return (
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('rejected the request')
  );
}
