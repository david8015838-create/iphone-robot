const STORAGE_KEY = 'robot_model_name'
const DEFAULT_MODEL = 'gemini-2.5-flash'

export function getModelName(): string {
  if (typeof window === 'undefined') return DEFAULT_MODEL
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODEL
}

export function setModelName(name: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, name.trim())
}
