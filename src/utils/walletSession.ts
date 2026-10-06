let active = false

/** One native association for the whole app, including connect/disconnect. Never queue an approval for later. */
export async function withWalletSession<T>(run: () => Promise<T>): Promise<T> {
  if (active) throw new Error('Finish the open wallet request first.')
  active = true
  try { return await run() } finally { active = false }
}
