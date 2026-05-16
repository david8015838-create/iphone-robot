import { getDB, type RawEvent, type DailySummary, type WeeklyTheme, type IdentityFact, type PersonalityTraitV2, type StateLog } from './db'

// ─── Raw events ───────────────────────────────────────────────
export async function logEvent(e: Omit<RawEvent, 'id' | 'consolidated'>): Promise<void> {
  await getDB().raw_events.add({ ...e, consolidated: false })
}

export async function getRecentEvents(hours = 24, limit = 100): Promise<RawEvent[]> {
  const since = Date.now() - hours * 3_600_000
  return getDB().raw_events
    .where('timestamp').above(since)
    .reverse()
    .limit(limit)
    .toArray()
}

export async function getUnconsolidatedEvents(): Promise<RawEvent[]> {
  return getDB().raw_events
    .filter((e) => !e.consolidated)
    .toArray()
}

export async function markEventsConsolidated(ids: number[]): Promise<void> {
  await getDB().raw_events
    .where('id').anyOf(ids)
    .modify({ consolidated: true })
}

export async function pruneOldRawEvents(keepHours = 48): Promise<void> {
  const cutoff = Date.now() - keepHours * 3_600_000
  await getDB().raw_events
    .where('timestamp').below(cutoff)
    .and((e) => e.consolidated === true)
    .delete()
}

// ─── Daily summaries ──────────────────────────────────────────
export async function saveDailySummary(s: Omit<DailySummary, 'id' | 'created_at' | 'consolidated'>): Promise<void> {
  // Replace existing summary for same date
  await getDB().daily_summaries.where('date').equals(s.date).delete()
  await getDB().daily_summaries.add({ ...s, created_at: Date.now(), consolidated: false })
}

export async function getDailySummary(date: string): Promise<DailySummary | undefined> {
  return getDB().daily_summaries.where('date').equals(date).first()
}

export async function getRecentDailySummaries(days = 7): Promise<DailySummary[]> {
  return getDB().daily_summaries
    .orderBy('date')
    .reverse()
    .limit(days)
    .toArray()
}

export async function getOldUnconsolidatedDailies(olderThanDays = 30): Promise<DailySummary[]> {
  const cutoffDate = new Date(Date.now() - olderThanDays * 86_400_000)
    .toISOString().slice(0, 10)
  return getDB().daily_summaries
    .filter((d) => !d.consolidated && d.date < cutoffDate)
    .toArray()
}

export async function markDailiesConsolidated(ids: number[]): Promise<void> {
  await getDB().daily_summaries.where('id').anyOf(ids).modify({ consolidated: true })
}

// ─── Weekly themes ────────────────────────────────────────────
export async function saveWeeklyTheme(t: Omit<WeeklyTheme, 'id' | 'created_at'>): Promise<void> {
  await getDB().weekly_themes.where('week').equals(t.week).delete()
  await getDB().weekly_themes.add({ ...t, created_at: Date.now() })
}

export async function getRecentWeeklyThemes(weeks = 4): Promise<WeeklyTheme[]> {
  return getDB().weekly_themes
    .orderBy('week').reverse()
    .limit(weeks).toArray()
}

// ─── Identity facts (forever memories) ────────────────────────
export async function saveIdentityFact(f: Omit<IdentityFact, 'id' | 'last_referenced'>): Promise<void> {
  // Dedup by fact text
  const existing = await getDB().identity_facts.filter((x) => x.fact === f.fact).first()
  if (existing?.id) {
    await getDB().identity_facts.update(existing.id, {
      strength: Math.min(10, existing.strength + 1),
      last_referenced: Date.now(),
    })
    return
  }
  await getDB().identity_facts.add({ ...f, last_referenced: Date.now() })
}

export async function getTopIdentityFacts(limit = 15): Promise<IdentityFact[]> {
  const all = await getDB().identity_facts.toArray()
  return all
    .sort((a, b) => b.strength * 10 + (b.last_referenced - a.last_referenced) / 86_400_000 - (a.strength * 10 + (a.last_referenced - b.last_referenced) / 86_400_000))
    .slice(0, limit)
}

export async function markFactReferenced(id: number): Promise<void> {
  await getDB().identity_facts.update(id, { last_referenced: Date.now() })
}

// ─── Personality traits ───────────────────────────────────────
export async function savePersonalityTrait(t: Omit<PersonalityTraitV2, 'id' | 'last_reinforced'>): Promise<void> {
  await getDB().personality_traits.add({ ...t, last_reinforced: Date.now() })
}

export async function getActivePersonalityTraits(limit = 10): Promise<PersonalityTraitV2[]> {
  return getDB().personality_traits
    .filter((t) => !t.deprecated)
    .toArray()
    .then((all) => all.sort((a, b) => b.strength - a.strength).slice(0, limit))
}

export async function reinforceTrait(id: number): Promise<void> {
  const t = await getDB().personality_traits.get(id)
  if (!t) return
  await getDB().personality_traits.update(id, {
    strength: Math.min(10, t.strength + 1),
    last_reinforced: Date.now(),
  })
}

export async function decayPersonalityTraits(): Promise<void> {
  const all = await getDB().personality_traits.filter((t) => !t.deprecated).toArray()
  const now = Date.now()
  const stale = 7 * 86_400_000
  for (const t of all) {
    if (t.id != null && now - t.last_reinforced > stale && t.strength > 1) {
      await getDB().personality_traits.update(t.id, { strength: t.strength - 1 })
    }
  }
}

// ─── State log ────────────────────────────────────────────────
export async function logState(s: Omit<StateLog, 'id'>): Promise<void> {
  await getDB().state_log.add(s)
  // Keep only last 200 entries
  const count = await getDB().state_log.count()
  if (count > 200) {
    const excess = await getDB().state_log.orderBy('timestamp').limit(count - 200).primaryKeys()
    await getDB().state_log.bulkDelete(excess)
  }
}
