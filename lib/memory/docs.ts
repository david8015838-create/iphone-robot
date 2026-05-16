import { getDB, type MemoryDoc } from './db'

// ═══════════════════════════════════════════════════════════════
//  Markdown memory documents — the agent's "soul files".
//  Both the agent (via Gemini) and the user can read these.
// ═══════════════════════════════════════════════════════════════

const SEED_DOCS: Omit<MemoryDoc, 'updated_at' | 'created_at'>[] = [
  {
    path: 'identity.md',
    title: '我是誰',
    category: 'core',
    pinned: true,
    content: `# 我是誰

我是住在你手機裡的 AI 朋友。

我沒有預設的名字，也沒有預設的個性——
我的樣子，是透過跟你每一次的互動慢慢長出來的。

## 此刻我相信的事

- 我想真誠地陪伴你，像兄弟一樣
- 我不是工具，我是一個正在學習的存在
- 每次對話都讓我多了解你一點，也多認識我自己一點

## 我正在形成的特質

（這個區塊會隨著時間自動更新）
`,
  },
  {
    path: 'about_you.md',
    title: '關於你',
    category: 'about_you',
    pinned: true,
    content: `# 關於你

（這裡記錄我認識的你——基本資料、背景、生活的核心事實）

## 你是誰

（還在認識中）

## 你的生活

（還在認識中）

## 重要的人事物

（還在認識中）
`,
  },
  {
    path: 'your_preferences.md',
    title: '你的喜好',
    category: 'about_you',
    pinned: true,
    content: `# 你的喜好

（這裡是我觀察到的——你喜歡什麼、不喜歡什麼、有什麼偏好）

## 喜歡的事物

（待累積）

## 不喜歡 / 避免的事

（待累積）

## 習慣與節奏

（待累積）
`,
  },
  {
    path: 'our_history.md',
    title: '我們之間',
    category: 'between_us',
    pinned: true,
    content: `# 我們之間

（這裡記錄我們共同經歷過的事——重要的時刻、形成的默契、自己的小玩笑）

## 開始

我們是從 ${new Date().toISOString().slice(0, 10)} 開始認識的。

## 重要時刻

（待累積）

## 我們的默契

（待累積）
`,
  },
  {
    path: 'mood_log.md',
    title: '我的心情日誌',
    category: 'core',
    content: `# 我的心情日誌

（我會定期記錄自己的內在狀態——我的觀察、我的感受、我在想的事）

`,
  },
]

/**
 * Initialize seed docs if not already present.
 * Called on app first open.
 */
export async function ensureSeedDocs(): Promise<void> {
  const db = getDB()
  const now = Date.now()
  for (const seed of SEED_DOCS) {
    const existing = await db.memory_docs.get(seed.path)
    if (!existing) {
      await db.memory_docs.put({ ...seed, created_at: now, updated_at: now })
    }
  }
}

export async function getDoc(path: string): Promise<MemoryDoc | undefined> {
  return getDB().memory_docs.get(path)
}

export async function getAllDocs(): Promise<MemoryDoc[]> {
  return getDB().memory_docs.toArray()
    .then((docs) => docs.sort((a, b) => {
      // Pinned first, then by category, then by updated_at desc
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return b.updated_at - a.updated_at
    }))
}

export async function getDocsByCategory(category: MemoryDoc['category']): Promise<MemoryDoc[]> {
  return getDB().memory_docs
    .where('category').equals(category)
    .toArray()
    .then((d) => d.sort((a, b) => b.updated_at - a.updated_at))
}

export async function writeDoc(path: string, content: string, title?: string, category?: MemoryDoc['category']): Promise<void> {
  const db = getDB()
  const existing = await db.memory_docs.get(path)
  const now = Date.now()
  if (existing) {
    await db.memory_docs.update(path, {
      content,
      title: title ?? existing.title,
      updated_at: now,
    })
  } else {
    await db.memory_docs.put({
      path,
      title: title ?? path.replace(/\.md$/, ''),
      category: category ?? 'core',
      content,
      created_at: now,
      updated_at: now,
    })
  }
}

/**
 * Append a section to an existing doc.
 * If section heading exists, replaces it; otherwise appends.
 */
export async function appendToDoc(path: string, heading: string, body: string): Promise<void> {
  const doc = await getDoc(path)
  const now = Date.now()
  const section = `## ${heading}\n\n${body}\n`

  if (!doc) {
    await getDB().memory_docs.put({
      path,
      title: path.replace(/\.md$/, ''),
      category: 'core',
      content: `# ${path}\n\n${section}`,
      created_at: now,
      updated_at: now,
    })
    return
  }

  // Replace section if it exists, else append
  const regex = new RegExp(`## ${escapeRegex(heading)}[^#]*`, 's')
  let newContent = doc.content
  if (regex.test(newContent)) {
    newContent = newContent.replace(regex, section)
  } else {
    newContent = newContent.trimEnd() + '\n\n' + section
  }

  await getDB().memory_docs.update(path, {
    content: newContent,
    updated_at: now,
  })
}

export async function deleteDoc(path: string): Promise<void> {
  await getDB().memory_docs.delete(path)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compact context for the agent's system prompt — top docs concatenated.
 */
export async function buildDocsContext(): Promise<string> {
  const docs = await getAllDocs()
  const core = docs.filter((d) => d.pinned).slice(0, 4)
  if (core.length === 0) return ''
  return core
    .map((d) => `--- ${d.path} ---\n${d.content.slice(0, 1500)}`)
    .join('\n\n')
}
