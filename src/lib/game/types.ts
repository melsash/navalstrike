export type Cell = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk'
export type Board = Cell[][]
export type Orientation = 'horizontal' | 'vertical'

export interface Ship {
  id: string
  size: number
  positions: [number, number][]
  hits: number
  sunk: boolean
}

export interface GameState {
  board: Board
  ships: Ship[]
  shots: [number, number][]
}

export const SHIPS_CONFIG = [
  { size: 4, count: 1 },
  { size: 3, count: 2 },
  { size: 2, count: 3 },
  { size: 1, count: 4 },
]

export const BOARD_SIZE = 10