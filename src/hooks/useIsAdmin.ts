import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.app_metadata?.role === 'admin'
}

/** Resolve admin flag with a fresh JWT (metadata changes in dashboard need refresh). */
async function resolveIsAdmin(): Promise<boolean> {
  if (!supabase) return false

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return false

  if (isAdminUser(userData.user)) return true

  // JWT may be stale — force refresh so new app_metadata.role enters the token
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) return isAdminUser(userData.user)

  const user = refreshed.session?.user ?? userData.user
  return isAdminUser(user)
}

export function useIsAdmin(): { isAdmin: boolean; loading: boolean; loggedIn: boolean } {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = supabase
    if (!isSupabaseConfigured || !client) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const admin = await resolveIsAdmin()
      if (!cancelled) {
        const { data } = await client.auth.getUser()
        setLoggedIn(Boolean(data.user))
        setIsAdmin(admin)
        setLoading(false)
      }
    })()
    const { data: sub } = client.auth.onAuthStateChange(async () => {
      const admin = await resolveIsAdmin()
      const { data } = await client.auth.getUser()
      setLoggedIn(Boolean(data.user))
      setIsAdmin(admin)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return { isAdmin, loading, loggedIn }
}
