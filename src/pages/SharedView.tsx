import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CardImage } from '../components/CardImage'
import { PageGrid } from '../components/binder/PageGrid'
import { PageTurnNav } from '../components/binder/PageTurnNav'
import { getCachedCard, getCachedPrice, hydrateCard, formatPrice } from '../api/prices'
import { baseCardId, parseOwnedKey } from '../api/tcgdex'
import { fetchShareLink, type ShareLink } from '../lib/cloudStorage'
import { deckTotal } from '../lib/deckRules'
import { binderTotalBrl, getPokedexName } from '../lib/binderUtils'
import { getShareOwnerProfile, type Profile } from '../lib/social'
import type { Binder, Deck, PriceMarket, Slot } from '../types'
import { gridCols, gridRows, pageGridAspect, slotDisplayCardId } from '../types'
import './SharedView.css'

export function SharedViewPage() {
  const { token = '' } = useParams()
  const [link, setLink] = useState<ShareLink | null>(null)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOwner(null)
    fetchShareLink(token)
      .then(async (data) => {
        if (cancelled) return
        if (!data) {
          setError('Link inválido ou expirado.')
          return
        }
        setLink(data)
        try {
          const profile = await getShareOwnerProfile(token)
          if (!cancelled) setOwner(profile)
        } catch {
          /* owner lookup optional */
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="shared-view shared-view--state">
        <p className="shared-status">Carregando compartilhamento…</p>
      </div>
    )
  }

  if (error || !link) {
    return (
      <div className="shared-view shared-view--state">
        <p className="shared-error">{error ?? 'Não encontrado.'}</p>
        <Link to="/" className="btn ghost">
          Ir para o app
        </Link>
      </div>
    )
  }

  const ownerLabel = owner?.displayName || owner?.username
  const ownerPath = owner?.username ? `/u/${owner.username}` : null

  return (
    <div className="shared-view">
      <header className="shared-top">
        <div className="shared-top__brand">
          <p className="shared-eyebrow">PokéBinder</p>
          <div className="shared-top__titles">
            <h1>{link.title ?? 'Coleção'}</h1>
            <p className="shared-meta">
              {link.resourceType === 'binder'
                ? 'Fichário compartilhado · somente leitura'
                : 'Deck compartilhado · somente leitura'}
              {ownerLabel ? ` · ${ownerLabel}` : ''}
            </p>
          </div>
        </div>
        <div className="shared-top__actions">
          {ownerPath && (
            <Link to={ownerPath} className="btn ghost shared-cta">
              Ver perfil
            </Link>
          )}
          <Link to="/" className="btn primary shared-cta">
            Criar o seu
          </Link>
        </div>
      </header>

      {link.resourceType === 'binder' ? (
        <SharedBinderView binder={link.snapshot as Binder} />
      ) : (
        <SharedDeckView deck={link.snapshot as Deck} />
      )}
    </div>
  )
}

type SearchMatch = { pageIndex: number; slotIndex: number; label: string }

type TurnAnim = {
  dir: 'prev' | 'next'
  fromLeft: number
  toLeft: number
  /** 0..1 while dragging; animates to 1 while playing */
  progress: number
  playing: boolean
  durationMs: number
}

const TURN_MS = 720

function SharedBinderView({ binder }: { binder: Binder }) {
  const [pageIndex, setPageIndex] = useState(0)
  const [singlePage, setSinglePage] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
  )
  const [search, setSearch] = useState('')
  const [matchCursor, setMatchCursor] = useState(0)
  const [hydrateTick, setHydrateTick] = useState(0)
  const [showPrices, setShowPrices] = useState(() => binder.settings?.showPrices ?? true)
  const [turn, setTurn] = useState<TurnAnim | null>(null)
  const goPrevRef = useRef(() => {})
  const goNextRef = useRef(() => {})
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const sync = () => setSinglePage(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const priceMarket: PriceMarket = binder.settings?.priceMarket ?? 'cardmarket'

  const totalLabel = useMemo(() => {
    void hydrateTick
    const total = binderTotalBrl({
      ...binder,
      settings: { ...binder.settings, priceMarket },
    })
    return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }, [binder, hydrateTick, priceMarket])

  const pages = binder.pages
  const step = singlePage ? 1 : 2
  const totalSteps = Math.max(1, Math.ceil(pages.length / step))
  const safeStepIndex = Math.min(Math.floor(pageIndex / step), totalSteps - 1)
  const leftIndex = safeStepIndex * step
  const rightIndex = singlePage ? -1 : leftIndex + 1
  const cols = gridCols(binder.grid)
  const rows = gridRows(binder.grid)
  const aspect = pageGridAspect(binder.grid)
  const canPrev = leftIndex > 0
  const canNext = leftIndex + step < pages.length
  const pageLabel =
    !singlePage && rightIndex < pages.length
      ? `${leftIndex + 1}–${leftIndex + 2}`
      : `${leftIndex + 1}`

  useEffect(() => {
    if (pageIndex !== leftIndex) setPageIndex(leftIndex)
  }, [pageIndex, leftIndex])

  // Hydrate visible + all card arts so search can match names.
  useEffect(() => {
    let cancelled = false
    const keys: string[] = []
    for (const page of binder.pages) {
      for (const slot of page.slots) {
        const id = slotDisplayCardId(slot)
        if (id) keys.push(id)
      }
    }
    void Promise.all(
      keys.map((key) => {
        const { lang: keyLang } = parseOwnedKey(key)
        return hydrateCard(keyLang ?? 'pt', key, Boolean(keyLang))
      }),
    ).then(() => {
      if (!cancelled) setHydrateTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [binder])

  const searchMatches = useMemo(() => {
    void hydrateTick
    const q = search.trim().toLowerCase()
    if (!q) return [] as SearchMatch[]
    const out: SearchMatch[] = []
    binder.pages.forEach((page, pageIndex) => {
      page.slots.forEach((slot, slotIndex) => {
        if (!slot) return
        if (slot.type === 'pokedex') {
          const name = getPokedexName(slot.dexId).toLowerCase()
          const num = String(slot.dexId)
          const padded = num.padStart(3, '0')
          const top = slot.topCardId ? getCachedCard(baseCardId(slot.topCardId)) : undefined
          if (
            name.includes(q) ||
            num.includes(q) ||
            padded.includes(q) ||
            `#${padded}`.includes(q) ||
            top?.name.toLowerCase().includes(q) ||
            top?.localId.toLowerCase().includes(q)
          ) {
            out.push({
              pageIndex,
              slotIndex,
              label: `#${padded} ${getPokedexName(slot.dexId)}`,
            })
          }
          return
        }
        const cached = getCachedCard(baseCardId(slot.cardId))
        if (
          cached?.name.toLowerCase().includes(q) ||
          cached?.localId.toLowerCase().includes(q) ||
          slot.cardId.toLowerCase().includes(q) ||
          (cached?.setName ?? '').toLowerCase().includes(q)
        ) {
          out.push({
            pageIndex,
            slotIndex,
            label: cached?.name ?? slot.cardId,
          })
        }
      })
    })
    return out
  }, [binder, search, hydrateTick])

  useEffect(() => {
    setMatchCursor(0)
  }, [search])

  const activeMatch = searchMatches.length
    ? searchMatches[Math.min(matchCursor, searchMatches.length - 1)]
    : null

  const activeMatchKey = activeMatch
    ? `${activeMatch.pageIndex}-${activeMatch.slotIndex}`
    : ''

  useEffect(() => {
    if (!activeMatch || busyRef.current) return
    setPageIndex(singlePage ? activeMatch.pageIndex : Math.floor(activeMatch.pageIndex / 2) * 2)
  }, [activeMatchKey, singlePage]) // eslint-disable-line react-hooks/exhaustive-deps -- jump only when the active hit changes

  const searchHits = useMemo(() => {
    const set = new Set<string>()
    for (const m of searchMatches) set.add(`p${m.pageIndex}-s${m.slotIndex}`)
    return set
  }, [searchMatches])

  function clearTurnTimer() {
    if (turnTimer.current) {
      clearTimeout(turnTimer.current)
      turnTimer.current = null
    }
  }

  function reduceMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  }

  function playTurn(dir: 'prev' | 'next') {
    if (busyRef.current) return
    if (dir === 'prev' && !canPrev) return
    if (dir === 'next' && !canNext) return

    const fromLeft = turn?.dir === dir ? turn.fromLeft : leftIndex
    const toLeft =
      turn?.dir === dir
        ? turn.toLeft
        : dir === 'next'
          ? Math.min(pages.length - 1, leftIndex + step)
          : Math.max(0, leftIndex - step)

    if (toLeft === fromLeft) return

    if (reduceMotion()) {
      setPageIndex(toLeft)
      setTurn(null)
      return
    }

    const startProgress =
      turn && turn.dir === dir && !turn.playing ? turn.progress : 0

    if (startProgress >= 0.92) {
      setPageIndex(toLeft)
      setTurn(null)
      return
    }

    busyRef.current = true
    clearTurnTimer()
    const ms = Math.max(220, Math.round(TURN_MS * (1 - startProgress)))

    // Ensure a starting frame, then animate progress → 1 via CSS transition.
    setTurn({
      dir,
      fromLeft,
      toLeft,
      progress: startProgress,
      playing: false,
      durationMs: ms,
    })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTurn({
          dir,
          fromLeft,
          toLeft,
          progress: 1,
          playing: true,
          durationMs: ms,
        })
      })
    })

    turnTimer.current = setTimeout(() => {
      setPageIndex(toLeft)
      setTurn(null)
      busyRef.current = false
      turnTimer.current = null
    }, ms + 32)
  }

  function goPrev() {
    playTurn('prev')
  }

  function goNext() {
    playTurn('next')
  }

  goPrevRef.current = goPrev
  goNextRef.current = goNext

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Enter' && target.tagName === 'INPUT' && searchMatches.length > 1) {
          e.preventDefault()
          setMatchCursor((c) => (c + 1) % searchMatches.length)
        }
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrevRef.current()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNextRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchMatches.length])

  useEffect(() => {
    return () => clearTurnTimer()
  }, [])

  function jumpToNextMatch() {
    if (searchMatches.length < 2) return
    setMatchCursor((c) => (c + 1) % searchMatches.length)
  }

  function onFlipProgress(dir: 'prev' | 'next' | null, progress: number) {
    if (busyRef.current && turn?.playing) return

    if (!dir) {
      // Released without commit — PageTurnNav calls onFlipProgress(null) after finishDrag(false)
      // Commit path calls onPrev/onNext instead.
      if (turn && !turn.playing) setTurn(null)
      return
    }

    if (dir === 'prev' && !canPrev) return
    if (dir === 'next' && !canNext) return

    const fromLeft = leftIndex
    const toLeft =
      dir === 'next'
        ? Math.min(pages.length - 1, leftIndex + step)
        : Math.max(0, leftIndex - step)

    setTurn({
      dir,
      fromLeft,
      toLeft,
      progress: Math.max(0, Math.min(1, progress)),
      playing: false,
      durationMs: TURN_MS,
    })
  }

  // Under the flip leaf: keep the stationary page, reveal the incoming side.
  const baseLeft = turn
    ? singlePage
      ? turn.toLeft
      : turn.dir === 'next'
        ? turn.fromLeft
        : turn.toLeft
    : leftIndex
  const baseRight = singlePage
    ? -1
    : turn
      ? turn.dir === 'next'
        ? turn.toLeft + 1
        : turn.fromLeft + 1
      : leftIndex + 1
  const baseLeftPage = pages[baseLeft] ?? null
  const baseRightPage = !singlePage ? pages[baseRight] ?? null : null

  const fromLeftPage = turn ? pages[turn.fromLeft] : null
  const fromRightPage = turn && !singlePage ? pages[turn.fromLeft + 1] ?? null : null
  const toLeftPage = turn ? pages[turn.toLeft] : null
  const toRightPage = turn && !singlePage ? pages[turn.toLeft + 1] ?? null : null

  const leafFrontPage =
    turn?.dir === 'next'
      ? singlePage
        ? fromLeftPage
        : fromRightPage
      : fromLeftPage
  const leafBackPage =
    turn?.dir === 'next'
      ? toLeftPage
      : singlePage
        ? toLeftPage
        : toRightPage
  const pageProps = {
    cols,
    rows,
    aspect,
    searchHits,
    activeMatch,
    showPrices,
    priceMarket,
  }

  const flipStyle = turn
    ? ({
        ['--flip-progress' as string]: String(turn.progress),
        ['--turn-ms' as string]: `${turn.durationMs}ms`,
      } as CSSProperties)
    : undefined

  return (
    <section className="shared-binder">
      <div className="shared-toolbar">
        <label className="shared-search">
          <span className="shared-search__icon" aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar Pokémon, nº ou carta…"
            aria-label="Pesquisar no fichário"
          />
        </label>

        {search.trim() && (
          <div className="shared-search-meta" aria-live="polite">
            {searchMatches.length === 0 ? (
              <span className="shared-search-empty">Nenhum resultado</span>
            ) : (
              <>
                <span className="shared-search-count">
                  {Math.min(matchCursor, searchMatches.length - 1) + 1}/{searchMatches.length}
                  {activeMatch ? ` · ${activeMatch.label}` : ''}
                </span>
                {searchMatches.length > 1 && (
                  <button
                    type="button"
                    className="shared-search-next"
                    onClick={jumpToNextMatch}
                    aria-label="Próximo resultado"
                    title="Próximo resultado"
                  >
                    ›
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="shared-value-controls">
          <span
            className="shared-total"
            title="Total estimado em BRL (conversão FX de preços internacionais)"
          >
            Total estimado {totalLabel}
          </span>
          <label className="shared-price-toggle">
            <input
              type="checkbox"
              checked={showPrices}
              onChange={(e) => setShowPrices(e.target.checked)}
            />
            <span>Preços</span>
          </label>
        </div>

        <p className="shared-page-info">
          Páginas {pageLabel} de {pages.length}
        </p>
      </div>

      <div className="shared-spread-host">
        <div
          className={[
            'shared-spread',
            singlePage ? 'is-single' : '',
            turn ? 'is-turning' : '',
            turn?.dir === 'next' ? 'is-turning-next' : '',
            turn?.dir === 'prev' ? 'is-turning-prev' : '',
            turn?.playing ? 'is-playing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={flipStyle}
        >
          {/* Destination (or current) spread underneath */}
          {baseLeftPage && (
            <SharedPage page={baseLeftPage} pageIndex={baseLeft} {...pageProps} />
          )}
          {baseRightPage ? (
            <SharedPage page={baseRightPage} pageIndex={baseRight} {...pageProps} />
          ) : !singlePage ? (
            <div className="shared-page shared-page--placeholder" aria-hidden>
              <div className="shared-page__label"> </div>
              <PageGrid cols={cols} rows={rows} aspect={aspect}>
                {null}
              </PageGrid>
            </div>
          ) : null}

          {/* Flipping leaf: front = leaving page, back = arriving page */}
          {turn && leafFrontPage && (
            <div
              className={`shared-turn-leaf shared-turn-leaf--${turn.dir}${
                singlePage ? ' is-full' : ''
              }`}
              aria-hidden
            >
              <div className="shared-turn-leaf__face shared-turn-leaf__front">
                <SharedPage
                  page={leafFrontPage}
                  pageIndex={
                    turn.dir === 'next'
                      ? singlePage
                        ? turn.fromLeft
                        : turn.fromLeft + 1
                      : turn.fromLeft
                  }
                  {...pageProps}
                />
              </div>
              <div className="shared-turn-leaf__face shared-turn-leaf__back">
                {leafBackPage ? (
                  <SharedPage
                    page={leafBackPage}
                    pageIndex={
                      turn.dir === 'next'
                        ? turn.toLeft
                        : singlePage
                          ? turn.toLeft
                          : turn.toLeft + 1
                    }
                    {...pageProps}
                  />
                ) : (
                  <div className="shared-page shared-page--placeholder">
                    <div className="shared-page__label"> </div>
                  </div>
                )}
              </div>
              <div className="shared-turn-leaf__shade" />
            </div>
          )}

          <PageTurnNav
            canPrev={canPrev && !turn?.playing}
            canNext={canNext && !turn?.playing}
            label={pageLabel}
            onPrev={goPrev}
            onNext={goNext}
            onFlipProgress={onFlipProgress}
          />
        </div>
      </div>
    </section>
  )
}

function SharedPage({
  page,
  pageIndex,
  cols,
  rows,
  aspect,
  searchHits,
  activeMatch,
  showPrices,
  priceMarket,
}: {
  page: NonNullable<Binder['pages'][number]>
  pageIndex: number
  cols: number
  rows: number
  aspect: number
  searchHits: Set<string>
  activeMatch: SearchMatch | null
  showPrices: boolean
  priceMarket: PriceMarket
}) {
  return (
    <div className="shared-page">
      <div className="shared-page__label">{page.label || `Página ${pageIndex + 1}`}</div>
      <PageGrid cols={cols} rows={rows} aspect={aspect}>
        {page.slots.map((slot, si) => {
          const hitKey = `p${pageIndex}-s${si}`
          const isHit = searchHits.has(hitKey)
          const isActive =
            activeMatch?.pageIndex === pageIndex && activeMatch.slotIndex === si
          return (
            <SharedSlot
              key={`${page.id}-${si}`}
              slot={slot}
              hit={isHit}
              active={isActive}
              showPrices={showPrices}
              priceMarket={priceMarket}
            />
          )
        })}
      </PageGrid>
    </div>
  )
}

function SharedSlot({
  slot,
  hit,
  active,
  showPrices,
  priceMarket,
}: {
  slot: Slot
  hit?: boolean
  active?: boolean
  showPrices?: boolean
  priceMarket?: PriceMarket
}) {
  const [tick, setTick] = useState(0)
  const rawId = slotDisplayCardId(slot)
  const cardId = rawId ? baseCardId(rawId) : undefined

  useEffect(() => {
    if (!rawId) return
    let cancelled = false
    const { lang: keyLang } = parseOwnedKey(rawId)
    hydrateCard(keyLang ?? 'pt', rawId, Boolean(keyLang)).then(() => {
      if (!cancelled) setTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [rawId])

  void tick
  const cached = cardId ? getCachedCard(cardId) : undefined
  const priceObj = rawId ? getCachedPrice(rawId) ?? cached?.price : undefined
  const price =
    showPrices && priceMarket ? formatPrice(priceObj, priceMarket) : null

  if (!slot) {
    return <div className="shared-slot empty" aria-hidden />
  }

  const className = [
    'shared-slot',
    slot.type === 'pokedex' ? 'pokedex' : 'card',
    hit ? 'is-hit' : '',
    active ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (slot.type === 'pokedex') {
    return (
      <div className={className}>
        {cardId || cached?.image ? (
          <CardImage
            src={cached?.image}
            alt={getPokedexName(slot.dexId)}
            quality="high"
            loading="eager"
            cardId={cardId}
            cardName={cached?.name}
            localId={cached?.localId}
          />
        ) : (
          <span className="dex-placeholder">
            <strong>#{String(slot.dexId).padStart(3, '0')}</strong>
            <em>{getPokedexName(slot.dexId)}</em>
          </span>
        )}
        {price && <span className="shared-price-tag">{price}</span>}
      </div>
    )
  }

  return (
    <div className={className}>
      <CardImage
        src={cached?.image}
        alt={cached?.name || ''}
        quality="high"
        loading="eager"
        cardId={cardId}
        cardName={cached?.name}
        localId={cached?.localId}
      />
      {price && <span className="shared-price-tag">{price}</span>}
    </div>
  )
}

function SharedDeckView({ deck }: { deck: Deck }) {
  const total = deckTotal(deck)
  const grouped = useMemo(() => {
    const map = new Map<string, typeof deck.cards>()
    for (const c of deck.cards) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    return map
  }, [deck.cards])

  return (
    <section className="shared-deck">
      {deck.notes && <p className="shared-deck-notes">{deck.notes}</p>}
      <p className="shared-deck-total">{total}/60 cartas</p>
      {(['Pokemon', 'Trainer', 'Energy'] as const).map((cat) => {
        const cards = grouped.get(cat)
        if (!cards?.length) return null
        return (
          <div key={cat} className="shared-deck-group">
            <h2>{cat === 'Pokemon' ? 'Pokémon' : cat === 'Trainer' ? 'Treinadores' : 'Energias'}</h2>
            <ul>
              {cards.map((c) => (
                <li key={c.cardId}>
                  <span className="qty">{c.qty}×</span>
                  {c.image ? (
                    <img src={c.image} alt="" width={36} height={50} loading="lazy" />
                  ) : (
                    <CardImage cardId={c.cardId} alt="" />
                  )}
                  <span>{c.name}</span>
                  {c.setName && <span className="set">{c.setName}</span>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
