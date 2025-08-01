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
    
    // Get JSON metadata with format information using robust server options
    // Try different extraction strategies for better compatibility
    const ytDlpStrategies = [
      [
        '--dump-json',
        '--no-download',
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        '--extractor-retries', '2',
        '--retry-sleep', '1',
        '--no-warnings',
        youtubeUrl
      ],
      [
        '--dump-json', 
        '--no-download',
        '--format', 'best',
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        '--extractor-retries', '1',
        '--no-warnings',
        '--ignore-errors',
        youtubeUrl
      ]
    ]
    
    let output = ''
    let error = ''
    let success = false
    
    for (const [index, strategy] of ytDlpStrategies.entries()) {
      console.log(`[Railway Debug] Trying strategy ${index + 1}/${ytDlpStrategies.length}`)
      
      const ytDlpProcess = spawn('yt-dlp', strategy)
      
      output = ''
      error = ''

      ytDlpProcess.stdout.on('data', (data) => {
        output += data.toString()
      })

      ytDlpProcess.stderr.on('data', (data) => {
        error += data.toString()
      })

      try {
        await new Promise<void>((resolve, reject) => {
          ytDlpProcess.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`yt-dlp failed with code ${code}: ${error}`))
            } else {
              resolve()
            }
          })
        })
        
        success = true
        console.log(`[Railway Debug] Strategy ${index + 1} succeeded`)
        break
        
      } catch (strategyError) {
        console.log(`[Railway Debug] Strategy ${index + 1} failed:`, strategyError instanceof Error ? strategyError.message : 'Unknown error')
        continue
      }
    }
    
    if (!success) {
      throw new Error(`All extraction strategies failed. Last error: ${error}`)
    }



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
    // Track best formats for each quality
    const bestFormats: { [key: string]: any } = {}
    
    for (const format of formats) {
      const height = format.height
      const filesize = format.filesize || format.filesize_approx || 0
      const vcodec = format.vcodec
      const ext = format.ext
      const acodec = format.acodec
      
      // Only consider video formats (not audio-only)
      if (height && filesize > 0 && vcodec && vcodec !== 'none') {
        console.log(`[Local Debug] Format: ${format.format_id}, Height: ${height}, Size: ${filesize}, Codec: ${vcodec}, Audio: ${acodec}, Ext: ${ext}`)
        
        // Determine quality category
        let quality = ""
        if (height >= 1080) quality = "1080"
        else if (height >= 720) quality = "720" 
        else if (height >= 480) quality = "480"
        else if (height >= 360) quality = "360"
        
        if (quality) {
          // Prefer formats with both video and audio codecs
          const hasAudio = acodec && acodec !== 'none'
          const currentBest = bestFormats[quality]
          
          if (!currentBest || 
              (hasAudio && !currentBest.hasAudio) || // Prefer combined formats
              (hasAudio === currentBest.hasAudio && filesize > currentBest.filesize)) { // If same audio status, prefer larger size
            bestFormats[quality] = { 
              height, 
              filesize, 
              format_id: format.format_id,
              hasAudio,
              vcodec,
              acodec,
              ext
            }
          }
        }
      }
    }
    
    // Convert best formats to readable sizes
    for (const [quality, format] of Object.entries(bestFormats)) {
      sizes[quality] = formatBytes(format.filesize)
      console.log(`[Local Debug] Best ${quality}p: ${format.format_id} (${formatBytes(format.filesize)}) - ${format.hasAudio ? 'Video+Audio' : 'Video only'} - ${format.vcodec}/${format.acodec}`)
    }

    console.log(`[Local Debug] Extracted sizes:`, sizes)
    console.log(`[Local Debug] Found ${Object.keys(bestFormats).length} exact quality matches out of ${formats.length} total formats`)

    // If we couldn't get specific sizes, provide fallbacks
    if (!sizes["1080"]) sizes["1080"] = "~150-250 MB"
    if (!sizes["720"]) sizes["720"] = "~80-120 MB"
    if (!sizes["480"]) sizes["480"] = "~40-60 MB" 
    if (!sizes["360"]) sizes["360"] = "~20-30 MB"

    console.log(`[Local Debug] Final sizes:`, sizes)

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