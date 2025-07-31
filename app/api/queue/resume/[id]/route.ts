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

    console.log(`[Queue] Resuming download: ${id}`)

    // In a real implementation, you would:
    // 1. Send SIGCONT to the paused yt-dlp process
    // 2. Or restart the download from where it left off
    // 3. Update the download status

    // For now, we'll simulate resuming by broadcasting the status change
    broadcastProgress({
      id,
      status: 'downloading',
      progress: 50, // In real implementation, get actual progress
      downloadedSize: '50 MB',
      totalSize: '100 MB',
      speed: '2.5 MB/s',
      eta: '00:20',
      timestamp: Date.now()
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Download resumed' 
    })

  } catch (error) {
    console.error('[Queue] Resume download error:', error)
    return NextResponse.json({ 
      error: 'Failed to resume download' 
    }, { status: 500 })
  }
}