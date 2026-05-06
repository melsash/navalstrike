import { Board, Ship, GameState, SHIPS_CONFIG, BOARD_SIZE, Orientation } from './types'

export function createEmptyBoard(): Board {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill('empty'))
}

export function canPlaceShip(board: Board, row: number, col: number, size: number, orientation: Orientation): boolean {
  for (let i = 0; i < size; i++) {
    const r = orientation === 'vertical' ? row + i : row
    const c = orientation === 'horizontal' ? col + i : col
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false
    // Проверяем клетку и все соседние
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
          if (board[nr][nc] === 'ship') return false
        }
      }
    }
  }
  return true
}

export function placeShip(board: Board, row: number, col: number, size: number, orientation: Orientation, shipId: string): { board: Board, ship: Ship } | null {
  if (!canPlaceShip(board, row, col, size, orientation)) return null
  const newBoard = board.map(r => [...r])
  const positions: [number, number][] = []
  for (let i = 0; i < size; i++) {
    const r = orientation === 'vertical' ? row + i : row
    const c = orientation === 'horizontal' ? col + i : col
    newBoard[r][c] = 'ship'
    positions.push([r, c])
  }
  return {
    board: newBoard,
    ship: { id: shipId, size, positions, hits: 0, sunk: false }
  }
}

export function autoPlaceShips(): GameState {
  let board = createEmptyBoard()
  const ships: Ship[] = []
  let shipId = 0

  for (const { size, count } of SHIPS_CONFIG) {
    for (let i = 0; i < count; i++) {
      let placed = false
      let attempts = 0
      while (!placed && attempts < 1000) {
        const row = Math.floor(Math.random() * BOARD_SIZE)
        const col = Math.floor(Math.random() * BOARD_SIZE)
        const orientation: Orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical'
        const result = placeShip(board, row, col, size, orientation, `ship_${shipId}`)
        if (result) {
          board = result.board
          ships.push(result.ship)
          placed = true
          shipId++
        }
        attempts++
      }
    }
  }
  return { board, ships, shots: [] }
}

export function processShot(state: GameState, row: number, col: number): { state: GameState, hit: boolean, sunk: boolean, gameOver: boolean } {
  const newBoard = state.board.map(r => [...r])
  const newShips = state.ships.map(s => ({ ...s, positions: [...s.positions], hits: s.hits }))
  const newShots: [number, number][] = [...state.shots, [row, col]]

  let hit = false
  let sunk = false

  for (const ship of newShips) {
    for (const [r, c] of ship.positions) {
      if (r === row && c === col) {
        hit = true
        ship.hits++
        newBoard[r][c] = 'hit'
        if (ship.hits === ship.size) {
          ship.sunk = true
          sunk = true
          // Помечаем весь корабль как sunk
          for (const [sr, sc] of ship.positions) {
            newBoard[sr][sc] = 'sunk'
          }
        }
        break
      }
    }
  }

  if (!hit) newBoard[row][col] = 'miss'

  const gameOver = newShips.every(s => s.sunk)
  return {
    state: { board: newBoard, ships: newShips, shots: newShots },
    hit, sunk, gameOver
  }
}

// Hunt & Target AI
export function botShot(opponentState: GameState): [number, number] {
  const { board, shots } = opponentState
  
  // Ищем подбитые но не потопленные корабли
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 'hit') {
        // Стреляем рядом
        const neighbors: [number, number][] = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE &&
              board[nr][nc] !== 'hit' && board[nr][nc] !== 'miss' && board[nr][nc] !== 'sunk') {
            return [nr, nc]
          }
        }
      }
    }
  }

  // Случайный выстрел по незатронутым клеткам (паттерн шахматной доски)
  const available: [number, number][] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 0 && board[r][c] === 'empty' || board[r][c] === 'ship') {
        if (!shots.some(([sr, sc]) => sr === r && sc === c)) {
          available.push([r, c])
        }
      }
    }
  }

  if (available.length === 0) {
    // Fallback — любая свободная
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== 'miss' && board[r][c] !== 'hit' && board[r][c] !== 'sunk') {
          if (!shots.some(([sr, sc]) => sr === r && sc === c)) return [r, c]
        }
      }
    }
  }

  return available[Math.floor(Math.random() * available.length)]
}