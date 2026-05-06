'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Board, GameState, SHIPS_CONFIG, Orientation } from '@/lib/game/types'
import { createEmptyBoard, autoPlaceShips, canPlaceShip, placeShip, processShot, botShot } from '@/lib/game/utils'
import { createClient } from '@/lib/supabase/client'

type Phase = 'placing' | 'playing' | 'finished'

const CELL_COLORS = {
  empty: 'bg-gray-800 hover:bg-gray-700 border-gray-700',
  ship: 'bg-blue-600 border-blue-500',
  hit: 'bg-red-500 border-red-400',
  miss: 'bg-gray-600 border-gray-500',
  sunk: 'bg-red-800 border-red-700',
}

export default function GamePage() {
  const router = useRouter()
  const supabase = createClient()

  const [phase, setPhase] = useState<Phase>('placing')
  const [playerState, setPlayerState] = useState<GameState>({ board: createEmptyBoard(), ships: [], shots: [] })
  const [botState, setBotState] = useState<GameState>(autoPlaceShips())
  const [botVisibleBoard, setBotVisibleBoard] = useState<Board>(createEmptyBoard())
  const [selectedShip, setSelectedShip] = useState<{ size: number, index: number } | null>(null)
  const [orientation, setOrientation] = useState<Orientation>('horizontal')
  const [placedShips, setPlacedShips] = useState<{ size: number, count: number }[]>([])
  const [message, setMessage] = useState('Расставь корабли на своей доске')
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [winner, setWinner] = useState<'player' | 'bot' | null>(null)
  const [gameLog, setGameLog] = useState<string[]>([])
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null)
  const [shipIdCounter, setShipIdCounter] = useState(0)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)

  const allShipsPlaced = SHIPS_CONFIG.every(config =>
    placedShips.filter(p => p.size === config.size).length >= config.count
  )

  function handleAutoPlace() {
    const state = autoPlaceShips()
    setPlayerState(state)
    setPlacedShips(SHIPS_CONFIG.flatMap(c => Array(c.count).fill({ size: c.size, count: 1 })))
    setSelectedShip(null)
    setMessage('Корабли расставлены! Можешь начинать.')
  }

  function handlePlayerCellClick(row: number, col: number) {
    if (phase !== 'placing' || !selectedShip) return
    const result = placeShip(playerState.board, row, col, selectedShip.size, orientation, `ship_${shipIdCounter}`)
    if (!result) return
    setPlayerState(prev => ({ ...prev, board: result.board, ships: [...prev.ships, result.ship] }))
    setPlacedShips(prev => [...prev, { size: selectedShip.size, count: 1 }])
    setShipIdCounter(prev => prev + 1)
    setSelectedShip(null)
    setMessage('Выбери следующий корабль или нажми "Начать игру"')
  }

  function getHoverCells(): [number, number][] {
    if (!hoverCell || !selectedShip || phase !== 'placing') return []
    const [row, col] = hoverCell
    const cells: [number, number][] = []
    for (let i = 0; i < selectedShip.size; i++) {
      const r = orientation === 'vertical' ? row + i : row
      const c = orientation === 'horizontal' ? col + i : col
      if (r < 10 && c < 10) cells.push([r, c])
    }
    return cells
  }

  const hoverCells = getHoverCells()
  const canPlace = hoverCell && selectedShip
    ? canPlaceShip(playerState.board, hoverCell[0], hoverCell[1], selectedShip.size, orientation)
    : false

  async function updateStats(won: boolean) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!profile) return
    const totalShots = botVisibleBoard.flat().filter(c => c === 'hit' || c === 'miss' || c === 'sunk').length
    const hits = botVisibleBoard.flat().filter(c => c === 'hit' || c === 'sunk').length
    await supabase.from('profiles').update({
      wins: won ? profile.wins + 1 : profile.wins,
      losses: won ? profile.losses : profile.losses + 1,
      shots_fired: profile.shots_fired + totalShots,
      shots_hit: profile.shots_hit + hits,
    }).eq('id', user.id)
  }

  async function getAICoach(won: boolean) {
    const totalShots = botVisibleBoard.flat().filter(c => c !== 'empty').length
    const hits = botVisibleBoard.flat().filter(c => c === 'hit' || c === 'sunk').length
    try {
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shots: playerState.shots, totalShots, hits, won })
      })
      const { analysis } = await res.json()
      setAiAnalysis(analysis)
    } catch (e) { console.error(e) }
  }

  async function handleBotCellClick(row: number, col: number) {
    if (phase !== 'playing' || !isPlayerTurn) return
    if (botVisibleBoard[row][col] !== 'empty') return

    const { state: newBotState, hit, sunk, gameOver } = processShot(botState, row, col)
    setBotState(newBotState)

    const newVisible = botVisibleBoard.map(r => [...r]) as Board
    newVisible[row][col] = sunk ? 'sunk' : hit ? 'hit' : 'miss'
    setBotVisibleBoard(newVisible)

    const logMsg = hit ? (sunk ? `💥 Ты потопил корабль!` : `🎯 Попадание! [${row+1},${col+1}]`) : `💨 Промах [${row+1},${col+1}]`
    setGameLog(prev => [logMsg, ...prev].slice(0, 8))

    if (gameOver) {
      setPhase('finished')
      setWinner('player')
      setMessage('🎉 Ты победил!')
      await updateStats(true)
      setLoadingAI(true)
      await getAICoach(true)
      setLoadingAI(false)
      return
    }

    if (hit) {
      setMessage('Попал! Стреляй снова')
      return
    }

    setIsPlayerTurn(false)
    setMessage('Ход бота...')

    setTimeout(async () => {
      const [br, bc] = botShot(playerState)
      const { state: newPlayerState, hit: bHit, sunk: bSunk, gameOver: bOver } = processShot(playerState, br, bc)
      setPlayerState(newPlayerState)

      const botLog = bHit ? (bSunk ? `🤖 Бот потопил твой корабль!` : `🤖 Бот попал! [${br+1},${bc+1}]`) : `🤖 Бот промахнулся [${br+1},${bc+1}]`
      setGameLog(prev => [botLog, ...prev].slice(0, 8))

      if (bOver) {
        setPhase('finished')
        setWinner('bot')
        setMessage('😢 Бот победил...')
        await updateStats(false)
        setLoadingAI(true)
        await getAICoach(false)
        setLoadingAI(false)
        return
      }

      setIsPlayerTurn(true)
      setMessage(bHit ? 'Бот попал! Его ход снова...' : 'Твой ход')

      if (bHit && !bOver) {
        setTimeout(async () => {
          const [br2, bc2] = botShot(newPlayerState)
          const { state: np2, hit: bh2, sunk: bs2, gameOver: bo2 } = processShot(newPlayerState, br2, bc2)
          setPlayerState(np2)
          const l2 = bh2 ? (bs2 ? `🤖 Бот потопил твой корабль!` : `🤖 Бот попал снова! [${br2+1},${bc2+1}]`) : `🤖 Бот промахнулся [${br2+1},${bc2+1}]`
          setGameLog(prev => [l2, ...prev].slice(0, 8))
          if (bo2) {
            setPhase('finished')
            setWinner('bot')
            setMessage('😢 Бот победил...')
            await updateStats(false)
            setLoadingAI(true)
            await getAICoach(false)
            setLoadingAI(false)
            return
          }
          setIsPlayerTurn(true)
          setMessage('Твой ход')
        }, 800)
      }
    }, 800)
  }

  function resetGame() {
    setPhase('placing')
    setPlayerState({ board: createEmptyBoard(), ships: [], shots: [] })
    setBotState(autoPlaceShips())
    setBotVisibleBoard(createEmptyBoard())
    setPlacedShips([])
    setGameLog([])
    setWinner(null)
    setIsPlayerTurn(true)
    setMessage('Расставь корабли на своей доске')
    setAiAnalysis('')
    setLoadingAI(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors">
            ← Назад
          </button>
          <h1 className="text-2xl font-bold">⚓ NavalStrike</h1>
          <div className="text-sm text-gray-400">
            {phase === 'placing' ? 'Расстановка' : phase === 'playing' ? (isPlayerTurn ? '🟢 Твой ход' : '🔴 Ход бота') : '🏁 Игра окончена'}
          </div>
        </div>

        {/* Message */}
        <div className="text-center mb-6">
          <p className="text-lg font-medium text-blue-300">{message}</p>
        </div>

        {/* Ship placement controls */}
        {phase === 'placing' && (
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {SHIPS_CONFIG.map(config => {
              const remaining = config.count - placedShips.filter(p => p.size === config.size).length
              return Array(config.count).fill(0).map((_, i) => {
                const isPlaced = i >= remaining
                const isSelected = selectedShip?.size === config.size && !isPlaced
                return (
                  <button
                    key={`${config.size}-${i}`}
                    onClick={() => !isPlaced && setSelectedShip({ size: config.size, index: i })}
                    disabled={isPlaced}
                    className={`flex gap-1 p-2 rounded-lg border transition-all ${isPlaced ? 'opacity-30 cursor-not-allowed border-gray-700' : isSelected ? 'border-blue-400 bg-blue-900' : 'border-gray-600 hover:border-blue-500 cursor-pointer'}`}
                  >
                    {Array(config.size).fill(0).map((_, j) => (
                      <div key={j} className={`w-6 h-6 rounded ${isPlaced ? 'bg-gray-600' : 'bg-blue-500'}`} />
                    ))}
                  </button>
                )
              })
            })}
            <button
              onClick={() => setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal')}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm hover:border-blue-500 transition-all"
            >
              🔄 {orientation === 'horizontal' ? 'Горизонт.' : 'Вертикал.'}
            </button>
            <button onClick={handleAutoPlace} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm transition-all">
              🎲 Авто
            </button>
            {allShipsPlaced && (
              <button
                onClick={() => { setPhase('playing'); setMessage('Твой ход! Нажми на поле противника') }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-all"
              >
                ▶ Начать игру
              </button>
            )}
          </div>
        )}

        {/* Boards */}
        <div className="flex flex-col lg:flex-row gap-8 justify-center items-start">
          {/* Player board */}
          <div>
            <h3 className="text-center text-gray-400 mb-3 font-medium">Твоё поле</h3>
            <div className="inline-block border border-gray-700 rounded-lg overflow-hidden">
              {playerState.board.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => {
                    const isHover = hoverCells.some(([hr, hc]) => hr === r && hc === c)
                    return (
                      <div
                        key={c}
                        onClick={() => handlePlayerCellClick(r, c)}
                        onMouseEnter={() => setHoverCell([r, c])}
                        onMouseLeave={() => setHoverCell(null)}
                        className={`w-8 h-8 border transition-all cursor-pointer
                          ${isHover ? (canPlace ? 'bg-blue-400' : 'bg-red-400') : CELL_COLORS[cell]}
                        `}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Game log */}
          <div className="lg:w-48 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-3">📋 Лог</h3>
            {gameLog.length === 0 ? (
              <p className="text-gray-600 text-xs">Игра ещё не началась</p>
            ) : (
              gameLog.map((log, i) => (
                <p key={i} className={`text-xs mb-1 ${i === 0 ? 'text-white' : 'text-gray-500'}`}>{log}</p>
              ))
            )}
          </div>

          {/* Bot board */}
          <div>
            <h3 className="text-center text-gray-400 mb-3 font-medium">Поле противника</h3>
            <div className="inline-block border border-gray-700 rounded-lg overflow-hidden">
              {botVisibleBoard.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => (
                    <div
                      key={c}
                      onClick={() => handleBotCellClick(r, c)}
                      className={`w-8 h-8 border transition-all
                        ${phase === 'playing' && isPlayerTurn && cell === 'empty' ? 'cursor-crosshair hover:bg-blue-800' : 'cursor-default'}
                        ${CELL_COLORS[cell]}
                      `}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Finished screen */}
        {phase === 'finished' && (
          <div className="mt-8 text-center">
            <div className={`text-4xl font-bold mb-4 ${winner === 'player' ? 'text-green-400' : 'text-red-400'}`}>
              {winner === 'player' ? '🏆 Победа!' : '💀 Поражение'}
            </div>
            <div className="flex gap-4 justify-center mb-6">
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-all"
              >
                🔄 Играть снова
              </button>
              <button onClick={() => router.push('/')} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-all">
                🏠 Главная
              </button>
            </div>

            {/* AI Coach */}
            <div className="max-w-lg mx-auto">
              {loadingAI && (
                <div className="bg-gray-900 border border-blue-800 rounded-xl p-4 animate-pulse">
                  <p className="text-blue-400 text-sm">🤖 AI анализирует твою игру...</p>
                </div>
              )}
              {aiAnalysis && (
                <div className="bg-gray-900 border border-blue-800 rounded-xl p-5 text-left">
                  <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                    🤖 AI Coach — разбор партии
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{aiAnalysis}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}