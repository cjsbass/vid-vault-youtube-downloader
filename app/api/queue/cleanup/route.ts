import { NextRequest, NextResponse } from 'next/server'

// Import the activeDownloads map
let activeDownloads: Map<string, any>
try {
  const startModule = require('../start/route')
  activeDownloads = startModule.activeDownloads
} catch (error) {
  console.warn('[Queue] Could not import activeDownloads map')
  activeDownloads = new Map()
}

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