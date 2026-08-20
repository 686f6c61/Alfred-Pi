export interface CurationSignals {
  downloads: number
  publishedAt: string
}

export type CurationVerdict = "alive" | "decaying" | "dead"

const MAX_ALIVE_AGE_MS = 90 * 24 * 60 * 60 * 1000

/** Evalúa señales ya disponibles y devuelve un estado solo informativo. */
export function assessCuration(signals: CurationSignals, now = new Date()): CurationVerdict {
  const publishedAt = new Date(signals.publishedAt).getTime()
  const currentTime = now.getTime()
  if (!Number.isFinite(signals.downloads) || !Number.isFinite(publishedAt) || !Number.isFinite(currentTime)) return "decaying"

  const age = currentTime - publishedAt
  const recent = age >= 0 && age <= MAX_ALIVE_AGE_MS
  if (signals.downloads >= 100 && recent) return "alive"
  if (signals.downloads < 100 && age > MAX_ALIVE_AGE_MS) return "dead"
  return "decaying"
}
