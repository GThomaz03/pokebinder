/**
 * One confirmation click becomes a single quantity update per cardKey.
 * Repeating the click with the same item ids is a no-op.
 */
export type CommitLine = {
  itemId: string
  cardId: string
  qty: number
}

export type InventoryAdd = {
  cardId: string
  qty: number
}

export function planInventoryCommit(
  lines: CommitLine[],
  committedIds: ReadonlySet<string>,
): { adds: InventoryAdd[]; itemIds: string[] } {
  const fresh = lines.filter((line) => line.cardId && line.qty > 0 && !committedIds.has(line.itemId))
  const byCard = new Map<string, number>()
  for (const line of fresh) {
    const qty = Math.floor(line.qty)
    if (qty <= 0) continue
    byCard.set(line.cardId, (byCard.get(line.cardId) ?? 0) + qty)
  }
  return {
    adds: [...byCard.entries()].map(([cardId, qty]) => ({ cardId, qty })),
    itemIds: fresh.map((line) => line.itemId),
  }
}
