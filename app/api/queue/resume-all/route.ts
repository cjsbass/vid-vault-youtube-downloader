import { NextRequest, NextResponse } from 'next/server'
import { broadcastProgress } from '../progress/route'

export async function POST(request: NextRequest) {
  try {
    console.log(`[Queue] Resuming all downloads`)

    // In a real implementation, you would:
    // 1. Get list of all paused downloads
    // 2. Send SIGCONT to all paused yt-dlp processes
    // 3. Update their statuses

    // For now, we'll simulate by broadcasting a resume-all event
    broadcastProgress({
      type: 'resume-all',
      timestamp: Date.now()
    })

    return NextResponse.json({ 
      success: true, 
      message: 'All downloads resumed' 
    })

  } catch (error) {
    console.error('[Queue] Resume all downloads error:', error)
    return NextResponse.json({ 
      error: 'Failed to resume all downloads' 
    }, { status: 500 })
  }
}