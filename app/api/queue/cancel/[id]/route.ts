import { NextRequest, NextResponse } from 'next/server'
import { broadcastProgress } from '../../progress/route'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'Missing download ID' }, { status: 400 })
    }

    console.log(`[Queue] Cancelling download: ${id}`)

    // In a real implementation, you would:
    // 1. Send SIGTERM/SIGKILL to the yt-dlp process
    // 2. Clean up any partial files
    // 3. Remove from active downloads

    // Broadcast cancellation status
    broadcastProgress({
      id,
      status: 'cancelled',
      progress: 0,
      downloadedSize: '0 MB',
      totalSize: '0 MB',
      speed: '0 MB/s',
      eta: '--:--',
      timestamp: Date.now()
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Download cancelled' 
    })

  } catch (error) {
    console.error('[Queue] Cancel download error:', error)
    return NextResponse.json({ 
      error: 'Failed to cancel download' 
    }, { status: 500 })
  }
}