import { NextRequest } from 'next/server'

// Import from the start route (in production, this would be in a shared module)
// For now, we'll maintain a separate SSE clients array
let sseClients: WritableStreamDefaultWriter[] = []

export async function GET(request: NextRequest) {
  console.log('[Queue] New SSE client connected')

  // Create a ReadableStream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'))

      // Create a writer for this client
      const writer = {
        write: (data: Uint8Array) => {
          try {
            controller.enqueue(data)
          } catch (error) {
            console.warn('[Queue] SSE client disconnected:', error)
            // Remove this writer from the clients list
            const index = sseClients.indexOf(writer as any)
            if (index > -1) {
              sseClients.splice(index, 1)
            }
          }
        },
        close: () => {
          try {
            controller.close()
          } catch (error) {
            // Already closed
          }
        }
      }

      // Add to clients list
      sseClients.push(writer as any)

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.log('[Queue] SSE client disconnected')
        const index = sseClients.indexOf(writer as any)
        if (index > -1) {
          sseClients.splice(index, 1)
        }
        try {
          controller.close()
        } catch (error) {
          // Already closed
        }
      })
    }
  })

  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}

// Helper function to broadcast progress to all SSE clients
export function broadcastProgress(data: any) {
  const message = JSON.stringify(data)
  const encoder = new TextEncoder()
  const encodedData = encoder.encode(`data: ${message}\n\n`)

  sseClients.forEach((writer, index) => {
    try {
      writer.write(encodedData)
    } catch (error) {
      console.warn('[Queue] Failed to send SSE message, removing client:', error)
      sseClients.splice(index, 1)
    }
  })
}

// Export for use in other queue endpoints
export { sseClients }