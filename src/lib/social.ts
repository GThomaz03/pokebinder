import type { Binder, Deck } from '../types'
import { supabase } from './supabase'
import {
  createShareLink,
  deleteShareLink,
  listUserShareLinks,
  type ShareResourceType,
} from './cloudStorage'

export type Profile = {
  id: string
  displayName: string | null
  username: string | null
  friendCode: string | null
  bio: string | null
  avatarUrl: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export type PublishedResource = {
  id: string
  ownerId: string
  resourceType: ShareResourceType
  resourceId: string
  shareToken: string
  title: string | null
  publishedAt: string
}

export type ProfileUpdate = {
  displayName?: string
  username?: string
  bio?: string | null
  isPublic?: boolean
}

function requireClient() {
  if (!supabase) throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    displayName: (row.display_name as string | null) ?? null,
    username: (row.username as string | null) ?? null,
    friendCode: (row.friend_code as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    isPublic: Boolean(row.is_public ?? true),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapPublished(row: Record<string, unknown>): PublishedResource {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    resourceType: row.resource_type as ShareResourceType,
    resourceId: row.resource_id as string,
    shareToken: row.share_token as string,
    title: (row.title as string | null) ?? null,
    publishedAt: row.published_at as string,
  }
}

const PROFILE_COLS =
  'id, display_name, username, friend_code, bio, avatar_url, is_public, created_at, updated_at'

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? mapProfile(data) : null
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .ilike('username', username.trim())
    .maybeSingle()
  if (error) throw error
  return data ? mapProfile(data) : null
}

export async function getProfileByFriendCode(code: string): Promise<Profile | null> {
  const client = requireClient()
  const normalized = code.trim().toUpperCase()
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('friend_code', normalized)
    .maybeSingle()
  if (error) throw error
  return data ? mapProfile(data) : null
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  const client = requireClient()
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? mapProfile(data) : null
}

export async function updateMyProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const client = requireClient()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.displayName !== undefined) payload.display_name = patch.displayName.trim()
  if (patch.username !== undefined) {
    const slug = patch.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (slug.length < 3) throw new Error('Username deve ter pelo menos 3 caracteres.')
    payload.username = slug
  }
  if (patch.bio !== undefined) payload.bio = patch.bio?.trim() || null
  if (patch.isPublic !== undefined) payload.is_public = patch.isPublic

  const { data, error } = await client
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(PROFILE_COLS)
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Esse username já está em uso.')
    throw error
  }
  return mapProfile(data)
}

export async function searchProfiles(query: string, limit = 20): Promise<Profile[]> {
  const client = requireClient()
  const q = query.trim().replace(/[%_,.()]/g, '')
  if (q.length < 2) return []
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('is_public', true)
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapProfile)
}

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) throw new Error('Você não pode seguir a si mesmo.')
  const client = requireClient()
  const { error } = await client.from('follows').upsert(
    { follower_id: followerId, following_id: followingId },
    { onConflict: 'follower_id,following_id' },
  )
  if (error) throw error
}

export async function unfollowUser(followerId: string, followingId: string) {
  const client = requireClient()
  const { error } = await client
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  if (error) throw error
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const client = requireClient()
  const { data, error } = await client
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function listFollowing(userId: string): Promise<Profile[]> {
  const client = requireClient()
  const { data: rows, error } = await client
    .from('follows')
    .select('following_id, created_at')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const ids = (rows ?? []).map((r) => r.following_id as string)
  if (!ids.length) return []

  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select(PROFILE_COLS)
    .in('id', ids)
  if (pErr) throw pErr

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, mapProfile(p)]))
  return ids.map((id) => byId.get(id)).filter((p): p is Profile => Boolean(p))
}

export async function listPublishedByUser(userId: string): Promise<PublishedResource[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('published_resources')
    .select('id, owner_id, resource_type, resource_id, share_token, title, published_at')
    .eq('owner_id', userId)
    .order('published_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPublished)
}

export async function listMyPublished(userId: string): Promise<PublishedResource[]> {
  return listPublishedByUser(userId)
}

export async function publishResourceToProfile(
  userId: string,
  resourceType: ShareResourceType,
  resourceId: string,
  title: string,
  snapshot: Binder | Deck,
): Promise<PublishedResource> {
  const client = requireClient()

  // Reuse existing share for this resource if present; else create one.
  const existing = (await listUserShareLinks(userId)).find(
    (l) => l.resourceType === resourceType && l.resourceId === resourceId,
  )

  let token: string
  if (existing) {
    token = existing.token
    const { error: updErr } = await client
      .from('share_links')
      .update({ title, snapshot })
      .eq('id', existing.id)
      .eq('owner_id', userId)
    if (updErr) throw updErr
  } else {
    const link = await createShareLink(userId, resourceType, resourceId, title, snapshot)
    token = link.token
  }

  const { data, error } = await client
    .from('published_resources')
    .upsert(
      {
        owner_id: userId,
        resource_type: resourceType,
        resource_id: resourceId,
        share_token: token,
        title,
        published_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,resource_type,resource_id' },
    )
    .select('id, owner_id, resource_type, resource_id, share_token, title, published_at')
    .single()

  if (error) throw error
  return mapPublished(data)
}

export async function unpublishResource(
  userId: string,
  resourceType: ShareResourceType,
  resourceId: string,
  deleteShare = false,
) {
  const client = requireClient()
  const { data: pub, error: fetchErr } = await client
    .from('published_resources')
    .select('id, share_token')
    .eq('owner_id', userId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .maybeSingle()
  if (fetchErr) throw fetchErr

  const { error } = await client
    .from('published_resources')
    .delete()
    .eq('owner_id', userId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
  if (error) throw error

  if (deleteShare && pub?.share_token) {
    const links = await listUserShareLinks(userId)
    const link = links.find((l) => l.token === pub.share_token)
    if (link) await deleteShareLink(userId, link.id)
  }
}

export async function getShareOwnerProfile(token: string): Promise<Profile | null> {
  const client = requireClient()
  const { data: link, error } = await client
    .from('share_links')
    .select('owner_id')
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  if (!link?.owner_id) return null
  return getProfileById(link.owner_id as string)
}

export function profileUrl(username: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/u/${encodeURIComponent(username)}`
}

export function initials(profile: Profile): string {
  const src = profile.displayName || profile.username || '?'
  return src.slice(0, 2).toUpperCase()
}
