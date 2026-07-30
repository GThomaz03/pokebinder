# Card scanner assets (visual ID)

## How it works

1. Camera crop of the card
2. **MobileCLIP-S2** embedding (same model in browser worker + offline script)
3. Cosine kNN against `embeddings.bin`
4. Optional OCR only for close top-2 ties
5. Hydrate card via TCGdex → add to repository

## Commands

```bash
# Prefetch ONNX weights into public/scan/models
npm run scan:models

# Build embeddings for Scarlet/Violet + Mega Evolution sets
npm run scan:embeddings -- --sets sv-me

# Or specific sets / full catalog
npm run scan:embeddings -- --sets me01,me02,sv08
npm run scan:embeddings -- --sets all

# Set abbreviation / size index (OCR fallback)
npm run scan:set-index
```

## Files

| File | Role |
|------|------|
| `embeddings.json` / `embeddings.bin` | Card metadata + Float32 vectors |
| `set-index.json` | Abbr / official count → setId |
| `models/mobileclip-s2-*.onnx` | Optional local ONNX copy |
| `models/yolo11n-card.onnx` | Optional detector |

Current index was built with `Xenova/mobileclip_s2` (512-d). Rebuild after changing the model.
