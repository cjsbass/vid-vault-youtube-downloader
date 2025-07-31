import { NextRequest, NextResponse } from 'next/server'

// Import the activeDownloads map
import { activeDownloads } from '../start/route'

export async function POST(request: NextRequest) {
  try {
    console.log('[Queue] Cleaning up all downloads')

    // Clear all active downloads
    const clearedCount = activeDownloads.size
    activeDownloads.clear()

    return NextResponse.json({ 
      success: true, 
      message: `Cleaned up ${clearedCount} downloads` 
    })

  } catch (error) {
    console.error('[Queue] Cleanup error:', error)
    return NextResponse.json({ 
      error: 'Failed to cleanup downloads' 
    }, { status: 500 })
  }
}