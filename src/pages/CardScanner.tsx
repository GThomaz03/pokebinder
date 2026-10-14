import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanReview } from '../components/scanner/ScanReview'
import { hydrateCard, seedCardBrief } from '../api/prices'
import { useInventory } from '../hooks/useInventory'
import { useLanguage } from '../hooks/useLanguage'
import { createScannerDeps, rasterFromBlob, rasterFromVideo, rasterToObjectUrl, readCardNumber, sessionHashIndexSize, setSessionHashIndex, warmScanner } from '../lib/scanner/browserDeps'
import { lookupByCollector } from '../lib/scanner/catalog'
import { parseHashIndex } from '../lib/scanner/hashIndex'
import { prepareCrops, prepareFramedCard } from '../lib/scanner/detect'
import { objectFitCoverCrop } from '../lib/scanner/guide'
import { cropRaster } from '../lib/scanner/raster'
import { planInventoryCommit } from '../lib/scanner/inventoryCommit'
import { queueItemFromRecognition, selectedCandidate, statusLabel, type QueueItem } from '../lib/scanner/queue'
import { identifyCrop } from '../lib/scanner/recognize'
import type { Recognition, ScanCard } from '../lib/scanner/types'
import './CardScanner.css'

type Mode = 'camera' | 'photo'
type Stage = 'capture' | 'sheet' | 'review'

type Pending = {
  cropUrl: string
  crop: QueueItem['crop']
  recognition: Recognition
  selectedId: string | null
}

