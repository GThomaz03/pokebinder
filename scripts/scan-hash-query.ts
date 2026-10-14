#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { computeHashes } from '../src/lib/scanner/hash'
import { parseHashIndex, queryHashIndex } from '../src/lib/scanner/hashIndex'

function argValue(name: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

async function rasterFromFile(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

async function main() {
  const image = argValue('image')
  const indexPath = resolve(process.cwd(), argValue('index') ?? 'data/scan/pilot-hash-index.json')
  const top = Number(argValue('top') ?? '5')
  if (!image) throw new Error('Informe --image=caminho/da/foto.jpg')
  if (!existsSync(image)) throw new Error(`Imagem não encontrada: ${image}`)
  if (!existsSync(indexPath)) throw new Error(`Índice não encontrado: ${indexPath}. Rode npm run scan:hash-pilot.`)
  const index = parseHashIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
  if (!index) throw new Error('O arquivo de índice é inválido.')
  const hits = queryHashIndex(index, computeHashes(await rasterFromFile(image)), top)
  console.log(JSON.stringify({
    index: indexPath,
    cards: index.cardCount,
    hits: hits.map((hit) => ({
      id: hit.card.id,
      name: hit.card.name,
      localId: hit.card.localId,
      setId: hit.card.setId,
      language: hit.card.language,
      score: Number(hit.score.toFixed(4)),
    })),
  }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
