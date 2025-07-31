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
    
    // Create downloads directory if it doesn't exist
    try {
      const { execSync } = require('child_process')
      execSync('mkdir -p /tmp/downloads', { stdio: 'ignore' })
    } catch (e) {
      console.warn('[Queue] Could not create downloads directory:', e)
    }

    // Start yt-dlp process with better options
    const ytDlpProcess = spawn('yt-dlp', [
      '--newline',
      '--progress',
      '--no-part',
      '--no-playlist',
      '--extract-flat', 'false',
      '--output', `/tmp/downloads/%(title)s_${quality}.%(ext)s`,
      '--format', `best[height<=${quality.replace('p', '')}]/best`,
      '--no-warnings',
      youtubeUrl
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

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
      console.log(`[Queue] yt-dlp output (${id}):`, output.trim())
      const lines = output.split('\n')
      
      for (const line of lines) {
        if (line.includes('%') && line.includes('[download]')) {
          try {
            // More flexible progress parsing
            // Example: [download]  45.2% of 162.3MiB at 2.5MiB/s ETA 01:23
            const progressMatch = line.match(/\[download\]\s*(\d+\.?\d*)%/)
            const sizeMatch = line.match(/of\s+([\d.]+\w+)/)
            const speedMatch = line.match(/at\s+([\d.]+\w+\/s)/)
            const etaMatch = line.match(/ETA\s+([\d:]+)/)
            
            if (progressMatch) {
              const progress = parseFloat(progressMatch[1])
              downloadInfo.progress = progress
              
              if (sizeMatch) {
                downloadInfo.totalSize = sizeMatch[1]
                // Calculate downloaded size
                const totalBytes = parseFloat(sizeMatch[1])
                const unit = sizeMatch[1].replace(/[\d.]/g, '')
                downloadInfo.downloadedSize = `${(totalBytes * progress / 100).toFixed(1)}${unit}`
              }
              
              if (speedMatch) {
                downloadInfo.speed = speedMatch[1]
              }
              
              if (etaMatch) {
                downloadInfo.eta = etaMatch[1]
              } else {
                downloadInfo.eta = '--:--'
              }
              
              // Broadcast progress to SSE clients
              broadcastProgress(id, downloadInfo)
              console.log(`[Queue] Progress update (${id}): ${progress}% - ${downloadInfo.downloadedSize}/${downloadInfo.totalSize} @ ${downloadInfo.speed}`)
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

  console.log(`[Queue] Broadcasting progress for ${id}:`, message)

  // Import the SSE broadcasting function from the progress route
  try {
    const { broadcastProgress: sseBroadcast } = require('../progress/route')
    if (sseBroadcast) {
      sseBroadcast({
        id,
        status: downloadInfo.status,
        progress: downloadInfo.progress,
        downloadedSize: downloadInfo.downloadedSize,
        totalSize: downloadInfo.totalSize,
        speed: downloadInfo.speed,
        eta: downloadInfo.eta,
        timestamp: Date.now()
      })
    }
  } catch (error) {
    console.warn('[Queue] Failed to broadcast progress:', error)
  }
}

// Export for use in SSE endpoint
export { activeDownloads, sseClients }