import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import { broadcastProgress } from '../progress/route'

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
    
    console.log(`[Queue] POST request received - ID: ${id}, Video: ${videoId}, Quality: ${quality}`)
    console.log(`[Queue] Current activeDownloads size: ${activeDownloads.size}`)
    console.log(`[Queue] Active download IDs: ${Array.from(activeDownloads.keys())}`)

    if (!id || !videoId || !quality) {
      console.error(`[Queue] Missing parameters - ID: ${id}, Video: ${videoId}, Quality: ${quality}`)
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Check if already downloading
    if (activeDownloads.has(id)) {
      const existing = activeDownloads.get(id)
      console.log(`[Queue] Found existing download for ${id}:`, { 
        status: existing?.status, 
        progress: existing?.progress 
      })
      
      if (existing && existing.status === 'downloading') {
        console.log(`[Queue] 409 - Download already in progress: ${id}`)
        return NextResponse.json({ error: 'Download already in progress' }, { status: 409 })
      } else {
        // Clean up stale entry
        activeDownloads.delete(id)
        console.log(`[Queue] Cleaned up stale download entry: ${id}`)
      }
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
      '--retries', '3',
      '--fragment-retries', '3',
      '--output', `/tmp/downloads/%(title)s_${quality}.%(ext)s`,
      '--format', `best[height<=${quality.replace('p', '')}]/best`,
      '--no-warnings',
      '--http-chunk-size', '1M',
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
    console.log(`[Queue] Added to activeDownloads: ${id}. New size: ${activeDownloads.size}`)
    
    // Immediately broadcast initial status
    broadcastProgress({
      id,
      status: downloadInfo.status,
      progress: downloadInfo.progress,
      downloadedSize: downloadInfo.downloadedSize,
      totalSize: downloadInfo.totalSize,
      speed: downloadInfo.speed,
      eta: downloadInfo.eta,
      timestamp: Date.now()
    })
    console.log(`[Queue] Initial status broadcast for: ${id}`)

    // Parse yt-dlp output for progress
    ytDlpProcess.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(`[Queue] yt-dlp raw output (${id}):`, JSON.stringify(output))
      const lines = output.split('\n')
      
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[Queue] Processing line (${id}):`, line.trim())
          
          // Check for various progress patterns
          if (line.includes('%') || line.includes('[download]')) {
            try {
              // Pattern 1: [download]  45.2% of 162.3MiB at 2.5MiB/s ETA 01:23
              let progressMatch = line.match(/(\d+\.?\d*)%/)
              let sizeMatch = line.match(/of\s+([\d.]+\w+)/)
              let speedMatch = line.match(/at\s+([\d.]+\w+\/s)/)
              let etaMatch = line.match(/ETA\s+([\d:]+)/)
              
              // Pattern 2: [download] 45.2% of ~162.3MiB at 2.5MiB/s ETA 01:23
              if (!progressMatch) {
                progressMatch = line.match(/\[download\]\s*(\d+\.?\d*)%/)
              }
              
              if (progressMatch) {
                const progress = parseFloat(progressMatch[1])
                console.log(`[Queue] Found progress (${id}): ${progress}%`)
                downloadInfo.progress = progress
                
                if (sizeMatch) {
                  downloadInfo.totalSize = sizeMatch[1]
                  // Calculate downloaded size
                  const totalNumeric = parseFloat(sizeMatch[1])
                  const unit = sizeMatch[1].replace(/[\d.]/g, '')
                  downloadInfo.downloadedSize = `${(totalNumeric * progress / 100).toFixed(1)}${unit}`
                }
                
                if (speedMatch) {
                  downloadInfo.speed = speedMatch[1]
                }
                
                if (etaMatch) {
                  downloadInfo.eta = etaMatch[1]
                } else {
                  downloadInfo.eta = progress < 100 ? 'calculating...' : '00:00'
                }
                
                // Broadcast progress to SSE clients
                broadcastProgress({
                  id,
                  status: downloadInfo.status,
                  progress: downloadInfo.progress,
                  downloadedSize: downloadInfo.downloadedSize,
                  totalSize: downloadInfo.totalSize,
                  speed: downloadInfo.speed,
                  eta: downloadInfo.eta,
                  timestamp: Date.now()
                })
                console.log(`[Queue] Broadcasting progress (${id}): ${progress}% - ${downloadInfo.downloadedSize}/${downloadInfo.totalSize} @ ${downloadInfo.speed}`)
              }
            } catch (e) {
              console.warn(`[Queue] Error parsing progress line (${id}):`, e, 'Line:', line)
            }
          }
        }
      }
    })

    ytDlpProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString()
      console.error(`[Queue] yt-dlp stderr (${id}):`, errorOutput)
      
      // Handle specific errors
      if (errorOutput.includes('HTTP Error 416') || errorOutput.includes('Requested range not satisfiable')) {
        console.log(`[Queue] Retrying download without range requests: ${id}`)
        // Could implement retry logic here
      }
    })

    ytDlpProcess.on('close', (code) => {
      console.log(`[Queue] Download completed: ${id} (exit code: ${code})`)
      
      if (code === 0) {
        downloadInfo.status = 'completed'
        downloadInfo.progress = 100
        downloadInfo.eta = '00:00'
        downloadInfo.speed = '0 MB/s'
      } else {
        downloadInfo.status = 'failed'
        downloadInfo.progress = 0
        downloadInfo.eta = '--:--'
        downloadInfo.speed = '0 MB/s'
      }
      
      // Broadcast final status
      broadcastProgress({
        id,
        status: downloadInfo.status,
        progress: downloadInfo.progress,
        downloadedSize: downloadInfo.downloadedSize,
        totalSize: downloadInfo.totalSize,
        speed: downloadInfo.speed,
        eta: downloadInfo.eta,
        timestamp: Date.now()
      })
      
      // Clean up immediately for failed downloads, delay for completed
      const cleanupDelay = code === 0 ? 30000 : 5000 // 30s for success, 5s for failure
      setTimeout(() => {
        activeDownloads.delete(id)
        console.log(`[Queue] Cleaned up download: ${id}`)
      }, cleanupDelay)
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

// Export for use in SSE endpoint  
export { activeDownloads, sseClients }