export type PixelBox = { x: number; y: number; w: number; h: number }

/**
 * Maps a rectangle drawn on top of a video element with object-fit: cover
 * back to pixels of the camera frame.
 */
export function objectFitCoverCrop(
  video: { width: number; height: number },
  element: { width: number; height: number },
  guide: PixelBox,
): PixelBox {
  if (video.width <= 0 || video.height <= 0 || element.width <= 0 || element.height <= 0) {
    return { x: 0, y: 0, w: Math.max(1, video.width), h: Math.max(1, video.height) }
  }
  const scale = Math.max(element.width / video.width, element.height / video.height)
  const offsetX = (video.width * scale - element.width) / 2
  const offsetY = (video.height * scale - element.height) / 2
  const x = clamp((guide.x + offsetX) / scale, 0, video.width - 1)
  const y = clamp((guide.y + offsetY) / scale, 0, video.height - 1)
  const right = clamp((guide.x + guide.w + offsetX) / scale, x + 1, video.width)
  const bottom = clamp((guide.y + guide.h + offsetY) / scale, y + 1, video.height)
  return { x, y, w: right - x, h: bottom - y }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
