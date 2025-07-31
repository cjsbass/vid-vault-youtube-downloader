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
    
    // Get all available formats with file sizes
    const ytDlpProcess = spawn('yt-dlp', [
      '--list-formats',
      '--print', '%(format_id)s|%(height)s|%(filesize)s|%(filesize_approx)s',
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
          reject(new Error(`yt-dlp failed: ${error}`))
        } else {
          resolve()
        }
      })
    })

    // Parse the output to extract file sizes for different qualities
    const lines = output.trim().split('\n')
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

    // Process each line to find video formats with file sizes
    for (const line of lines) {
      if (line.includes('|')) {
        const parts = line.split('|')
        if (parts.length >= 4) {
          const formatId = parts[0].trim()
          const height = parseInt(parts[1].trim())
          const filesize = parseInt(parts[2].trim()) || parseInt(parts[3].trim()) || 0
          
          // Map height to quality labels
          if (height && filesize > 0) {
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
      }
    }

    // If we couldn't get specific sizes, provide fallbacks
    if (!sizes["1080"]) sizes["1080"] = "~150-250 MB"
    if (!sizes["720"]) sizes["720"] = "~80-120 MB"
    if (!sizes["480"]) sizes["480"] = "~40-60 MB" 
    if (!sizes["360"]) sizes["360"] = "~20-30 MB"

    console.log(`Video ${videoId} file sizes:`, sizes)

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