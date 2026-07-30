export type CameraHandle = {
  stream: MediaStream
  facingMode: 'environment' | 'user'
}

export type CameraErrorCode =
  | 'unsupported'
  | 'insecure'
  | 'denied'
  | 'notfound'
  | 'busy'
  | 'unknown'

export class CameraError extends Error {
  code: CameraErrorCode
  constructor(code: CameraErrorCode, message: string) {
    super(message)
    this.name = 'CameraError'
    this.code = code
  }
}

export function isSecureCameraContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  // Some WebViews report oddly; localhost variants are always OK
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export function cameraErrorMessage(err: unknown): string {
  if (err instanceof CameraError) {
    switch (err.code) {
      case 'insecure':
        return 'A câmara exige HTTPS. No telemóvel abre o link https://… (não http://).'
      case 'denied':
        return 'Permissão da câmara negada. Ative nas definições do browser e tente de novo.'
      case 'notfound':
        return 'Nenhuma câmara encontrada neste dispositivo.'
      case 'busy':
        return 'A câmara está a ser usada por outra app. Feche-a e tente de novo.'
      case 'unsupported':
        return 'Este browser não suporta acesso à câmara.'
      default:
        return err.message
    }
  }
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permissão da câmara negada. Ative nas definições do browser e tente de novo.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhuma câmara encontrada neste dispositivo.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'A câmara está a ser usada por outra app. Feche-a e tente de novo.'
  }
  if (name === 'SecurityError') {
    return 'A câmara exige HTTPS. No telemóvel abre o link https://… (não http://).'
  }
  return 'Não foi possível aceder à câmara.'
}

function mapGetUserMediaError(err: unknown): CameraError {
  if (!isSecureCameraContext()) {
    return new CameraError(
      'insecure',
      'A câmara exige HTTPS. No telemóvel abre o link https://… (não http://).',
    )
  }
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new CameraError('denied', 'Permissão da câmara negada.')
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new CameraError('notfound', 'Nenhuma câmara encontrada.')
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new CameraError('busy', 'Câmara ocupada.')
  }
  if (name === 'SecurityError') {
    return new CameraError('insecure', 'Contexto inseguro (HTTP).')
  }
  return new CameraError('unknown', cameraErrorMessage(err))
}

/** Progressive constraint fallbacks — mobile browsers often reject strict ideals. */
function buildConstraintAttempts(
  facingMode: 'environment' | 'user',
): MediaStreamConstraints[] {
  return [
    {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: { facingMode: { ideal: facingMode } },
    },
    {
      audio: false,
      video: { facingMode },
    },
    {
      audio: false,
      video: true,
    },
  ]
}

export async function startCamera(
  facingMode: 'environment' | 'user' = 'environment',
): Promise<CameraHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'Este browser não suporte getUserMedia.')
  }
  if (!isSecureCameraContext()) {
    throw new CameraError(
      'insecure',
      'A câmara exige HTTPS. No telemóvel abre o link https://… (não http://).',
    )
  }

  let lastErr: unknown
  for (const constraints of buildConstraintAttempts(facingMode)) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      // Detect actual facing if possible
      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings?.()
      const actualFacing =
        settings?.facingMode === 'user' || settings?.facingMode === 'environment'
          ? settings.facingMode
          : facingMode
      return { stream, facingMode: actualFacing }
    } catch (err) {
      lastErr = err
    }
  }
  throw mapGetUserMediaError(lastErr)
}

export function stopCamera(handle: CameraHandle | null) {
  handle?.stream.getTracks().forEach((t) => t.stop())
}

export async function switchCamera(
  current: CameraHandle | null,
): Promise<CameraHandle> {
  const nextFacing = current?.facingMode === 'user' ? 'environment' : 'user'
  stopCamera(current)
  try {
    return await startCamera(nextFacing)
  } catch {
    return startCamera(current?.facingMode ?? 'environment')
  }
}

export async function attachStream(video: HTMLVideoElement, stream: MediaStream) {
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.playsInline = true
  video.muted = true
  video.autoplay = true
  video.srcObject = stream
  try {
    await video.play()
  } catch {
    // Autoplay may be blocked until another tap; stream is still attached.
  }
}
