import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/outbound-ip')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const useProxy = new URL(request.url).searchParams.get('proxy') === '1'
        const fixieUrl = process.env.FIXIE_URL?.trim()
        let ip: unknown
        let via = 'direct'
        let error: string | undefined
        try {
          if (useProxy && fixieUrl) {
            const undici = await import('undici')
            const dispatcher = new undici.ProxyAgent(fixieUrl)
            const r = await undici.fetch('https://api.ipify.org?format=json', { dispatcher } as Parameters<typeof undici.fetch>[1])
            ip = await r.json()
            via = 'fixie'
          } else {
            const r = await fetch('https://api.ipify.org?format=json')
            ip = await r.json()
          }
        } catch (e) {
          error = (e as Error).message
        }
        return new Response(JSON.stringify({ via, ip, error, fixieConfigured: !!fixieUrl }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})