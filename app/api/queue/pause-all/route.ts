import { NextRequest, NextResponse } from 'next/server'
import { broadcastProgress } from '../progress/route'

export async function POST(request: NextRequest) {
  try {
    console.log(`[Queue] Pausing all downloads`)

    // In a real implementation, you would:
    // 1. Get list of all active downloads
    // 2. Send SIGSTOP to all yt-dlp processes
    // 3. Update their statuses

    // For now, we'll simulate by broadcasting a pause-all event
    broadcastProgress({
      type: 'pause-all',
      timestamp: Date.now()
    })

    return NextResponse.json({ 
      success: true, 
      message: 'All downloads paused' 
    })

  } catch (error) {
    console.error('[Queue] Pause all downloads error:', error)
    return NextResponse.json({ 
      error: 'Failed to pause all downloads' 
    }, { status: 500 })
  }
}