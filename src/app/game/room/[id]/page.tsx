'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GameState, Board, SHIPS_CONFIG, Orientation } from '@/lib/game/types'
import { createEmptyBoard, autoPlaceShips, canPlaceShip, placeShip, processShot } from '@/lib/game/utils'

const CELL_COLORS: Record<string, string> = {
  empty: 'bg-gray-800 border-gray-700',
  ship: 'bg-blue-600 border-blue-500',
  hit: 'bg-red-500 border-red-400',
  miss: 'bg-gray-600 border-gray-500',
  sunk: 'bg-red-800 border-red-700',
}

export default function RoomPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string
  const supabase = createClient()

  const [room, setRoom] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<GameState>({ board: createEmptyBoard(), ships: [], shots: [] })
  const [opponentBoard, setOpponentBoard] = useState<Board>(createEmptyBoard())
  const [placedShips, setPlacedShips] = useState<{ size: number }[]>([])
  const [selectedShip, setSelectedShip] = useState<{ size: number } | null>(null)
  const [orientation, setOrientation] = useState<Orientation>('horizontal')
  const [message, setMessage] = useState('Ожидание...')
  const [gameLog, setGameLog] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  const isHost = room?.host_id === userId
  const isGuest = room?.guest_id === userId
  const isMyTurn = room?.current_turn === userId

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (!roomId) return
    // Загружаем комнату
    supabase.from('rooms').select('*').eq('id', roomId).single().then(({ data }) => {
      if (data) setRoom(data)
    })
    // Подписка на realtime
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // Обновляем сообщение и доску противника при изменении комнаты
  useEffect(() => {
    if (!room || !userId) return

    if (room.status === 'waiting') {
      setMessage(`🔗 Код комнаты: ${room.code} — жди соперника`)
    } else if (room.status === 'placing') {
      setMessage('Расставь корабли и нажми "Готов"')
    } else if (room.status === 'playing') {
      if (room.current_turn === userId) setMessage('🟢 Твой ход — кликни по полю врага')
      else setMessage('⏳ Ход соперника...')

      // Восстанавливаем видимую доску противника из выстрелов
      const myShots: [number, number][] = isHost ? (room.host_shots || []) : (room.guest_shots || [])
      const oppBoard = room.guest_id && isHost ? room.guest_board : room.host_board
      const visibleBoard = createEmptyBoard()
      if (oppBoard) {
        for (const [r, c] of myShots) {
          const cell = oppBoard[r]?.[c]
          visibleBoard[r][c] = cell === 'ship' ? 'hit' : 'miss'
        }
      }
      setOpponentBoard(visibleBoard)
    } else if (room.status === 'finished') {
      setMessage(room.winner_id === userId ? '🏆 Ты победил!' : '💀 Ты проиграл...')
    }
  }, [room, userId])

  function handleAutoPlace() {
    const state = autoPlaceShips()
    setPlayerState(state)
    setPlacedShips(SHIPS_CONFIG.flatMap(c => Array(c.count).fill({ size: c.size })))
  }

  function handlePlayerCellClick(row: number, col: number) {
    if (room?.status !== 'placing' || !selectedShip) return
    const result = placeShip(playerState.board, row, col, selectedShip.size, orientation, `ship_${Date.now()}`)
    if (!result) return
    setPlayerState(prev => ({ ...prev, board: result.board, ships: [...prev.ships, result.ship] }))
    setPlacedShips(prev => [...prev, { size: selectedShip.size }])
    setSelectedShip(null)
  }

  async function handleReady() {
    if (!userId || !room) return
    const field = isHost ? 'host_board' : 'guest_board'
    const update: any = { [field]: playerState.board }

    // Если оба готовы — начинаем игру
    const otherBoard = isHost ? room.guest_board : room.host_board
    if (otherBoard) {
      update.status = 'playing'
      update.current_turn = room.host_id
    }
    await supabase.from('rooms').update(update).eq('id', room.id)
  }

  async function handleOpponentCellClick(row: number, col: number) {
    if (!isMyTurn || room?.status !== 'playing') return
    if (opponentBoard[row][col] !== 'empty') return

    const oppBoardRaw: Board = isHost ? room.guest_board : room.host_board
    if (!oppBoardRaw) return

    const cell = oppBoardRaw[row][col]
    const hit = cell === 'ship'

    // Обновляем видимую доску
    const newVisible = opponentBoard.map(r => [...r]) as Board
    newVisible[row][col] = hit ? 'hit' : 'miss'
    setOpponentBoard(newVisible)

    // Обновляем доску противника (помечаем попадание)
    const newOppBoard = oppBoardRaw.map(r => [...r]) as Board
    newOppBoard[row][col] = hit ? 'hit' : 'miss'

    const myShots = isHost ? [...(room.host_shots || []), [row, col]] : [...(room.guest_shots || []), [row, col]]
    const nextTurn = hit ? userId : (isHost ? room.guest_id : room.host_id)

    // Проверяем победу
    const allSunk = newOppBoard.every(r => r.every(c => c !== 'ship'))

    const update: any = {
      [isHost ? 'guest_board' : 'host_board']: newOppBoard,
      [isHost ? 'host_shots' : 'guest_shots']: myShots,
      current_turn: nextTurn,
    }
    if (allSunk) {
      update.status = 'finished'
      update.winner_id = userId
      update.finished_at = new Date().toISOString()
    }

    await supabase.from('rooms').update(update).eq('id', room.id)

    const log = hit ? `🎯 Попадание! [${row+1},${col+1}]` : `💨 Промах [${row+1},${col+1}]`
    setGameLog(prev => [log, ...prev].slice(0, 8))
  }

  function copyCode() {
    navigator.clipboard.writeText(room?.code || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const allShipsPlaced = SHIPS_CONFIG.reduce((acc, c) => acc + c.count, 0) === placedShips.length
  const remainingShips = SHIPS_CONFIG.map(config => ({
    size: config.size,
    remaining: config.count - placedShips.filter(p => p.size === config.size).length
  })).filter(s => s.remaining > 0)

  if (!room) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-white text-xl animate-pulse">Загрузка комнаты...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white transition-colors">← Назад</button>
          <h1 className="text-2xl font-bold">⚓ NavalStrike</h1>
          <div className="flex items-center gap-2">
            {room.status === 'waiting' && (
              <button onClick={copyCode} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-all">
                {copied ? '✅ Скопировано!' : `📋 ${room.code}`}
              </button>
            )}
            <span className="text-sm text-gray-400 capitalize">{room.status}</span>
          </div>
        </div>

        <div className="text-center mb-6">
          <p className="text-lg font-medium text-blue-300">{message}</p>
          {room.status === 'waiting' && (
            <p className="text-gray-500 text-sm mt-1">Поделись кодом <span className="text-white font-mono font-bold">{room.code}</span> с другом</p>
          )}
        </div>

        {/* Ship selector */}
        {room.status === 'placing' && (
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {SHIPS_CONFIG.map(config => {
              const remaining = config.count - placedShips.filter(p => p.size === config.size).length
              return Array(config.count).fill(0).map((_, i) => {
                const isPlaced = i >= remaining
                const isSelected = selectedShip?.size === config.size && !isPlaced
                return (
                  <button key={`${config.size}-${i}`} onClick={() => !isPlaced && setSelectedShip({ size: config.size })} disabled={isPlaced}
                    className={`flex gap-1 p-2 rounded-lg border transition-all ${isPlaced ? 'opacity-30 cursor-not-allowed border-gray-700' : isSelected ? 'border-blue-400 bg-blue-900' : 'border-gray-600 hover:border-blue-500 cursor-pointer'}`}>
                    {Array(config.size).fill(0).map((_, j) => <div key={j} className={`w-6 h-6 rounded ${isPlaced ? 'bg-gray-600' : 'bg-blue-500'}`} />)}
                  </button>
                )
              })
            })}
            <button onClick={() => setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal')}
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm hover:border-blue-500 transition-all">
              🔄 {orientation === 'horizontal' ? 'Горизонт.' : 'Вертикал.'}
            </button>
            <button onClick={handleAutoPlace} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm transition-all">🎲 Авто</button>
            {allShipsPlaced && (
              <button onClick={handleReady} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition-all">✅ Готов!</button>
            )}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 justify-center items-start">
          {/* My board */}
          <div>
            <h3 className="text-center text-gray-400 mb-3 font-medium">Твоё поле</h3>
            <div className="inline-block border border-gray-700 rounded-lg overflow-hidden">
              {playerState.board.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => (
                    <div key={c} onClick={() => handlePlayerCellClick(r, c)}
                      className={`w-8 h-8 border transition-all cursor-pointer ${CELL_COLORS[cell]}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Log */}
          <div className="lg:w-48 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-gray-400 text-sm font-medium mb-3">📋 Лог</h3>
            {gameLog.length === 0
              ? <p className="text-gray-600 text-xs">Игра ещё не началась</p>
              : gameLog.map((log, i) => <p key={i} className={`text-xs mb-1 ${i === 0 ? 'text-white' : 'text-gray-500'}`}>{log}</p>)
            }
          </div>

          {/* Opponent board */}
          <div>
            <h3 className="text-center text-gray-400 mb-3 font-medium">Поле противника</h3>
            <div className="inline-block border border-gray-700 rounded-lg overflow-hidden">
              {opponentBoard.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => (
                    <div key={c} onClick={() => handleOpponentCellClick(r, c)}
                      className={`w-8 h-8 border transition-all
                        ${room.status === 'playing' && isMyTurn && cell === 'empty' ? 'cursor-crosshair hover:bg-blue-800' : 'cursor-default'}
                        ${CELL_COLORS[cell]}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {room.status === 'finished' && (
          <div className="mt-8 text-center">
            <div className={`text-4xl font-bold mb-6 ${room.winner_id === userId ? 'text-green-400' : 'text-red-400'}`}>
              {room.winner_id === userId ? '🏆 Победа!' : '💀 Поражение'}
            </div>
            <button onClick={() => router.push('/')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-all">
              🏠 На главную
            </button>
          </div>
        )}
      </div>
    </div>
  )
}