export function CardScannerPage() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const { addQty, getQty } = useInventory()
  const deps = useMemo(() => createScannerDeps(lang), [lang])
  const videoRef = useRef<HTMLVideoElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pilotRef = useRef<HTMLInputElement>(null)
  const [indexLabel, setIndexLabel] = useState<string | null>(null)
  const committedRef = useRef(new Set<string>())
  const confirmLock = useRef(false)
  const [mode, setMode] = useState<Mode>('camera')
  const [stage, setStage] = useState<Stage>('capture')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [liveText, setLiveText] = useState('Encaixe a carta na moldura')
  const [liveCard, setLiveCard] = useState<ScanCard | null>(null)
  const liveCropRef = useRef<ReturnType<typeof prepareFramedCard> | null>(null)

  useEffect(() => {
    void warmScanner()
  }, [])

  useEffect(() => {
    if (mode !== 'camera' || stage !== 'capture' || !cameraReady || paused) return
    let stopped = false
    let running = false
    const timer = window.setInterval(() => {
      const video = videoRef.current
      if (stopped || running || !video?.videoWidth) return
      running = true
      void (async () => {
        try {
          const framed = cropToGuide(video, guideRef.current, rasterFromVideo(video))
          const crop = prepareFramedCard(framed)
          const ocr = await readCardNumber(crop)
          if (stopped) return
          liveCropRef.current = crop
          if (!ocr.number) {
            setLiveCard(null)
            setLiveText(ocr.rawText ? `Lendo… ${ocr.rawText.slice(0, 42)}` : 'Procurando o número da carta')
            return
          }
          const cards = await lookupByCollector({
            number: ocr.number,
            total: ocr.numberTotal,
            setCode: ocr.setCode,
            lang,
          })
          if (stopped) return
          if (!cards.length) {
            setLiveCard(null)
            setLiveText(`${ocr.number}/${ocr.numberTotal ?? '?'} não está no catálogo`)
            return
          }
          setLiveCard(cards[0])
          setLiveText(`${cards[0].name} · #${cards[0].localId}${cards[0].setName ? ` · ${cards[0].setName}` : ''}`)
        } catch (err) {
          console.warn('[scanner] live', err)
        } finally {
          running = false
        }
      })()
    }, 1400)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [mode, stage, cameraReady, paused, lang])

  useEffect(() => {
    if (mode !== 'camera') return
    let stopped = false
    let stream: MediaStream | null = null
    setCameraError(null)
    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then(async (next) => {
        if (stopped) {
          next.getTracks().forEach((track) => track.stop())
          return
        }
        stream = next
        const video = videoRef.current
        if (!video) return
        video.srcObject = next
        await video.play()
        setCameraReady(true)
        setPaused(false)
      })
      .catch(() => {
        setCameraReady(false)
        setCameraError('A câmera não foi autorizada. Você ainda pode enviar uma fotografia.')
      })
    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
      setCameraReady(false)
    }
  }, [mode])

  async function onPilotFile(file: File) {
    try {
      const parsed = parseHashIndex(JSON.parse(await file.text()))
      if (!parsed) {
        setPhotoMessage('Esse arquivo não é um índice visual válido.')
        return
      }
      setSessionHashIndex(parsed)
      setIndexLabel(`${parsed.cardCount} cartas no índice local`)
      setPhotoMessage(null)
    } catch {
      setPhotoMessage('Não foi possível ler o índice local.')
    }
  }

  function leave() {
    if (queue.some((item) => !item.saved) && !window.confirm('A fila desta sessão será descartada. Sair do scanner?')) return
    navigate('/repository')
  }

  function togglePause() {
    const stream = videoRef.current?.srcObject
    if (!(stream instanceof MediaStream)) return
    const track = stream.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setPaused(!track.enabled)
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth || busy) return
    setBusy(true)
    setPhotoMessage(null)
    try {
      const full = rasterFromVideo(video)
      const framed = cropToGuide(video, guideRef.current, full)
      const crop = prepareFramedCard(framed)
      if (!crop) {
        setPhotoMessage('Não foi possível preparar a carta. Aproxime e tente de novo.')
        return
      }
      const recognition = await identifyCrop(crop, deps)
      const selected = recognition.status === 'confident' ? (recognition.card?.id ?? null) : null
      setPending({
        crop,
        cropUrl: rasterToObjectUrl(crop),
        recognition,
        selectedId: selected,
      })
      setStage('sheet')
    } catch (err) {
      console.warn('[scanner] capture failed', err)
      setPhotoMessage('A captura falhou. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  function addLiveCard() {
    const card = liveCard
    const crop = liveCropRef.current
    if (!card || !crop) return
    const recognition: Recognition = {
      status: 'uncertain',
      reason: 'ok',
      card,
      candidates: [{ ...card, confidence: 0 }],
      ocrRaw: liveText,
      timingsMs: {},
    }
    const item = queueItemFromRecognition(crop, recognition, rasterToObjectUrl(crop))
    item.selectedId = card.id
    item.include = true
    setQueue((current) => [...current, item])
    setToast(`Na fila: ${card.name}`)
    window.setTimeout(() => setToast(null), 1600)
  }

  function discardSheet() {
    setPending(null)
    setStage('capture')
  }

  function enqueueSheet() {
    if (!pending?.selectedId) return
    const card = cardFromPending(pending)
    if (!card) return
    const recognition: Recognition = {
      ...pending.recognition,
      status: pending.recognition.status === 'failed' ? 'uncertain' : pending.recognition.status,
      card,
      candidates: withCard(pending.recognition.candidates, card),
    }
    const item = queueItemFromRecognition(pending.crop, recognition, pending.cropUrl)
    item.selectedId = card.id
    item.include = true
    if (pending.recognition.status !== 'confident') item.status = 'uncertain'
    setQueue((current) => [...current, item])
    setPending(null)
    setStage('capture')
    setToast('Carta adicionada à fila')
    window.setTimeout(() => setToast(null), 1600)
  }

  async function onPhoto(file: File) {
    setBusy(true)
    setPhotoMessage(null)
    setProgress({ done: 0, total: 0 })
    try {
      const raster = await rasterFromBlob(file)
      const crops = prepareCrops(raster, 'multi')
      if (!crops.length) {
        setPhotoMessage('Nenhuma carta encontrada. Separe as cartas e deixe o fundo visível em volta delas.')
        return
      }
      const next: QueueItem[] = []
      for (let index = 0; index < crops.length; index++) {
        setProgress({ done: index, total: crops.length })
        const recognition = await identifyCrop(crops[index].raster, deps)
        next.push(queueItemFromRecognition(crops[index].raster, recognition, rasterToObjectUrl(crops[index].raster)))
      }
      setProgress({ done: crops.length, total: crops.length })
      setQueue((current) => [...current, ...next])
      setStage('review')
    } catch (err) {
      console.warn('[scanner] photo failed', err)
      setPhotoMessage('Não foi possível ler essa imagem.')
    } finally {
      setBusy(false)
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function retryItem(id: string) {
    const item = queue.find((row) => row.id === id)
    if (!item || busy) return
    setBusy(true)
    try {
      const recognition = await identifyCrop(item.crop, deps)
      const replacement = queueItemFromRecognition(item.crop, recognition, item.cropUrl)
      replacement.id = item.id
      replacement.qty = item.qty
      setQueue((current) => current.map((row) => (row.id === id ? replacement : row)))
    } finally {
      setBusy(false)
    }
  }

  function confirmQueue() {
    if (confirmLock.current) return
    const lines = queue
      .filter((item) => item.include && item.selectedId && !item.saved)
      .map((item) => ({ itemId: item.id, cardId: item.selectedId as string, qty: item.qty }))
    const plan = planInventoryCommit(lines, committedRef.current)
    if (!plan.adds.length) return
    confirmLock.current = true
    setConfirming(true)
    for (const id of plan.itemIds) committedRef.current.add(id)
    try {
      for (const add of plan.adds) {
        const sample = queue.find((item) => item.selectedId === add.cardId && !item.saved)
        const card = sample ? selectedCandidate(sample) : null
        if (card) {
          seedCardBrief({
            id: card.id,
            name: card.name,
            localId: card.localId,
            image: card.image,
            setId: card.setId,
            setName: card.setName,
          })
          void hydrateCard(lang, card.id)
        }
        addQty(add.cardId, add.qty)
      }
      const savedIds = new Set(plan.itemIds)
      setQueue((current) =>
        current.map((item) => (savedIds.has(item.id) ? { ...item, include: false, saved: true } : item)),
      )
      setToast('Cartas adicionadas ao repositório')
      window.setTimeout(() => setToast(null), 1800)
    } finally {
      confirmLock.current = false
      setConfirming(false)
    }
  }

  const pendingCard = pending ? cardFromPending(pending) : null

  return (
    <div className="scan-page">
      <header className="scan-top">
        <button type="button" className="scan-close" onClick={leave} aria-label="Fechar scanner">
          ×
        </button>
        <div className="scan-status">
          <strong>Escanear cartas</strong>
          <span>{stage === 'review' ? 'Revisão da fila' : mode === 'camera' ? 'Uma carta por vez' : 'Várias cartas na foto'}</span>
        </div>
        <button type="button" className="scan-queue-link" onClick={() => setStage('review')}>
          Fila ({queue.length})
        </button>
      </header>

      {stage !== 'review' && (
        <div className="scan-modes" role="tablist" aria-label="Modo de captura">
          <button type="button" role="tab" aria-selected={mode === 'camera'} className={mode === 'camera' ? 'is-on' : ''} onClick={() => { setMode('camera'); setStage('capture') }}>
            Câmera
          </button>
          <button type="button" role="tab" aria-selected={mode === 'photo'} className={mode === 'photo' ? 'is-on' : ''} onClick={() => { setMode('photo'); setStage('capture') }}>
            Fotografia
          </button>
        </div>
      )}

      {stage !== 'review' && (
        <div className="scan-pilot">
          <button type="button" className="scan-text-btn" onClick={() => pilotRef.current?.click()}>
            {indexLabel ?? 'Carregar índice local'}
          </button>
          <input
            ref={pilotRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onPilotFile(file)
              event.target.value = ''
            }}
          />
          {sessionHashIndexSize() > 0 && (
            <button
              type="button"
              className="scan-text-btn"
              onClick={() => {
                setSessionHashIndex(null)
                setIndexLabel(null)
              }}
            >
              Dispensar índice
            </button>
          )}
          <span>Usado só quando o número da carta não é lido. Não é enviado ao site.</span>
        </div>
      )}

      {mode === 'camera' && (
        <div className={`scan-stage${stage === 'capture' ? '' : ' is-parked'}`} aria-hidden={stage !== 'capture'}>
          <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
          <div ref={guideRef} className="scan-guide" aria-hidden />
          {stage === 'capture' && !cameraReady && (
            <div className="scan-banner">
              <p>{cameraError ?? 'Abrindo a câmera…'}</p>
            </div>
          )}
          {stage === 'capture' && paused && (
            <div className="scan-banner">
              <p>Câmera pausada</p>
            </div>
          )}
          {stage === 'capture' && (
            <>
              <div className="scan-capture-bar">
                <button type="button" className="scan-text-btn" onClick={togglePause} disabled={!cameraReady}>
                  {paused ? 'Retomar' : 'Pausar'}
                </button>
                <button
                  type="button"
                  className="scan-shutter"
                  onClick={() => void captureFrame()}
                  disabled={!cameraReady || busy || paused}
                  aria-label="Capturar carta"
                >
                  {busy ? '…' : ''}
                </button>
                <button type="button" className="scan-text-btn" onClick={() => setStage('review')}>
                  Encerrar
                </button>
              </div>
              <p className="scan-hint">Segure a carta na moldura. A identificação aparece sozinha.</p>
              <div className={`scan-live${liveCard ? ' is-hit' : ''}`} role="status">
                <span>{liveText}</span>
                {liveCard && (
                  <button type="button" className="scan-primary" onClick={addLiveCard}>
                    Adicionar à fila
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {stage === 'review' ? (
        <ScanReview
          items={queue}
          onChange={setQueue}
          onRetry={(id) => void retryItem(id)}
          onConfirm={confirmQueue}
          confirming={confirming}
          onBack={() => setStage('capture')}
        />
      ) : stage === 'sheet' && pending ? (
        <section className="scan-sheet">
          <img src={pending.cropUrl} alt="Recorte da carta" />
          <div>
            <span className={`scan-badge is-${pending.recognition.status}`}>{statusLabel(pending.recognition)}</span>
            <h2>{pendingCard?.name ?? 'Escolha a carta'}</h2>
            <p>
              {pendingCard
                ? `#${pendingCard.localId}${pendingCard.setName ? ` · ${pendingCard.setName}` : ''}`
                : 'A identificação não ficou confiável. Escolha um candidato antes de colocar na fila.'}
            </p>
            {pendingCard && <p className="scan-meta">No repositório: {getQty(pendingCard.id)}</p>}
            {pending.recognition.ocrRaw && <p className="scan-meta">Leitura: {pending.recognition.ocrRaw}</p>}
            <ul className="scan-sheet-list">
              {pending.recognition.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={candidate.id === pending.selectedId ? 'is-selected' : ''}
                    onClick={() => setPending({ ...pending, selectedId: candidate.id })}
                  >
                    {candidate.image && <img src={candidate.image} alt="" />}
                    <span>
                      {candidate.name}
                      <small>
                        #{candidate.localId}
                        {candidate.setName ? ` · ${candidate.setName}` : ''}
                        {candidate.confidence > 0 ? ` · ${Math.round(candidate.confidence * 100)}` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="scan-sheet-actions">
              <button type="button" className="scan-primary" disabled={!pending.selectedId} onClick={enqueueSheet}>
                Adicionar à fila
              </button>
              <button type="button" className="scan-text-btn" onClick={discardSheet}>
                Descartar
              </button>
              <button type="button" className="scan-text-btn" onClick={() => void captureFrame()} disabled={busy}>
                Capturar novamente
              </button>
            </div>
          </div>
        </section>
      ) : mode === 'photo' && stage === 'capture' ? (
        <div className="scan-photo">
          <p>Envie uma foto com várias cartas separadas. Cada recorte é identificado e entra na mesma fila da câmera.</p>
          <button type="button" className="scan-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Processando…' : 'Escolher fotografia'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onPhoto(file)
            }}
          />
          {progress && progress.total > 0 && (
            <p role="status">
              Identificando {Math.min(progress.done + 1, progress.total)} de {progress.total}
            </p>
          )}
          {photoMessage && <p className="scan-banner-inline">{photoMessage}</p>}
          <ul className="scan-notes">
            <li>Cartas sobrepostas podem virar um recorte só ou serem ignoradas.</li>
            <li>Reflexo, desfoque e fundo da mesma cor da carta reduzem a detecção.</li>
            <li>Se a confiança não bastar, a carta fica para escolha manual.</li>
          </ul>
        </div>
      ) : null}

      {photoMessage && stage === 'capture' && mode === 'camera' && <p className="scan-toast">{photoMessage}</p>}
      {toast && <p className="scan-toast" role="status">{toast}</p>}
    </div>
  )
}

function cropToGuide(
  video: HTMLVideoElement,
  guide: HTMLElement | null,
  full: ReturnType<typeof rasterFromVideo>,
): ReturnType<typeof rasterFromVideo> {
  if (!guide) return full
  const videoRect = video.getBoundingClientRect()
  const guideRect = guide.getBoundingClientRect()
  const box = objectFitCoverCrop(
    { width: video.videoWidth, height: video.videoHeight },
    { width: videoRect.width, height: videoRect.height },
    {
      x: guideRect.left - videoRect.left,
      y: guideRect.top - videoRect.top,
      w: guideRect.width,
      h: guideRect.height,
    },
  )
  if (box.w < 20 || box.h < 20) return full
  return cropRaster(full, box.x, box.y, box.w, box.h)
}

function cardFromPending(pending: Pending): ScanCard | null {
  if (!pending.selectedId) return null
  return pending.recognition.candidates.find((candidate) => candidate.id === pending.selectedId) ?? pending.recognition.card
}

function withCard(candidates: Recognition['candidates'], card: ScanCard): Recognition['candidates'] {
  if (candidates.some((candidate) => candidate.id === card.id)) return candidates
  return [{ ...card, confidence: 0 }, ...candidates]
}
