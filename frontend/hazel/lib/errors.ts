export const txErr = (e: unknown): string =>
  (e as { shortMessage?: string })?.shortMessage ?? 'Transaction refusée'
