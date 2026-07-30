/**
 * Prefetch MobileCLIP ONNX weights into public/scan/models for offline/docs.
 * Transformers.js also caches from HuggingFace on first run.
 *
 * Usage: npm run scan:models
 */
import { createWriteStream, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'scan', 'models')

const FILES = [
  {
    name: 'mobileclip-s2-vision-quantized.onnx',
    url: 'https://huggingface.co/Xenova/mobileclip_s2/resolve/main/onnx/vision_model_quantized.onnx',
  },
  {
    name: 'mobileclip-s2-preprocessor_config.json',
    url: 'https://huggingface.co/Xenova/mobileclip_s2/resolve/main/preprocessor_config.json',
  },
]

async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`exists ${dest}`)
    return
  }
  console.log(`GET ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const body = Readable.fromWeb(res.body)
  await pipeline(body, createWriteStream(dest))
  console.log(`wrote ${dest}`)
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  for (const f of FILES) {
    try {
      await download(f.url, join(outDir, f.name))
    } catch (err) {
      console.warn(`skip ${f.name}:`, err.message ?? err)
    }
  }
  writeFileSync(
    join(outDir, 'README.md'),
    `# Scan models

## MobileCLIP-S2 (required for visual ID)

The browser loads \`Xenova/mobileclip_s2\` via \`@xenova/transformers\` (ONNX under the hood).
Optional local copies:

- \`mobileclip-s2-vision-quantized.onnx\`
- \`mobileclip-s2-preprocessor_config.json\`

Fetch: \`npm run scan:models\`

## Embeddings index

Generate with:

\`\`\`bash
npm run scan:embeddings -- --sets sv-me
# or full catalog:
npm run scan:embeddings -- --sets all
\`\`\`

## Optional YOLO

Place \`yolo11n-card.onnx\` here for ML detection; otherwise contour tracking is used.
`,
  )
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
