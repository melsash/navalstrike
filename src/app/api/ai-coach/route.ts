import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { totalShots, hits, won } = await req.json()
    const accuracy = totalShots > 0 ? Math.round((hits / totalShots) * 100) : 0

    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.2-1B-Instruct',
        messages: [{
          role: 'user',
          content: `Ты — тренер по Морскому бою. Напиши короткий отзыв на русском языке, 2-3 простых предложения.

Игрок ${won ? 'победил' : 'проиграл'}. Точность: ${accuracy}%. Выстрелов: ${totalShots}, попаданий: ${hits}.

Напиши только совет игроку, без цифр и списков. Например: "Отличная игра! Твоя точность выше среднего. В следующий раз старайся стрелять по шахматному паттерну чтобы быстрее находить корабли."`
        }],
        max_tokens: 200,
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('HF error:', err)
      return NextResponse.json({ analysis: 'AI Coach временно недоступен.' })
    }

    const data = await response.json()
    const analysis = data.choices?.[0]?.message?.content?.trim() ?? 'Хорошая партия!'
    return NextResponse.json({ analysis })

  } catch (e) {
    console.error('AI Coach error:', e)
    return NextResponse.json({ analysis: 'Ошибка при анализе.' })
  }
}