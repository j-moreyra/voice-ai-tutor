import Anthropic from '@anthropic-ai/sdk'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://voice-ai-tutor.netlify.app',
]

function getCorsOrigin(requestOrigin: string | undefined): string {
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin
  return ALLOWED_ORIGINS[0]
}

export default async (req: Request) => {
  const origin = req.headers.get('origin') ?? undefined

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': getCorsOrigin(origin),
        'Access-Control-Allow-Headers': 'content-type, authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set')
    return Response.json(
      { error: 'Service configuration error' },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': getCorsOrigin(origin) },
      },
    )
  }

  try {
    const { text, prompt, chunk_index, total_chunks } = await req.json()

    if (!text || !prompt) {
      return Response.json(
        { error: 'Missing text or prompt' },
        {
          status: 400,
          headers: { 'Access-Control-Allow-Origin': getCorsOrigin(origin) },
        },
      )
    }

    const chunkContext = total_chunks > 1
      ? `\n\nIMPORTANT CONTEXT: This is chunk ${chunk_index + 1} of ${total_chunks} from a larger document. Process ONLY the content in this chunk. Use sort_order values starting from ${chunk_index * 1000} so they can be merged with other chunks later. If a chapter or section appears to continue from a previous chunk, use the EXACT same title so chunks can be merged.\n\n---\n\nHere is the extracted text for this chunk:\n\n`
      : '\n\n---\n\nHere is the extracted text:\n\n'

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: `${prompt}${chunkContext}${text}`,
        },
      ],
    })

    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => {
        if (block.type === 'text') return block.text
        return ''
      })
      .join('')

    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json(
        { error: `Claude did not return valid JSON for chunk ${chunk_index + 1}` },
        {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': getCorsOrigin(origin) },
        },
      )
    }

    const parsed = JSON.parse(jsonMatch[0])

    return Response.json(parsed, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': getCorsOrigin(origin) },
    })
  } catch (err) {
    console.error('process-chunk error:', err)
    return Response.json(
      { error: 'An error occurred while processing the chunk' },
      {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': getCorsOrigin(origin) },
      },
    )
  }
}
