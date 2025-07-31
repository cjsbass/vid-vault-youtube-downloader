import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'

// In-memory storage for active downloads (in production, use Redis or database)
const activeDownloads = new Map<string, {
  process: ChildProcess
  startTime: number
  status: 'downloading' | 'paused' | 'completed' | 'failed'
  progress: number
  downloadedSize: string
  totalSize: string
  speed: string
  eta: string
}>()

// Global event emitter for SSE
let sseClients: Response[] = []

export async function POST(request: NextRequest) {
  try {
    const { id, videoId, quality } = await request.json()

    if (!id || !videoId || !quality) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Check if already downloading
    if (activeDownloads.has(id)) {
      return NextResponse.json({ error: 'Download already in progress' }, { status: 409 })
    }

    console.log(`[Queue] Starting download: ${id} (${videoId} @ ${quality})`)

    // Construct the YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    
    // Start yt-dlp process
    const ytDlpProcess = spawn('yt-dlp', [
      '--newline',
      '--progress',
      '--no-part',
      '--output', `/tmp/downloads/%(title)s_${quality}.%(ext)s`,
      '--format', `best[height<=${quality.replace('p', '')}]`,
      youtubeUrl
    ])

    // Initialize download tracking
    const downloadInfo = {
      process: ytDlpProcess,
      startTime: Date.now(),
      status: 'downloading' as const,
      progress: 0,
      downloadedSize: '0 MB',
      totalSize: '0 MB',
      speed: '0 MB/s',
      eta: '--:--'
    }

    activeDownloads.set(id, downloadInfo)

    // Parse yt-dlp output for progress
    ytDlpProcess.stdout.on('data', (data) => {
      const output = data.toString()
      const lines = output.split('\n')
      
      for (const line of lines) {
        if (line.includes('%')) {
          try {
            // Parse progress line: [download]  45.2% of 162.3MiB at 2.5MiB/s ETA 01:23
            const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)(?:\s+ETA\s+([\d:]+))?/)
            
            if (progressMatch) {
              const [, progressStr, totalSize, speed, eta] = progressMatch
              const progress = parseFloat(progressStr)
              
              downloadInfo.progress = progress
              downloadInfo.totalSize = totalSize
              downloadInfo.speed = speed
              downloadInfo.eta = eta || '--:--'
              downloadInfo.downloadedSize = `${(parseFloat(totalSize) * progress / 100).toFixed(1)}${totalSize.replace(/[\d.]/g, '')}`
              
              // Broadcast progress to SSE clients
              broadcastProgress(id, downloadInfo)
            }
          } catch (e) {
            console.warn('[Queue] Error parsing progress:', e)
          }
        }
      }
    })

    ytDlpProcess.stderr.on('data', (data) => {
      console.error(`[Queue] yt-dlp stderr (${id}):`, data.toString())
    })

    ytDlpProcess.on('close', (code) => {
      console.log(`[Queue] Download completed: ${id} (exit code: ${code})`)
      
      if (code === 0) {
        downloadInfo.status = 'completed'
        downloadInfo.progress = 100
      } else {
        downloadInfo.status = 'failed'
      }
      
      // Broadcast final status
      broadcastProgress(id, downloadInfo)
      
      // Clean up after a delay
      setTimeout(() => {
        activeDownloads.delete(id)
      }, 60000) // Keep for 1 minute for final status updates
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Download started',
      downloadId: id 
    })

  } catch (error) {
    console.error('[Queue] Start download error:', error)
    return NextResponse.json({ 
      error: 'Failed to start download' 
    }, { status: 500 })
  }
}

// Helper function to broadcast progress to SSE clients
function broadcastProgress(id: string, downloadInfo: any) {
  const message = JSON.stringify({
    id,
    status: downloadInfo.status,
    progress: downloadInfo.progress,
    downloadedSize: downloadInfo.downloadedSize,
    totalSize: downloadInfo.totalSize,
    speed: downloadInfo.speed,
    eta: downloadInfo.eta,
    timestamp: Date.now()
  })

  sseClients.forEach((client, index) => {
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(`data: ${message}\n\n`)
      client.body?.getWriter().write(data)
    } catch (error) {
      console.warn('[Queue] Failed to send SSE message, removing client:', error)
      sseClients.splice(index, 1)
    }
  })
}

// Export for use in SSE endpoint
export { activeDownloads, sseClients }