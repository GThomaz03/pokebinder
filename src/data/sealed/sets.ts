import type { SealedSet } from '../../types/sealed'

/**
 * Coleções no mercado BR (códigos Copag EV/ME).
 * Preços de booster são aproximações de mercado e podem ser editados na calculadora.
 */
export const SEALED_SETS: SealedSet[] = [
  { id: 'ev1', name: 'Escarlate e Violeta', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 28 },
  { id: 'ev2', name: 'Evoluções em Paldea', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 28 },
  { id: 'ev3', name: 'Obsidiana em Chamas', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 28 },
  { id: 'ev3.5', name: 'Coleção Especial 151', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 45 },
  { id: 'ev4', name: 'Fenda Paradoxal', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 28 },
  { id: 'ev4.5', name: 'Destinos de Paldea', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 32 },
  { id: 'ev5', name: 'Forças Temporais', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 28 },
  { id: 'ev6', name: 'Máscaras do Crepúsculo', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 28 },
  { id: 'ev6.5', name: 'Fábulas Nebulosas', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 35 },
  { id: 'ev7', name: 'Coroa Estelar', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 30 },
  { id: 'ev8', name: 'Fagulhas Impetuosas', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 30 },
  { id: 'ev8.5', name: 'Evoluções Prismáticas', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 55 },
  { id: 'ev9', name: 'Amigos de Jornada', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 32 },
  { id: 'ev10', name: 'Rivais Predestinados', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 32 },
  { id: 'ev10.5', name: 'Raio Preto e Fogo Branco', series: 'Escarlate e Violeta', defaultBoosterPriceBrl: 40 },
  { id: 'me01', name: 'Megaevolução', series: 'Megaevolução', defaultBoosterPriceBrl: 35 },
  { id: 'me02', name: 'Fogo Fantasmagórico', series: 'Megaevolução', defaultBoosterPriceBrl: 35 },
  { id: 'swsh12.5', name: 'Destinos Brilhantes', series: 'Espada e Escudo', defaultBoosterPriceBrl: 40 },
  { id: 'swsh45', name: 'Celebrations', series: 'Espada e Escudo', defaultBoosterPriceBrl: 50 },
]

export function getSealedSet(id: string): SealedSet | undefined {
  return SEALED_SETS.find((s) => s.id === id)
}
