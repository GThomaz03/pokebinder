import { useEffect, useState } from 'react'
import { formatPrice, getCachedCard, hydrateCard } from '../../api/prices'
import { extractMarketsForVariant } from '../../api/prices/pricingExtract'
import { baseCardId, getCard, parseOwnedKey } from '../../api/tcgdex'
import { CardImage } from '../CardImage'
import { useLanguage } from '../../hooks/useLanguage'
import type { BinderSettings, PriceMarket } from '../../types'
import './CardDetailsModal.css'

type VariantRow = {
  key: string
  label: string
  price: string | null
  yours?: boolean
}

type Props = {
  open: boolean
  cardKey: string
  settings: BinderSettings
  ownedKeys?: string[]
  onClose: () => void
}

export function CardDetailsModal({
  open,
  cardKey,
  settings,
  ownedKeys = [],
  onClose,
}: Props) {
  const { lang } = useLanguage()
  const [tick, setTick] = useState(0)
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [meta, setMeta] = useState<{
    rarity?: string
    illustrator?: string
    types?: string[]
    setTotal?: string
  }>({})

  const parsed = parseOwnedKey(cardKey)
  const cardId = parsed.cardId
  const fetchLang = parsed.lang ?? lang
  const ownedKeySig = ownedKeys.join('|')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const variantParts = parseOwnedKey(cardKey).variantParts

    hydrateCard(fetchLang, cardKey, true).then(() => {
      if (!cancelled) setTick((t) => t + 1)
    })
    getCard(fetchLang, cardId)
      .then((card) => {
        if (cancelled || !card) return
        const full = card as {
          rarity?: string
          illustrator?: string
          types?: string[]
          set?: { cardCount?: { official?: number; total?: number } }
          variants?: Record<string, boolean>
          variants_detailed?: Array<{
            type: string
            stamp?: string[]
            foil?: string
            pricing?: {
              cardmarket?: { avg?: number | null }
              tcgplayer?: Record<string, { marketPrice?: number | null } | null>
            }
          }>
          pricing?: {
            cardmarket?: { avg?: number | null }
            tcgplayer?: Record<string, { marketPrice?: number | null } | null>
          }
        }
        const setTotal =
          full.set?.cardCount?.total ?? full.set?.cardCount?.official
        setMeta({
          rarity: full.rarity,
          illustrator: full.illustrator,
          types: full.types,
          setTotal: setTotal != null ? String(setTotal) : undefined,
        })

        const rows: VariantRow[] = []
        if (full.variants_detailed?.length) {
          for (const v of full.variants_detailed) {
            const extras = [...(v.stamp ?? []), ...(v.foil ? [v.foil] : [])]
            const key = [cardId, fetchLang, v.type, ...extras].join('::')
            const { eur, usd } = extractMarketsForVariant(
              full.pricing,
              v.pricing,
              v.type,
              settings.priceMarket,
            )
            const priceObj = { eur, usd, updated: Date.now() }
            rows.push({
              key,
              label: [v.type, ...extras].filter(Boolean).join(' · '),
              price: formatPrice(priceObj, settings.priceMarket),
              yours: ownedKeys.includes(key) || ownedKeys.includes(cardId),
            })
          }
        } else {
          rows.push({
            key: cardKey,
            label: variantParts.join(' · ') || 'Normal',
            price: formatPrice(getCachedCard(cardId)?.price, settings.priceMarket),
            yours: ownedKeys.some(
              (k) => k === cardKey || baseCardId(k) === cardId,
            ),
          })
        }
        setVariants(rows)
      })
      .catch(() => {
        if (!cancelled) setVariants([])
      })
    return () => {
      cancelled = true
    }
    // ownedKeySig evita loop por referência nova de ownedKeys
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ownedKeys via ownedKeySig
  }, [open, cardKey, cardId, fetchLang, settings.priceMarket, ownedKeySig])

  void tick
  if (!open) return null

  const cached = getCachedCard(cardId)
  const setLine = [
    cached?.setName,
    cached?.localId
      ? `#${cached.localId}${meta.setTotal ? `/${meta.setTotal}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="details-backdrop" onClick={onClose} role="presentation">
      <div
        className="details-modal"
        role="dialog"
        aria-modal
        aria-label="Detalhes da carta"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="details-art">
          {cached ? (
            <CardImage
              src={cached.image}
              alt={cached.name}
              quality="high"
              cardId={cached.id}
              cardName={cached.name}
              localId={cached.localId}
            />
          ) : (
            <div className="ph">Sem imagem</div>
          )}
        </div>
        <div className="details-panel">
          <header>
            <div>
              <h2>{cached?.name ?? 'Carta'}</h2>
              <p>{setLine}</p>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          </header>

          <section>
            <h3>Preços estimados (BRL)</h3>
            <ul className="price-rows">
              {variants.map((v) => (
                <li key={v.key}>
                  <span className="v-label">
                    {v.label}
                    {v.yours && <em>YOURS</em>}
                  </span>
                  <span className="v-price">{v.price ?? '—'}</span>
                </li>
              ))}
            </ul>
            <p className="note">
              Near Mint · estimado em R$ via câmbio ({marketLabel(settings.priceMarket)}) — não
              reflete necessariamente o preço no Brasil.
            </p>
          </section>

          <section>
            <h3>Detalhes</h3>
            <dl className="meta-grid">
              <div>
                <dt>Raridade</dt>
                <dd>{meta.rarity ?? '—'}</dd>
              </div>
              <div>
                <dt>Artista</dt>
                <dd>{meta.illustrator ?? '—'}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd className="types">
                  {meta.types?.length
                    ? meta.types.map((t) => (
                        <span key={t} className="type-pill">
                          {t}
                        </span>
                      ))
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Coleção</dt>
                <dd>{cached?.setName ?? '—'}</dd>
              </div>
              <div>
                <dt>Onde obter</dt>
                <dd>
                  {cached?.setId
                    ? `Set ${cached.setId}${cached.setName ? ` (${cached.setName})` : ''}`
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}

function marketLabel(m: PriceMarket) {
  return m === 'cardmarket' ? 'Cardmarket' : 'TCGPlayer'
}
