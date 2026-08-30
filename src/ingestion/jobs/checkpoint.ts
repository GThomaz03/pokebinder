import type { SupabaseClient } from '@supabase/supabase-js'

export class CheckpointManager {
  private db: SupabaseClient
  private source: string

  constructor(db: SupabaseClient, source: string) {
    this.db = db
    this.source = source
  }

  async getStatus(entityType: string, entityId: string): Promise<string | null> {
    const { data } = await this.db
      .from('sync_checkpoints')
      .select('status')
      .eq('source', this.source)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .maybeSingle()
    return data?.status ?? null
  }

  async isDone(entityType: string, entityId: string): Promise<boolean> {
    const status = await this.getStatus(entityType, entityId)
    return status === 'completed' || status === 'skipped'
  }

  async mark(
    entityType: string,
    entityId: string,
    status: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.from('sync_checkpoints').upsert(
      {
        source: this.source,
        entity_type: entityType,
        entity_id: entityId,
        status,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source,entity_type,entity_id' },
    )
  }

  async listPending(entityType: string, limit = 100) {
    const { data } = await this.db
      .from('sync_checkpoints')
      .select('entity_id, metadata')
      .eq('source', this.source)
      .eq('entity_type', entityType)
      .eq('status', 'pending')
      .limit(limit)
    return data ?? []
  }
}

export class SyncJobLogger {
  private jobId: string | null = null
  private db: SupabaseClient
  private sourceId: string | null
  private jobType: string

  constructor(db: SupabaseClient, sourceId: string | null, jobType: string) {
    this.db = db
    this.sourceId = sourceId
    this.jobType = jobType
  }

  async start(metadata: Record<string, unknown> = {}) {
    const { data, error } = await this.db
      .from('sync_jobs')
      .insert({
        source_id: this.sourceId,
        job_type: this.jobType,
        status: 'running',
        started_at: new Date().toISOString(),
        metadata,
      })
      .select('id')
      .single()
    if (error) throw error
    this.jobId = data.id
    return data.id as string
  }

  async finish(
    status: 'completed' | 'partial' | 'failed',
    stats: {
      found: number
      created: number
      updated: number
      skipped: number
      failed: number
    },
    errorMessage?: string,
  ) {
    if (!this.jobId) return
    await this.db
      .from('sync_jobs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        records_found: stats.found,
        records_created: stats.created,
        records_updated: stats.updated,
        records_skipped: stats.skipped,
        records_failed: stats.failed,
        error_message: errorMessage ?? null,
      })
      .eq('id', this.jobId)
  }

  async logError(opts: {
    source: string
    externalId?: string
    endpoint?: string
    errorType: string
    statusCode?: number
    message: string
    payload?: unknown
    retryCount?: number
  }) {
    if (!this.jobId) return
    await this.db.from('sync_errors').insert({
      sync_job_id: this.jobId,
      source: opts.source,
      external_id: opts.externalId ?? null,
      endpoint: opts.endpoint ?? null,
      error_type: opts.errorType,
      status_code: opts.statusCode ?? null,
      message: opts.message,
      payload: opts.payload ?? null,
      retry_count: opts.retryCount ?? 0,
    })
  }

  get id() {
    return this.jobId
  }
}
