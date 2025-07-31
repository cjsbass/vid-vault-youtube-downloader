import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('videoId')

  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId parameter' }, { status: 400 })
  }

  try {
    // Construct the YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    
    console.log(`[Railway Debug] Getting file sizes for video: ${videoId}`)
    
    // Get JSON metadata with format information
    const ytDlpProcess = spawn('yt-dlp', [
      '--dump-json',
      '--no-download',
      youtubeUrl
    ])

    let output = ''
    let error = ''

    ytDlpProcess.stdout.on('data', (data) => {
      output += data.toString()
    })

    ytDlpProcess.stderr.on('data', (data) => {
      error += data.toString()
    })

    await new Promise<void>((resolve, reject) => {
      ytDlpProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`[Railway Debug] yt-dlp failed with code ${code}:`, error)
          reject(new Error(`yt-dlp failed: ${error}`))
        } else {
          resolve()
        }
      })
    })

    console.log(`[Railway Debug] yt-dlp output length: ${output.length}`)
    
    // Parse JSON output
    const videoData = JSON.parse(output)
    const formats = videoData.formats || []
    
    console.log(`[Railway Debug] Found ${formats.length} formats`)
    
    const sizes: { [key: string]: string } = {}
    
    // Helper function to format bytes into human readable format
    const formatBytes = (bytes: number): string => {
      if (!bytes || bytes === 0) return "Unknown size"
      
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      
      const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
      return `${size} ${sizes[i]}`
    }

    // Process formats to find the best file sizes for each quality
    for (const format of formats) {
      const height = format.height
      const filesize = format.filesize || format.filesize_approx || 0
      const vcodec = format.vcodec
      
      // Only consider video formats (not audio-only)
      if (height && filesize > 0 && vcodec && vcodec !== 'none') {
        console.log(`[Railway Debug] Format: ${format.format_id}, Height: ${height}, Size: ${filesize}`)
        
        if (height >= 1080 && !sizes["1080"]) {
          sizes["1080"] = formatBytes(filesize)
        } else if (height >= 720 && height < 1080 && !sizes["720"]) {
          sizes["720"] = formatBytes(filesize)
        } else if (height >= 480 && height < 720 && !sizes["480"]) {
          sizes["480"] = formatBytes(filesize)
        } else if (height >= 360 && height < 480 && !sizes["360"]) {
          sizes["360"] = formatBytes(filesize)
        }
      }
    }

    console.log(`[Railway Debug] Extracted sizes:`, sizes)

    // If we couldn't get specific sizes, provide fallbacks
    if (!sizes["1080"]) sizes["1080"] = "~150-250 MB"
    if (!sizes["720"]) sizes["720"] = "~80-120 MB"
    if (!sizes["480"]) sizes["480"] = "~40-60 MB" 
    if (!sizes["360"]) sizes["360"] = "~20-30 MB"

    console.log(`[Railway Debug] Final sizes:`, sizes)

    return NextResponse.json({ sizes })

  } catch (error) {
    console.error('Video info error:', error)
    
    // Return fallback sizes if yt-dlp fails
    return NextResponse.json({ 
      sizes: {
        "1080": "~150-250 MB",
        "720": "~80-120 MB", 
        "480": "~40-60 MB",
        "360": "~20-30 MB"
      }
    })
  }
}