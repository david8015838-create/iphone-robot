import Dexie, { type EntityTable } from 'dexie'
import type { ConversationEntry, MemoryEntry, PersonalityTrait, UserProfile } from '@/types'

class RobotDB extends Dexie {
  conversations!: EntityTable<ConversationEntry, 'id'>
  memories!: EntityTable<MemoryEntry, 'id'>
  personalityTraits!: EntityTable<PersonalityTrait, 'id'>
  userProfile!: EntityTable<UserProfile, 'key'>

  constructor() {
    super('robot-db')
    this.version(1).stores({
      conversations: '++id, timestamp, emotion, *tags',
      memories: '++id, category, key, importance, lastAccessed',
      personalityTraits: '++id, traitType, strength, deprecated, formedAt',
      userProfile: 'key, updatedAt',
    })
  }
}

let dbInstance: RobotDB | null = null

export function getDB(): RobotDB {
  if (!dbInstance) dbInstance = new RobotDB()
  return dbInstance
}
