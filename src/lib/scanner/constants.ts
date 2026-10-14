/**
 * Tuning knobs adapted from pokeum `app/core/constants.py` (MIT).
 * See pokeum-LICENSE.txt.
 */

export const CARD_WIDTH_PX = 630
export const CARD_HEIGHT_PX = 880
export const CARD_ASPECT = CARD_WIDTH_PX / CARD_HEIGHT_PX

export const DETECT_MIN_AREA_SINGLE = 0.05
export const DETECT_MIN_AREA_MULTI = 0.02
export const CARD_ASPECT_MIN = 0.55
export const CARD_ASPECT_MAX = 0.85
export const DETECT_MAX_SIDE = 720
export const INGEST_MAX_SIDE = 1600
export const MAX_CARDS_PER_PHOTO = 12

export const BOTTOM_STRIP_TOP = 0.9

export const HASH_SIZE = 16
export const HASH_BITS = HASH_SIZE * HASH_SIZE
export const HASH_HIGH_FREQ = 4

export const RETRIEVAL_SHORTLIST = 50
export const VISUAL_COMPARE_LIMIT = 24

export const WEIGHT_HASH = 0.2
export const OCR_BOOST = 0.5
export const OCR_PENALTY = 0.4
export const CONFIDENT_THRESHOLD = 0.8
export const CONFIDENT_MARGIN = 0.1
export const UNCERTAIN_THRESHOLD = 0.5
export const DEFAULT_TOP_K = 5

export const SIGNAL_HASH = 'hash'
