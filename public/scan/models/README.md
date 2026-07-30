# Scan models

## MobileCLIP-S2 (required for visual ID)

The browser loads `Xenova/mobileclip_s2` via `@xenova/transformers` (ONNX under the hood).
Optional local copies:

- `mobileclip-s2-vision-quantized.onnx`
- `mobileclip-s2-preprocessor_config.json`

Fetch: `npm run scan:models`

## Embeddings index

Generate with:

```bash
npm run scan:embeddings -- --sets sv-me
# or full catalog:
npm run scan:embeddings -- --sets all
```

## Optional YOLO

Place `yolo11n-card.onnx` here for ML detection; otherwise contour tracking is used.
