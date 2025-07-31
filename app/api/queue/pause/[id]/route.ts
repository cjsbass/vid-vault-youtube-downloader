import { NextRequest, NextResponse } from 'next/server'
import { broadcastProgress } from '../../progress/route'

// Simple in-memory store (in production, use Redis or database)
const pausedDownloads = new Map<string, {
  videoId: string
  quality: string
  progress: number
  downloadedSize: string
  totalSize: string
}>()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'Missing download ID' }, { status: 400 })
    }

    console.log(`[Queue] Pausing download: ${id}`)

    // In a real implementation, you would:
    // 1. Send SIGSTOP to the yt-dlp process
    // 2. Store the current state
    // 3. Update the download status

    // For now, we'll simulate pausing by broadcasting the status change
    broadcastProgress({
      id,
      status: 'paused',
      progress: 50, // In real implementation, get actual progress
      downloadedSize: '50 MB',
      totalSize: '100 MB',
      speed: '0 MB/s',
      eta: '--:--',
      timestamp: Date.now()
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Download paused' 
    })

  } catch (error) {
    console.error('[Queue] Pause download error:', error)
    return NextResponse.json({ 
      error: 'Failed to pause download' 
    }, { status: 500 })
  }
}