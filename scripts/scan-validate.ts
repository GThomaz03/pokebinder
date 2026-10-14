#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'
import { prepareCrops } from '../src/lib/scanner/detect'
import { computeHashes } from '../src/lib/scanner/hash'
import { parseHashIndex, queryHashIndex } from '../src/lib/scanner/hashIndex'

/**
 * Scores local photographs against the pilot index.
 * Exits without scores when data/scan/fixtures/manifest.json is absent.
 * See docs/scanner-validation.md.
 */

type Case = {
  file: string
  expectedId: string
  notes?: string
}

function rasterFromBuffer(buffer: Buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => ({
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  }))
}

async function main() {
  const manifestPath = resolve(process.cwd(), 'data/scan/fixtures/manifest.json')
  const reportPath = resolve(process.cwd(), 'data/scan/validation-report.json')
  if (!existsSync(manifestPath)) {
    console.log('Nenhuma fotografia de validação foi registrada.')
    console.log('Copie scripts/fixtures/scan-manifest.example.json para data/scan/fixtures/manifest.json e aponte cada caso para uma foto real.')
    console.log('O procedimento está em docs/scanner-validation.md.')
    return
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { cases?: Case[] }
  const cases = Array.isArray(manifest.cases) ? manifest.cases : []
  const indexPath = resolve(process.cwd(), 'data/scan/pilot-hash-index.json')
  const index = existsSync(indexPath) ? parseHashIndex(JSON.parse(readFileSync(indexPath, 'utf8'))) : null
  const results = []
  for (const item of cases) {
    const photo = resolve(process.cwd(), 'data/scan/fixtures', item.file)
    if (!existsSync(photo)) {
      results.push({ ...item, status: 'missing-file' })
      continue
    }
    if (!index) {
      results.push({ ...item, status: 'missing-index' })
      continue
    }
    const raster = await rasterFromBuffer(readFileSync(photo))
    const crops = prepareCrops(raster, 'single')
    const crop = crops[0]?.raster ?? raster
    const hits = queryHashIndex(index, computeHashes(crop), 5)
    const rank = hits.findIndex((hit) => hit.card.id === item.expectedId)
    results.push({
      file: item.file,
      expectedId: item.expectedId,
      notes: item.notes ?? '',
      status: 'scored',
      crops: crops.length,
      rank: rank === -1 ? null : rank + 1,
      top: hits.map((hit) => ({ id: hit.card.id, score: Number(hit.score.toFixed(4)) })),
    })
  }
  mkdirSync(dirname(reportPath), { recursive: true })
  const report = {
    generatedAt: new Date().toISOString(),
    cases: cases.length,
    scored: results.filter((row) => row.status === 'scored').length,
    results,
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!cases.length) console.log('O manifesto não tem casos. Nenhuma taxa de acerto foi calculada.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
