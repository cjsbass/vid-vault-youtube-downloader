import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function GET(request: NextRequest) {
  try {
    // Default download path (in production, this could be configurable)
    const downloadPath = '/tmp/downloads'
    
    // Create directory if it doesn't exist
    try {
      await execAsync(`mkdir -p ${downloadPath}`)
    } catch (error) {
      console.warn('[Downloads] Could not create downloads directory:', error)
    }

    // Return information about the downloads folder
    return NextResponse.json({ 
      success: true,
      path: downloadPath,
      message: 'Downloads are stored in /tmp/downloads on the server. In a production environment, this would be a user-accessible location.',
      instructions: {
        local: 'When running locally, files are downloaded to your system\'s default download location.',
        server: 'On Railway, downloaded files are temporarily stored on the server. You would typically implement file serving or cloud storage integration.'
      }
    })

  } catch (error) {
    console.error('[Downloads] Folder access error:', error)
    return NextResponse.json({ 
      error: 'Failed to access downloads folder' 
    }, { status: 500 })
  }
}