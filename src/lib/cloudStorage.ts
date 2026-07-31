import type { Binder, Deck, InventoryMap } from '../types'
import { supabase } from './supabase'

export type UserCloudData = {
  binders: Binder[]
  inventory: InventoryMap
  decks: Deck[]
}

export type ShareResourceType = 'binder' | 'deck'

export type ShareLink = {
  id: string
  token: string
  resourceType: ShareResourceType
  resourceId: string
  title: string | null
  snapshot: Binder | Deck
  createdAt: string
}

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** Serialize upserts per resource so concurrent saves don't race; coalesce dirty payloads. */
function createSerializedSaver<T>(saveFn: (userId: string, data: T) => Promise<void>) {
  let inFlight: Promise<void> | null = null
  let pending: { userId: string; data: T } | null = null

  return async function serializedSave(userId: string, data: T) {
    pending = { userId, data }
    if (inFlight) return inFlight

    inFlight = (async () => {
      try {
        while (pending) {
          const job = pending
          pending = null
          await saveFn(job.userId, job.data)
        }
      } finally {
        inFlight = null
        // If something queued during the finally window, kick another run
        if (pending) {
          void serializedSave(pending.userId, pending.data)
        }
      }
    })()

    return inFlight
  }
}

async function upsertBinders(userId: string, binders: Binder[]) {
  const client = requireClient()
  const { error } = await client.from('user_binders').upsert(
    { user_id: userId, binders, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

async function upsertInventory(userId: string, inventory: InventoryMap) {
  const client = requireClient()
  const { error } = await client.from('user_inventory').upsert(
    { user_id: userId, inventory, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

async function upsertDecks(userId: string, decks: Deck[]) {
  const client = requireClient()
  const { error } = await client.from('user_decks').upsert(
    { user_id: userId, decks, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

export async function fetchUserCloudData(userId: string): Promise<UserCloudData | null> {
  const client = requireClient()

  const [bindersRes, inventoryRes, decksRes] = await Promise.all([
    client.from('user_binders').select('binders').eq('user_id', userId).maybeSingle(),
    client.from('user_inventory').select('inventory').eq('user_id', userId).maybeSingle(),
    client.from('user_decks').select('decks').eq('user_id', userId).maybeSingle(),
  ])

  if (bindersRes.error) throw bindersRes.error
  if (inventoryRes.error) throw inventoryRes.error
  if (decksRes.error) throw decksRes.error

  if (!bindersRes.data && !inventoryRes.data && !decksRes.data) return null

  return {
    binders: (bindersRes.data?.binders as Binder[]) ?? [],
    inventory: (inventoryRes.data?.inventory as InventoryMap) ?? {},
    decks: (decksRes.data?.decks as Deck[]) ?? [],
  }
}

export const saveUserBinders = createSerializedSaver(upsertBinders)
export const saveUserInventory = createSerializedSaver(upsertInventory)
export const saveUserDecks = createSerializedSaver(upsertDecks)

export async function uploadLocalData(userId: string, data: UserCloudData) {
  await Promise.all([
    saveUserBinders(userId, data.binders),
    saveUserInventory(userId, data.inventory),
    saveUserDecks(userId, data.decks),
  ])
}

function mapShareRow(data: {
  id: string
  token: string
  resource_type: string
  resource_id: string
  title: string | null
  snapshot: Binder | Deck
  created_at: string
}): ShareLink {
  return {
    id: data.id,
    token: data.token,
    resourceType: data.resource_type as ShareResourceType,
    resourceId: data.resource_id,
    title: data.title,
    snapshot: data.snapshot,
    createdAt: data.created_at,
  }
}

export async function createShareLink(
  userId: string,
  resourceType: ShareResourceType,
  resourceId: string,
  title: string,
  snapshot: Binder | Deck,
): Promise<ShareLink> {
  const client = requireClient()
  const { data, error } = await client
    .from('share_links')
    .insert({
      owner_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      title,
      snapshot,
    })
    .select('id, token, resource_type, resource_id, title, snapshot, created_at')
    .single()

  if (error) throw error
  return mapShareRow(data)
}

/** Public read via security-definer RPC (no table-wide SELECT). */
export async function fetchShareLink(token: string): Promise<ShareLink | null> {
  const client = requireClient()
  const { data, error } = await client.rpc('get_share_link', { p_token: token })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return mapShareRow(row as Parameters<typeof mapShareRow>[0])
}

export async function listUserShareLinks(userId: string): Promise<ShareLink[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('share_links')
    .select('id, token, resource_type, resource_id, title, snapshot, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(mapShareRow)
}

export async function deleteShareLink(userId: string, linkId: string) {
  const client = requireClient()
  const { error } = await client
    .from('share_links')
    .delete()
    .eq('id', linkId)
    .eq('owner_id', userId)
  if (error) throw error
}

export function shareUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/share/${token}`
}
