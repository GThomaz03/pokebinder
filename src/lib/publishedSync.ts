export type PublishedStamp = {
  resourceType: string
  resourceId: string
  title: string | null
}

export type LocalPublishable = {
  type: string
  id: string
  title: string
  updatedAt: number
}

export function publishSyncKey(type: string, id: string): string {
  return `${type}:${id}`
}

/** Published copies that are missing or older than the local binder/deck. */
export function resourcesToRepublish(
  published: PublishedStamp[],
  local: LocalPublishable[],
  pushedAt: ReadonlyMap<string, number>,
): LocalPublishable[] {
  const localByKey = new Map(local.map((item) => [publishSyncKey(item.type, item.id), item]))
  const due: LocalPublishable[] = []
  for (const pub of published) {
    const item = localByKey.get(publishSyncKey(pub.resourceType, pub.resourceId))
    if (!item) continue
    if (pushedAt.get(publishSyncKey(item.type, item.id)) === item.updatedAt) continue
    due.push(item)
  }
  return due
}
