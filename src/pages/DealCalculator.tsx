import { useMemo, useState } from 'react'
import {
  getProductImageCandidates,
  isExactProductImage,
} from '../data/sealed/productImages'
import { PRODUCT_TYPE_LABELS, productsForSet } from '../data/sealed/products'
import { SEALED_SETS } from '../data/sealed/sets'
import { useBoosterPrices } from '../hooks/useBoosterPrices'
import {
  DEAL_LEVEL_LABELS,
  evaluateDeal,
  formatBrl,
  formatPct,
} from '../lib/dealCalculator'
import type { DealLevel, SealedProductType } from '../types/sealed'
import './DealCalculator.css'

const LEVEL_ORDER: DealLevel[] = ['great', 'good', 'average', 'expensive']

export function DealCalculatorPage() {
  const { getPrice, getDefaultPrice, hasOverride, setPrice, resetPrice } = useBoosterPrices()

  const [setId, setSetId] = useState('me02')
  const [productId, setProductId] = useState('blister-4')
  const [typeFilter, setTypeFilter] = useState<SealedProductType | 'all'>('all')
  const [promoInput, setPromoInput] = useState('')
  const [boosterDraft, setBoosterDraft] = useState<string | null>(null)
  const [imgIndex, setImgIndex] = useState(0)

  const products = useMemo(() => {
    const list = productsForSet(setId)
    if (typeFilter === 'all') return list
    return list.filter((p) => p.type === typeFilter)
  }, [setId, typeFilter])

  const product = products.find((p) => p.id === productId) ?? products[0]

  const imageCandidates = useMemo(() => {
    if (!product) return [] as string[]
    return getProductImageCandidates(setId, product.id)
  }, [setId, product])

  const productImage = imageCandidates[imgIndex] ?? null
  const exactImage = isExactProductImage(setId, product?.id ?? '', productImage)

  const setName = SEALED_SETS.find((s) => s.id === setId)?.name ?? setId

  const storedBooster = getPrice(setId)
  const boosterDisplay =
    boosterDraft !== null ? boosterDraft : String(storedBooster).replace('.', ',')

  const promoPrice = parseBrlInput(promoInput)
  const boosterPrice = parseBrlInput(
    boosterDraft !== null ? boosterDraft : String(storedBooster),
  )

  const result = useMemo(() => {
    if (!product || promoPrice == null || boosterPrice == null) return null
    return evaluateDeal({
      packCount: product.packCount,
      boosterPrice,
      promoPrice,
    })
  }, [product, promoPrice, boosterPrice])

  function onSetChange(nextId: string) {
    setSetId(nextId)
    setBoosterDraft(null)
    setImgIndex(0)
  }

  function onImageError() {
    setImgIndex((i) => (i + 1 < imageCandidates.length ? i + 1 : imageCandidates.length))
  }

  function onBoosterBlur() {
    if (boosterDraft === null) return
    const parsed = parseBrlInput(boosterDraft)
    if (parsed != null) {
      setPrice(setId, parsed)
    }
    setBoosterDraft(null)
  }

  const typeOptions = useMemo(() => {
    const types = new Set(productsForSet(setId).map((p) => p.type))
    return Array.from(types)
  }, [setId])

  return (
    <div className="deal-page">
      <header className="deal-hero">
        <p className="eyebrow">PokéBinder</p>
        <h1>Calculadora de Bom Negócio</h1>
        <p>
          Compare o preço da promoção com o equivalente em boosters avulsos e veja se
          compensa.
        </p>
      </header>

      <div className="deal-layout">
        <form
          className="deal-form"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Dados da promoção"
        >
          <label className="deal-field">
            <span>Coleção</span>
            <select value={setId} onChange={(e) => onSetChange(e.target.value)}>
              {SEALED_SETS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.series ? ` · ${s.series}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="deal-field">
            <span>Tipo de produto</span>
            <select
              value={typeFilter}
              onChange={(e) => {
                const v = e.target.value as SealedProductType | 'all'
                setTypeFilter(v)
                const nextList =
                  v === 'all'
                    ? productsForSet(setId)
                    : productsForSet(setId).filter((p) => p.type === v)
                if (nextList.length && !nextList.some((p) => p.id === productId)) {
                  setProductId(nextList[0].id)
                  setImgIndex(0)
                }
              }}
            >
              <option value="all">Todos</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="deal-field">
            <span>Produto</span>
            <select
              value={product?.id ?? ''}
              onChange={(e) => {
                setProductId(e.target.value)
                setImgIndex(0)
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.packCount}×)
                </option>
              ))}
            </select>
          </label>

          <div className="deal-product-preview">
            {productImage && imgIndex < imageCandidates.length ? (
              <img
                key={productImage}
                src={productImage}
                alt={`${product?.name ?? 'Produto'} — ${setName}`}
                className="deal-product-img"
                onError={onImageError}
              />
            ) : (
              <div className="deal-product-placeholder" role="img" aria-label="Sem imagem do produto">
                <span>Imagem indisponível</span>
                <small>
                  {product?.name}
                  {product ? ` · ${product.packCount} boosters` : ''}
                </small>
              </div>
            )}
            <p className="deal-product-caption">
              {product?.name} · {setName}
              <span>
                {exactImage
                  ? 'Embalagem da coleção'
                  : productImage
                    ? 'Ilustrativa da coleção (produto similar)'
                    : 'Sem foto cadastrada'}
              </span>
            </p>
          </div>

          {product?.notes && <p className="deal-note">{product.notes}</p>}

          <label className="deal-field">
            <span>Preço da promoção (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex.: 89,90"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              autoComplete="off"
            />
          </label>

          <label className="deal-field">
            <span>
              Preço base do booster
              {hasOverride(setId) ? ' (editado)' : ' (padrão)'}
            </span>
            <div className="deal-booster-row">
              <input
                type="text"
                inputMode="decimal"
                value={boosterDisplay}
                onChange={(e) => setBoosterDraft(e.target.value)}
                onBlur={onBoosterBlur}
                onFocus={() => {
                  if (boosterDraft === null) {
                    setBoosterDraft(String(storedBooster).replace('.', ','))
                  }
                }}
                autoComplete="off"
                aria-describedby="booster-hint"
              />
              {hasOverride(setId) && (
                <button
                  type="button"
                  className="btn ghost deal-reset"
                  onClick={() => {
                    resetPrice(setId)
                    setBoosterDraft(null)
                  }}
                >
                  Resetar
                </button>
              )}
            </div>
            <span id="booster-hint" className="deal-hint">
              Padrão da coleção: {formatBrl(getDefaultPrice(setId))}. Seu valor fica salvo
              neste dispositivo.
            </span>
          </label>
        </form>

        <section className="deal-result" aria-live="polite">
          {!result || !product ? (
            <div className="deal-result-empty">
              <p>Informe o preço da promoção para calcular.</p>
              {product && boosterPrice != null && (
                <p className="deal-breakdown-preview">
                  Referência: {product.packCount} boosters × {formatBrl(boosterPrice)} ={' '}
                  <strong>{formatBrl(product.packCount * boosterPrice)}</strong>
                </p>
              )}
            </div>
          ) : (
            <>
              <p className={`deal-badge deal-badge--${result.level}`}>
                {DEAL_LEVEL_LABELS[result.level]}
              </p>
              <dl className="deal-stats">
                <div>
                  <dt>Preço justo</dt>
                  <dd>{formatBrl(result.fairPrice)}</dd>
                </div>
                <div>
                  <dt>Você paga</dt>
                  <dd>{formatBrl(result.promoPrice)}</dd>
                </div>
                <div>
                  <dt>{result.diff <= 0 ? 'Economia' : 'A mais'}</dt>
                  <dd className={result.diff <= 0 ? 'is-save' : 'is-over'}>
                    {formatBrl(Math.abs(result.diff))} ({formatPct(result.pct)})
                  </dd>
                </div>
              </dl>
              <p className="deal-breakdown">
                {result.packCount} boosters × {formatBrl(result.boosterPrice)} ={' '}
                {formatBrl(result.fairPrice)}
              </p>
            </>
          )}

          <aside className="deal-legend" aria-label="Níveis de negócio">
            <p className="deal-legend-title">Níveis</p>
            <ul>
              {LEVEL_ORDER.map((level) => (
                <li key={level}>
                  <span className={`deal-dot deal-dot--${level}`} aria-hidden />
                  <span>
                    {DEAL_LEVEL_LABELS[level]}
                    <small>{levelHint(level)}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="deal-disclaimer">
              A comparação considera só o equivalente em boosters. Promos, sleeves, dados e
              outros extras não entram no cálculo.
            </p>
          </aside>
        </section>
      </div>
    </div>
  )
}

function parseBrlInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '')
  if (!cleaned) return null
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.')
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}

function levelHint(level: DealLevel): string {
  switch (level) {
    case 'great':
      return '≤ −20%'
    case 'good':
      return '−20% a −8%'
    case 'average':
      return '−8% a +8%'
    case 'expensive':
      return '> +8%'
  }
}
