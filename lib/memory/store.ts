import { getDB } from './db'
import type { ConversationEntry, MemoryEntry, PersonalityTrait, UserProfile } from '@/types'

export async function saveConversation(entry: Omit<ConversationEntry, 'id'>): Promise<void> {
  await getDB().conversations.add(entry)
}

export async function getRecentConversations(limit = 20): Promise<ConversationEntry[]> {
  return getDB().conversations.orderBy('timestamp').reverse().limit(limit).toArray()
}

export async function saveMemory(entry: Omit<MemoryEntry, 'id'>): Promise<void> {
  const existing = await getDB().memories.where('key').equals(entry.key).first()
  if (existing?.id) {
    await getDB().memories.update(existing.id, {
      ...entry,
      lastAccessed: Date.now(),
      importance: Math.min(5, (existing.importance ?? 1) + 0.5),
    })
  } else {
    await getDB().memories.add({ ...entry, createdAt: Date.now(), lastAccessed: Date.now() })
  }
}

export async function getAllMemories(): Promise<MemoryEntry[]> {
  return getDB().memories.orderBy('importance').reverse().toArray()
}

export async function setUserProfile(key: string, value: string): Promise<void> {
  const entry: UserProfile = { key, value, updatedAt: Date.now() }
  await getDB().userProfile.put(entry)
}

export async function getUserProfile(key: string): Promise<string | null> {
  const entry = await getDB().userProfile.get(key)
  return entry?.value ?? null
}

export async function getAllUserProfile(): Promise<UserProfile[]> {
  return getDB().userProfile.toArray()
}

export async function savePersonalityTrait(
  trait: Omit<PersonalityTrait, 'id'>
): Promise<void> {
  await getDB().personalityTraits.add(trait)
}

export async function getTopPersonalityTraits(limit = 10): Promise<PersonalityTrait[]> {
  return getDB()
    .personalityTraits.filter((t) => !t.deprecated)
    .toArray()
    .then((all) =>
      all.sort((a, b) => b.strength - a.strength).slice(0, limit)
    )
}

export async function strengthenTrait(id: number): Promise<void> {
  const trait = await getDB().personalityTraits.get(id)
  if (trait) {
    await getDB().personalityTraits.update(id, { strength: Math.min(10, trait.strength + 1) })
  }
}

export async function deprecateTrait(id: number): Promise<void> {
  await getDB().personalityTraits.update(id, { deprecated: true })
}

export async function decayTraits(): Promise<void> {
  const all = await getDB().personalityTraits.filter((t) => !t.deprecated).toArray()
  const now = Date.now()
  const staleThreshold = 7 * 24 * 60 * 60 * 1000

  for (const trait of all) {
    const age = now - trait.formedAt
    if (age > staleThreshold && trait.strength > 1 && trait.id != null) {
      await getDB().personalityTraits.update(trait.id, { strength: trait.strength - 1 })
    }
  }
}
