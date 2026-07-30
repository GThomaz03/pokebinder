/** Stable palette for collab member colors (shared across clients). */
export const MEMBER_COLOR_PALETTE = [
  '#e11d48', // rose
  '#ea580c', // orange
  '#ca8a04', // yellow
  '#16a34a', // green
  '#0891b2', // cyan
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
] as const

export function memberColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return MEMBER_COLOR_PALETTE[hash % MEMBER_COLOR_PALETTE.length]
}

/** Placement of owner name chip outside the slot (col/row 0-based). */
export type OwnerTipPlacement =
  | 'side-left'
  | 'side-right'
  | 'bottom-center'
  | 'top-center'

export function ownerTipPlacement(
  slotIndex: number,
  cols: number,
  rows: number,
): OwnerTipPlacement {
  const col = slotIndex % cols
  const row = Math.floor(slotIndex / cols)

  // Lateral edges: name beside the card so last-row tips stay visible
  if (cols > 1 && col === 0) return 'side-left'
  if (cols > 1 && col === cols - 1) return 'side-right'

  // Middle columns (or single column): use vertical extremities
  if (row === 0) return 'bottom-center'
  if (row === rows - 1) return 'top-center'
  return row < rows / 2 ? 'bottom-center' : 'top-center'
}

export type OwnerVizState = {
  enabled: boolean
  /** Empty array = show none when enabled; all member ids = show all */
  visibleUserIds: string[]
}

function vizKey(binderId: string) {
  return `pokebinder-collab-owner-viz:${binderId}`
}

export function loadOwnerViz(binderId: string, memberIds: string[]): OwnerVizState {
  try {
    const raw = localStorage.getItem(vizKey(binderId))
    if (!raw) {
      return { enabled: false, visibleUserIds: [...memberIds] }
    }
    const parsed = JSON.parse(raw) as OwnerVizState
    return {
      enabled: Boolean(parsed.enabled),
      visibleUserIds: Array.isArray(parsed.visibleUserIds)
        ? parsed.visibleUserIds.filter((id) => typeof id === 'string')
        : [...memberIds],
    }
  } catch {
    return { enabled: false, visibleUserIds: [...memberIds] }
  }
}

export function saveOwnerViz(binderId: string, state: OwnerVizState) {
  localStorage.setItem(vizKey(binderId), JSON.stringify(state))
}
