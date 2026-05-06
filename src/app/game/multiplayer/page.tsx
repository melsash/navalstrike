'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { generateRoomCode } from '@/lib/game/room'

export default function MultiplayerLobby() {
  const router = useRouter()
  const supabase = createClient()
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const code = generateRoomCode()
    const { data, error: err } = await supabase.from('rooms').insert({
      code,
      host_id: user.id,
      status: 'waiting',
      host_shots: [],
      guest_shots: [],
    }).select().single()

    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/game/room/${data.id}`)
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const { data: room, error: err } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', joinCode.toUpperCase())
      .eq('status', 'waiting')
      .single()

    if (err || !room) { setError('Комната не найдена или уже заполнена'); setLoading(false); return }
    if (room.host_id === user.id) { setError('Это твоя собственная комната!'); setLoading(false); return }

    const { error: updateErr } = await supabase
      .from('rooms')
      .update({ guest_id: user.id, status: 'placing' })
      .eq('id', room.id)

    if (updateErr) { setError(updateErr.message); setLoading(false); return }
    router.push(`/game/room/${room.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-white text-sm mb-4 block mx-auto transition-colors">
            ← Назад
          </button>
          <h1 className="text-3xl font-bold mb-2">🌐 Мультиплеер</h1>
          <p className="text-gray-400">Играй с другом по ссылке</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-all text-lg"
          >
            {loading ? 'Создаём...' : '🚀 Создать комнату'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-950 text-gray-500">или</span>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="font-medium text-gray-300">Войти в комнату</h3>
            <input
              type="text"
              placeholder="Код комнаты (например: ABC123)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 uppercase tracking-widest text-center text-xl font-mono"
            />
            <button
              onClick={handleJoin}
              disabled={loading || joinCode.length < 6}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-all"
            >
              Войти →
            </button>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>
      </div>
    </div>
  )
}