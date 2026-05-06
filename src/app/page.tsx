import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚓</span>
          <span className="text-xl font-bold">NavalStrike</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">@{profile?.username}</span>
          <Link href="/leaderboard" className="text-gray-400 hover:text-white text-sm transition-colors">
            Рейтинг
          </Link>
          <Link href="/api/auth/signout" className="text-gray-400 hover:text-white text-sm transition-colors">
            Выйти
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Морской бой
        </h1>
        <p className="text-xl text-gray-400 mb-12">
          Нового поколения. С AI-тренером и живым мультиплеером.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-12 max-w-lg mx-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">{profile?.wins ?? 0}</div>
            <div className="text-gray-500 text-sm">Побед</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-400">{profile?.losses ?? 0}</div>
            <div className="text-gray-500 text-sm">Поражений</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">
              {profile?.shots_fired ? Math.round((profile.shots_hit / profile.shots_fired) * 100) : 0}%
            </div>
            <div className="text-gray-500 text-sm">Точность</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/game/new" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl transition-all text-lg">
            🎮 Играть с ботом
          </Link>
          <Link href="/game/multiplayer" className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold px-8 py-4 rounded-xl transition-all text-lg">
            🌐 Мультиплеер
          </Link>
          <Link href="/leaderboard" className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-semibold px-8 py-4 rounded-xl transition-all text-lg">
            🏆 Рейтинг
          </Link>
        </div>
      </div>
    </div>
  )
}