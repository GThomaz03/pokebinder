import type { Binder, BinderPage, BinderSettings, GridLayout, Slot } from '../types'
import { defaultSettings } from '../types'
import { createEmptyPage, createCustomBinder } from './binderUtils'
import { supabase } from './supabase'

export type SharedBinderDoc = {
  pages: BinderPage[]
  settings: BinderSettings
  kind: 'shared'
}

export type SharedBinderRow = {
  id: string
  ownerId: string
  name: string
  grid: GridLayout
  doc: SharedBinderDoc
  revision: number
  inviteToken: string | null
  createdAt: string
  updatedAt: string
}

export type BinderMember = {
  binderId: string
  userId: string
  role: 'owner' | 'editor'
  joinedAt: string
  displayName?: string | null
  username?: string | null
}

export class RevisionConflictError extends Error {
  constructor() {
    super('Conflito de revisão — outro membro salvou antes.')
    this.name = 'RevisionConflictError'
  }
}

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

function mapRow(row: Record<string, unknown>): SharedBinderRow {
  const doc = row.doc as SharedBinderDoc
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    grid: row.grid as GridLayout,
    doc: {
      pages: doc?.pages ?? [],
      settings: doc?.settings ?? defaultSettings(),
      kind: 'shared',
    },
    revision: Number(row.revision ?? 0),
    inviteToken: (row.invite_token as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Adapter: SharedBinderRow → Binder shape for existing UI components. */
export function sharedRowToBinder(row: SharedBinderRow): Binder {
  return {
    id: row.id,
    name: row.name,
    kind: 'custom',
    grid: row.grid,
    pages: row.doc.pages,
    settings: row.doc.settings,
    createdAt: Date.parse(row.createdAt) || Date.now(),
    updatedAt: Date.parse(row.updatedAt) || Date.now(),
  }
}

export function binderToDoc(binder: Binder): SharedBinderDoc {
  return {
    pages: binder.pages,
    settings: binder.settings,
    kind: 'shared',
  }
}

const BINDER_COLS =
  'id, owner_id, name, grid, doc, revision, invite_token, created_at, updated_at'

export async function createSharedBinder(
  userId: string,
  name: string,
  grid: GridLayout = '3x3',
): Promise<SharedBinderRow> {
  const client = requireClient()
  const seed = createCustomBinder(name.trim() || 'Fichário compartilhado', grid)
  const doc: SharedBinderDoc = binderToDoc(seed)

  const { data, error } = await client
    .from('shared_binders')
    .insert({
      owner_id: userId,
      name: seed.name,
      grid,
      doc,
      revision: 0,
    })
    .select(BINDER_COLS)
    .single()
  if (error) throw error

  const { error: memErr } = await client.from('binder_members').insert({
    binder_id: data.id,
    user_id: userId,
    role: 'owner',
  })
  if (memErr) throw memErr

  return mapRow(data)
}

export async function listMySharedBinders(userId: string): Promise<SharedBinderRow[]> {
  const client = requireClient()
  const { data: memberships, error: mErr } = await client
    .from('binder_members')
    .select('binder_id')
    .eq('user_id', userId)
  if (mErr) throw mErr
  const ids = (memberships ?? []).map((m) => m.binder_id as string)
  if (!ids.length) return []

  const { data, error } = await client
    .from('shared_binders')
    .select(BINDER_COLS)
    .in('id', ids)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

export async function fetchSharedBinder(id: string): Promise<SharedBinderRow | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('shared_binders')
    .select(BINDER_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapRow(data) : null
}

export async function patchSharedBinder(
  id: string,
  expectedRevision: number,
  nextDoc: SharedBinderDoc,
  patch?: { name?: string; grid?: GridLayout },
): Promise<SharedBinderRow> {
  const client = requireClient()
  const payload: Record<string, unknown> = {
    doc: nextDoc,
    revision: expectedRevision + 1,
    updated_at: new Date().toISOString(),
  }
  if (patch?.name !== undefined) payload.name = patch.name
  if (patch?.grid !== undefined) payload.grid = patch.grid

  const { data, error } = await client
    .from('shared_binders')
    .update(payload)
    .eq('id', id)
    .eq('revision', expectedRevision)
    .select(BINDER_COLS)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new RevisionConflictError()
  return mapRow(data)
}

export async function deleteSharedBinder(id: string, ownerId: string) {
  const client = requireClient()
  const { error } = await client
    .from('shared_binders')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) throw error
}

export async function enableInviteLink(id: string): Promise<string> {
  const client = requireClient()
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const { data, error } = await client
    .from('shared_binders')
    .update({ invite_token: token, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('invite_token')
    .single()
  if (error) throw error
  return data.invite_token as string
}

export async function disableInviteLink(id: string) {
  const client = requireClient()
  const { error } = await client
    .from('shared_binders')
    .update({ invite_token: null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export function inviteUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/collab/join/${token}`
}

export async function joinByInviteToken(token: string): Promise<string> {
  const client = requireClient()
  const { data, error } = await client.rpc('join_shared_binder', { p_token: token })
  if (error) throw error
  return data as string
}

export async function inviteFriend(binderId: string, friendUserId: string) {
  const client = requireClient()
  const { error } = await client.rpc('invite_friend_to_binder', {
    p_binder_id: binderId,
    p_friend_id: friendUserId,
  })
  if (error) throw error
}

export async function listMembers(binderId: string): Promise<BinderMember[]> {
  const client = requireClient()
  const { data: rows, error } = await client
    .from('binder_members')
    .select('binder_id, user_id, role, joined_at')
    .eq('binder_id', binderId)
    .order('joined_at', { ascending: true })
  if (error) throw error

  const ids = (rows ?? []).map((r) => r.user_id as string)
  if (!ids.length) return []

  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select('id, display_name, username')
    .in('id', ids)
  if (pErr) throw pErr

  const byId = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { displayName: p.display_name as string | null, username: p.username as string | null },
    ]),
  )

  return (rows ?? []).map((r) => ({
    binderId: r.binder_id as string,
    userId: r.user_id as string,
    role: r.role as 'owner' | 'editor',
    joinedAt: r.joined_at as string,
    displayName: byId.get(r.user_id as string)?.displayName,
    username: byId.get(r.user_id as string)?.username,
  }))
}

export async function removeMember(binderId: string, userId: string) {
  const client = requireClient()
  const { error } = await client
    .from('binder_members')
    .delete()
    .eq('binder_id', binderId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function leaveBinder(binderId: string, userId: string) {
  await removeMember(binderId, userId)
}

export function subscribeSharedBinder(
  id: string,
  onChange: (row: SharedBinderRow) => void,
): () => void {
  const client = requireClient()
  const channel = client
    .channel(`shared_binder:${id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_binders',
        filter: `id=eq.${id}`,
      },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          onChange(mapRow(payload.new as Record<string, unknown>))
        }
      },
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}

export function ensurePages(doc: SharedBinderDoc, grid: GridLayout): SharedBinderDoc {
  if (doc.pages.length >= 2) return doc
  const pages = [...doc.pages]
  while (pages.length < 2) pages.push(createEmptyPage(grid))
  return { ...doc, pages }
}

export type { Slot }
