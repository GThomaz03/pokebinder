import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice, getCachedCard, hydrateCard, seedCardBrief } from '../api/prices'
import {
  attachStream,
  cameraErrorMessage,
  isSecureCameraContext,
  startCamera,
  stopCamera,
  switchCamera,
  type CameraHandle,
} from '../lib/scan/camera'
import {
  boxToOverlay,
  CardTracker,
  cropVideoBox,
  initDetector,
} from '../lib/scan/detector'
import { loadSetCatalog, loadSetIndex } from '../lib/scan/cardLookup'
import { outcomeFromVision, ScanDedupe } from '../lib/scan/mergeIdentity'
import { readCardOcr, terminateOcr, warmOcr } from '../lib/scan/ocr'
import { identifyByVision, initRecognizer } from '../lib/scan/recognizer'
import type { CardCandidate, ScanBox } from '../lib/scan/types'
import { CandidatePicker } from '../components/scan/CandidatePicker'
import { ManualCardSearchModal } from '../components/scan/ManualCardSearchModal'
import { CardImage } from '../components/CardImage'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import './CardScanner.css'

type SheetState = {
  cardId: string
  source: string
  added: boolean
}

type HistoryItem = {
  cardId: string
  at: number
}

export function CardScannerPage() {
  const { lang } = useLanguage()
  const { addQty, inventory } = useInventory()
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const camRef = useRef<CameraHandle | null>(null)
  const trackerRef = useRef(new CardTracker())
  const dedupeRef = useRef(new ScanDedupe())
  const identifyingRef = useRef(false)
  const lastTrackIdRef = useRef<number | null>(null)
  const lastCaptureAtRef = useRef(0)
  const pausedRef = useRef(false)
  const manualOpenRef = useRef(false)
  const candidatesOpenRef = useRef(false)
  const rafRef = useRef(0)
  const loopRunningRef = useRef(false)

  const [status, setStatus] = useState('Toque para ativar a câmara')
  const [paused, setPaused] = useState(false)
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [needsGesture, setNeedsGesture] = useState(true)
  const [overlayBox, setOverlayBox] = useState<ScanBox | null>(null)
  const [trackedBox, setTrackedBox] = useState<ScanBox | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [candidates, setCandidates] = useState<CardCandidate[]>([])
  const [ocrDebug, setOcrDebug] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualReason, setManualReason] = useState<'conflict' | 'weak' | 'none'>('none')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [detectMode, setDetectMode] = useState<'yolo' | 'contour'>('contour')

  const onFrameRef = useRef<() => Promise<void>>(async () => {})

  onFrameRef.current = async () => {
    const video = videoRef.current
    if (!video || pausedRef.current || manualOpenRef.current || candidatesOpenRef.current) return

    const tracked = await trackerRef.current.update(video)
    if (!tracked) {
      if (lastTrackIdRef.current != null) {
        dedupeRef.current.onTrackLost()
        lastTrackIdRef.current = null
      }
      setOverlayBox(null)
      setTrackedBox(null)
      drawOverlay(null)
      return
    }

    if (lastTrackIdRef.current !== tracked.trackId) {
      if (lastTrackIdRef.current != null) dedupeRef.current.onTrackLost()
      lastTrackIdRef.current = tracked.trackId
    }

    const overlay = boxToOverlay(tracked.box, video)
    setOverlayBox(overlay)
    setTrackedBox(tracked.box)
    drawOverlay(overlay)

    const sinceCapture = Date.now() - lastCaptureAtRef.current
    if (
      tracked.stableFrames >= 14 &&
      sinceCapture > 2000 &&
      !identifyingRef.current &&
      !sheet &&
      candidates.length === 0 &&
      dedupeRef.current.shouldIdentify(tracked.trackId)
    ) {
      void runIdentify(tracked.trackId, tracked.box, 'auto')
    }
  }

  function drawOverlay(box: ScanBox | null) {
    const canvas = overlayRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const rect = video.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!box) return
    ctx.strokeStyle = '#6bbf8a'
    ctx.lineWidth = 3
    ctx.shadowColor = 'rgba(107, 191, 138, 0.45)'
    ctx.shadowBlur = 8
    ctx.strokeRect(box.x, box.y, box.w, box.h)
    ctx.shadowBlur = 0
  }

  async function runIdentify(
    trackId: number,
    box: ScanBox,
    source: 'tap' | 'auto',
  ) {
    const video = videoRef.current
    if (!video || identifyingRef.current) return
    identifyingRef.current = true
    setCapturing(true)
    setSheet(null)
    setCandidates([])
    candidatesOpenRef.current = false
    setStatus(source === 'tap' ? 'A reconhecer arte…' : 'A identificar…')
    lastCaptureAtRef.current = Date.now()

    const t0 = performance.now()
    try {
      const crop = cropVideoBox(video, box, 384)

      // Visual-first (MobileCLIP worker)
      const { hits, ms: visionMs } = await identifyByVision(crop, 5)

      // OCR only for tie-break when top scores are close
      let ocr = null
      const top = hits[0]
      const second = hits[1]
      const needOcr =
        !top ||
        top.score < 0.32 ||
        (second != null && top.score - second.score < 0.04)
      if (needOcr) {
        setStatus('A confirmar com OCR…')
        try {
          ocr = await readCardOcr(crop)
        } catch {
          ocr = null
        }
        setOcrDebug(ocr?.raw ?? null)
      } else {
        setOcrDebug(`vision:${top.cardId} @ ${top.score.toFixed(3)}`)
      }

      const outcome = outcomeFromVision(hits, ocr)
      const ms = Math.round(performance.now() - t0)

      if (outcome.kind === 'identified') {
        const { cardId, source: src } = outcome.identity
        if (dedupeRef.current.isRecentDuplicate(cardId)) {
          dedupeRef.current.markIdentified(trackId, cardId)
          setStatus(`Já adicionada · ${ms}ms`)
          return
        }
        dedupeRef.current.markIdentified(trackId, cardId)
        await hydrateCard(lang, cardId)
        setSheet({ cardId, source: src, added: false })
        setStatus(`Encontrada · ${ms}ms (visão ${visionMs}ms)`)
      } else if (outcome.kind === 'candidates') {
        setCandidates(outcome.candidates)
        candidatesOpenRef.current = true
        setStatus(`${outcome.candidates.length} candidatos · ${ms}ms`)
      } else if (outcome.kind === 'manual') {
        setManualReason(outcome.reason)
        setManualOpen(true)
        manualOpenRef.current = true
        setStatus('Busca manual')
      }
    } catch (err) {
      console.warn('[scan] identify failed', err)
      setManualReason('none')
      setManualOpen(true)
      manualOpenRef.current = true
      setStatus('Falha na identificação')
    } finally {
      identifyingRef.current = false
      setCapturing(false)
    }
  }

  function onCaptureTap() {
    const video = videoRef.current
    if (!video || !ready || capturing) return
    const box =
      trackedBox ??
      ({
        x: video.videoWidth * 0.15,
        y: video.videoHeight * 0.12,
        w: video.videoWidth * 0.7,
        h: video.videoHeight * 0.76,
        score: 1,
      } satisfies ScanBox)
    const tid = lastTrackIdRef.current ?? 0
    void runIdentify(tid, box, 'tap')
  }

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  function commitCard(cardId: string, trackId?: number) {
    addQty(cardId, 1)
    const tid = trackId ?? lastTrackIdRef.current ?? 0
    dedupeRef.current.lockAfterAdd(cardId, tid)
    setHistory((h) => [{ cardId, at: Date.now() }, ...h].slice(0, 12))
    setSheet((s) => (s && s.cardId === cardId ? { ...s, added: true } : s))
    const cached = getCachedCard(cardId)
    showToast(`+1 ${cached?.name ?? cardId}`)
  }

  function pickCandidate(cardId: string) {
    const tid = lastTrackIdRef.current ?? 0
    dedupeRef.current.markIdentified(tid, cardId)
    setCandidates([])
    candidatesOpenRef.current = false
    void hydrateCard(lang, cardId).then((c) => {
      if (c) seedCardBrief(c)
      setSheet({ cardId, source: 'art', added: false })
      setStatus('Carta escolhida')
    })
  }

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    manualOpenRef.current = manualOpen
  }, [manualOpen])

  useEffect(() => {
    if (!isSecureCameraContext()) {
      setCamError(
        'A câmara exige HTTPS. No PC corre `npm run dev` e no telemóvel abre o URL https://… (aceite o certificado).',
      )
      setStatus('HTTPS necessário')
    }

    const tracker = trackerRef.current
    const dedupe = dedupeRef.current
    return () => {
      loopRunningRef.current = false
      window.clearTimeout(rafRef.current)
      stopCamera(camRef.current)
      camRef.current = null
      tracker.reset()
      dedupe.resetSession()
      void terminateOcr()
    }
  }, [])

  function startDetectLoop() {
    if (loopRunningRef.current) return
    loopRunningRef.current = true
    const loop = () => {
      if (!loopRunningRef.current) return
      void onFrameRef.current().finally(() => {
        rafRef.current = window.setTimeout(loop, 80) as unknown as number
      })
    }
    loop()
  }

  async function enableCamera() {
    if (starting) return
    setStarting(true)
    setCamError(null)
    setStatus('A pedir câmara…')
    try {
      const camPromise = startCamera('environment')
      const prepPromise = Promise.all([
        initDetector(),
        initRecognizer().catch((err) => {
          console.warn('[scan] vision', err)
          return { ready: false, indexSize: 0, model: '' }
        }),
        warmOcr().catch(() => undefined),
        loadSetIndex(),
        loadSetCatalog('en'),
      ]).catch((err) => {
        console.warn('[scan] prep', err)
        return null
      })

      const cam = await camPromise
      camRef.current = cam
      const video = videoRef.current
      if (video) await attachStream(video, cam.stream)
      setReady(true)
      setNeedsGesture(false)
      setStatus('A carregar MobileCLIP…')
      startDetectLoop()

      const prep = await prepPromise
      if (prep) {
        const [det, rec] = prep
        setDetectMode(det.mode)
        setStatus(
          rec && rec.indexSize
            ? `Enquadra e Capturar (${rec.indexSize} cartas no índice)`
            : 'Enquadra a carta e toca em Capturar',
        )
      } else {
        setStatus('Enquadra a carta e toca em Capturar')
      }
    } catch (err) {
      console.error(err)
      setCamError(cameraErrorMessage(err))
      setStatus('Câmara indisponível')
      setNeedsGesture(true)
      setReady(false)
    } finally {
      setStarting(false)
    }
  }

  async function onSwitchCam() {
    try {
      const next = await switchCamera(camRef.current)
      camRef.current = next
      const video = videoRef.current
      if (video) await attachStream(video, next.stream)
      trackerRef.current.reset()
    } catch (err) {
      showToast(cameraErrorMessage(err))
    }
  }

  const sheetCard = sheet ? getCachedCard(sheet.cardId) : null
  const qty = sheet ? inventory[sheet.cardId] ?? 0 : 0
  const showCapture =
    ready && !manualOpen && candidates.length === 0 && !sheet

  return (
    <div className="scan-page">
      <header className="scan-top">
        <Link to="/repository" className="scan-close" aria-label="Fechar">
          ×
        </Link>
        <div className="scan-status">
          <span>{status}</span>
          <small>{detectMode === 'yolo' ? 'YOLO' : 'Contorno'} · visão CLIP</small>
        </div>
        <div className="scan-actions">
          <button
            type="button"
            className="scan-icon-btn"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Retomar' : 'Pausar'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            type="button"
            className="scan-icon-btn"
            onClick={() => void onSwitchCam()}
            aria-label="Trocar câmara"
          >
            ⟳
          </button>
        </div>
      </header>

      <div className="scan-stage">
        <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
        <canvas ref={overlayRef} className="scan-overlay" />
        {!ready && (
          <div className="scan-loading">
            <p>{camError ?? status}</p>
            {(needsGesture || camError) && (
              <button
                type="button"
                className="scan-enable-btn"
                disabled={starting}
                onClick={() => void enableCamera()}
              >
                {starting ? 'A abrir câmara…' : 'Ativar câmara'}
              </button>
            )}
            {camError && !isSecureCameraContext() && (
              <p className="scan-loading-hint">
                No telemóvel use o URL <strong>https://</strong> do Vite (não http). Aceite o
                aviso de certificado autoassinado.
              </p>
            )}
          </div>
        )}

        {showCapture && (
          <div className="scan-capture-bar">
            {!overlayBox && (
              <p className="scan-hint-inline">Enquadra a carta (a caixa verde ajuda)</p>
            )}
            <button
              type="button"
              className="scan-capture-btn"
              disabled={capturing || paused}
              onClick={onCaptureTap}
            >
              {capturing ? 'A ler…' : 'Capturar'}
            </button>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="scan-history" aria-label="Últimas escaneadas">
          {history.map((h) => {
            const c = getCachedCard(h.cardId)
            return (
              <div key={`${h.cardId}-${h.at}`} className="scan-history-thumb">
                {c?.image ? <CardImage src={c.image} alt="" quality="low" /> : <span />}
              </div>
            )
          })}
        </div>
      )}

      {candidates.length > 0 && (
        <CandidatePicker
          candidates={candidates}
          ocrRaw={ocrDebug ?? undefined}
          onPick={pickCandidate}
          onSearch={() => {
            setCandidates([])
            candidatesOpenRef.current = false
            setManualReason('weak')
            setManualOpen(true)
            manualOpenRef.current = true
          }}
          onDismiss={() => {
            setCandidates([])
            candidatesOpenRef.current = false
            const tid = lastTrackIdRef.current
            if (tid != null) dedupeRef.current.releaseTrack(tid)
            setStatus('Enquadra a carta e toca em Capturar')
          }}
        />
      )}

      {sheet && (
        <aside className="scan-sheet" aria-live="polite">
          <div className="scan-sheet-art">
            {sheetCard?.image ? (
              <CardImage src={sheetCard.image} alt="" quality="high" />
            ) : (
              <div className="scan-sheet-ph" />
            )}
          </div>
          <div className="scan-sheet-body">
            <strong>{sheetCard?.name ?? sheet.cardId}</strong>
            <span className="scan-sheet-meta">
              #{sheetCard?.localId ?? '—'}
              {sheetCard?.setName ? ` · ${sheetCard.setName}` : ''}
              <em className="scan-source">{sheet.source}</em>
            </span>
            <span className="scan-sheet-price">
              {formatPrice(sheetCard?.price, 'cardmarket') ?? '—'}
            </span>
            <span className="scan-sheet-qty">No repositório: {qty}</span>
            {ocrDebug && <span className="scan-ocr-debug">{ocrDebug}</span>}
            <div className="scan-sheet-actions">
              <button type="button" className="scan-add" onClick={() => commitCard(sheet.cardId)}>
                {sheet.added ? '+1 outra' : 'Adicionar'}
              </button>
              <button
                type="button"
                className="scan-dismiss"
                onClick={() => {
                  if (sheet && !sheet.added) {
                    const tid = lastTrackIdRef.current
                    if (tid != null) dedupeRef.current.releaseTrack(tid)
                  }
                  setSheet(null)
                  setStatus('Enquadra a carta e toca em Capturar')
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </aside>
      )}

      {toast && <div className="scan-toast">{toast}</div>}

      <ManualCardSearchModal
        open={manualOpen}
        reason={manualReason}
        onClose={() => {
          setManualOpen(false)
          manualOpenRef.current = false
          const tid = lastTrackIdRef.current
          if (tid != null) dedupeRef.current.releaseTrack(tid)
          identifyingRef.current = true
          window.setTimeout(() => {
            identifyingRef.current = false
          }, 800)
          setStatus('Enquadra a carta e toca em Capturar')
        }}
        onPick={(cardId) => {
          const tid = lastTrackIdRef.current ?? 0
          dedupeRef.current.markIdentified(tid, cardId)
          void hydrateCard(lang, cardId).then((c) => {
            if (c) seedCardBrief(c)
            setSheet({ cardId, source: 'manual', added: false })
            commitCard(cardId, tid)
          })
        }}
      />
    </div>
  )
}
