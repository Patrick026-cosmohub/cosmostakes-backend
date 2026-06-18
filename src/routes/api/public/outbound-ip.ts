import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/outbound-ip')({
  server: {
    handlers: {
      GET: async () => {
        const r = await fetch('https://api.ipify.org?format=json')
        const j = await r.json()
        return new Response(JSON.stringify(j), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})