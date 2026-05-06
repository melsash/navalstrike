import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('wins', { ascending: false })
    .limit(50)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">← Назад</Link>
          <h1 className="text-2xl font-bold">🏆 Глобальный рейтинг</h1>
          <div />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
            <div className="col-span-1">#</div>
            <div className="col-span-4">Игрок</div>
            <div className="col-span-2 text-center">Победы</div>
            <div className="col-span-2 text-center">Поражения</div>
            <div className="col-span-3 text-center">Точность</div>
          </div>

          {profiles?.map((profile, index) => {
            const accuracy = profile.shots_fired > 0
              ? Math.round((profile.shots_hit / profile.shots_fired) * 100)
              : 0
            const isMe = profile.id === user.id
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null

            return (
              <div
                key={profile.id}
                className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-800/50 transition-colors
                  ${isMe ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : 'hover:bg-gray-800/30'}`}
              >
                <div className="col-span-1 flex items-center">
                  {medal ? (
                    <span className="text-lg">{medal}</span>
                  ) : (
                    <span className="text-gray-500 text-sm">{index + 1}</span>
                  )}
                </div>
                <div className="col-span-4 flex items-center gap-2">
                  <span className={`font-medium text-sm ${isMe ? 'text-blue-300' : 'text-white'}`}>
                    {profile.username}
                  </span>
                  {isMe && <span className="text-xs bg-blue-600 px-1.5 py-0.5 rounded text-white">Ты</span>}
                  {profile.is_pro && <span className="text-xs bg-yellow-500 px-1.5 py-0.5 rounded text-black font-bold">PRO</span>}
                </div>
                <div className="col-span-2 flex items-center justify-center">
                  <span className="text-green-400 font-semibold">{profile.wins}</span>
                </div>
                <div className="col-span-2 flex items-center justify-center">
                  <span className="text-red-400">{profile.losses}</span>
                </div>
                <div className="col-span-3 flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${accuracy}%` }}
                      />
                    </div>
                    <span className="text-gray-300 text-sm">{accuracy}%</span>
                  </div>
                </div>
              </div>
            )
          })}

          {(!profiles || profiles.length === 0) && (
            <div className="text-center py-12 text-gray-500">
              Пока нет игроков. Сыграй первую партию!
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-4">
          Обновляется после каждой партии
        </p>
      </div>
    </div>
  )
}