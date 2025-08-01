import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

// Helper function to format bytes into human readable format
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return "Unknown size"
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB'] 
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
  return `${size} ${sizes[i]}`
}

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
    
    // Try a simpler approach - get format info for specific qualities directly
    const getFormatInfo = async (quality: string): Promise<{ size: string; available: boolean }> => {
      const formatSelectors = {
        '1080': ['best[height<=1080]', 'best[height<=720]', 'best'],
        '720': ['best[height<=720]', 'best[height<=480]', 'best'],  
        '480': ['best[height<=480]', 'best[height<=360]', 'best'],
        '360': ['best[height<=360]', 'worst', 'best']
      }
      
      for (const format of formatSelectors[quality as keyof typeof formatSelectors] || ['best']) {
        try {
          console.log(`[Railway Debug] Testing ${quality}p with format: ${format}`)
          
          const process = spawn('yt-dlp', [
            '--print', 'filesize',
            '--format', format,
            '--no-check-certificate',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '--extractor-retries', '1',
            '--no-warnings',
            '--quiet',
            youtubeUrl
          ])
          
          let output = ''
          let error = ''
          
          process.stdout.on('data', (data) => {
            output += data.toString()
          })
          
          process.stderr.on('data', (data) => {
            error += data.toString()
          })
          
          await new Promise<void>((resolve, reject) => {
            process.on('close', (code) => {
              if (code !== 0) {
                reject(new Error(`Failed: ${error}`))
              } else {
                resolve()
              }
            })
          })
          
          const filesize = parseInt(output.trim())
          if (filesize && filesize > 0) {
            const sizeStr = formatBytes(filesize)
            console.log(`[Railway Debug] Found ${quality}p: ${sizeStr} (${filesize} bytes)`)
            return { size: sizeStr, available: true }
          }
          
        } catch (err) {
          console.log(`[Railway Debug] ${quality}p format ${format} failed:`, err instanceof Error ? err.message : 'Unknown error')
          continue
        }
      }
      
      return { size: '', available: false }
    }
    
    console.log(`[Railway Debug] Starting direct format size checks...`)
    
    // Try to get exact sizes for each quality
    const [info1080, info720, info480, info360] = await Promise.allSettled([
      getFormatInfo('1080'),
      getFormatInfo('720'), 
      getFormatInfo('480'),
      getFormatInfo('360')
    ])
    
    const sizes: { [key: string]: string } = {}
    
    // Process results
    if (info1080.status === 'fulfilled' && info1080.value.available) {
      sizes['1080'] = info1080.value.size
    }
    if (info720.status === 'fulfilled' && info720.value.available) {
      sizes['720'] = info720.value.size  
    }
    if (info480.status === 'fulfilled' && info480.value.available) {
      sizes['480'] = info480.value.size
    }
    if (info360.status === 'fulfilled' && info360.value.available) {
      sizes['360'] = info360.value.size
    }
    
    console.log(`[Railway Debug] Direct method results:`, sizes)
    
    // If direct method got some results, use them
    if (Object.keys(sizes).length > 0) {
      // Fill in fallbacks for missing qualities
      if (!sizes["1080"]) sizes["1080"] = "~150-250 MB"
      if (!sizes["720"]) sizes["720"] = "~80-120 MB"
      if (!sizes["480"]) sizes["480"] = "~40-60 MB" 
      if (!sizes["360"]) sizes["360"] = "~20-30 MB"
      
      console.log(`[Railway Debug] Final direct method sizes:`, sizes)
      return NextResponse.json({ sizes })
    }
    
    console.log(`[Railway Debug] Direct method failed, falling back to JSON extraction...`)
    
    // Fallback to JSON extraction if direct method fails
    const ytDlpStrategies = [
      [
        '--dump-json',
        '--no-download', 
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--extractor-retries', '1',
        '--no-warnings',
        '--quiet',
        youtubeUrl
      ],
      [
        '--dump-json',
        '--no-download',
        '--format', 'best',
        '--no-check-certificate', 
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--no-warnings',
        '--ignore-errors',
        '--quiet',
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



    console.log(`[Railway Debug] JSON extraction output length: ${output.length}`)
    
    // Parse JSON output  
    const videoData = JSON.parse(output)
    const formats = videoData.formats || []
    
    console.log(`[Railway Debug] Found ${formats.length} formats in JSON`)
    

    
    const jsonSizes: { [key: string]: string } = {}

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
      jsonSizes[quality] = formatBytes(format.filesize)
      console.log(`[Railway Debug] JSON method best ${quality}p: ${format.format_id} (${formatBytes(format.filesize)}) - ${format.hasAudio ? 'Video+Audio' : 'Video only'} - ${format.vcodec}/${format.acodec}`)
    }

    console.log(`[Railway Debug] JSON extracted sizes:`, jsonSizes)
    console.log(`[Railway Debug] Found ${Object.keys(bestFormats).length} exact quality matches out of ${formats.length} total formats`)

    // Use JSON results if we got any, otherwise use fallbacks
    const finalSizes: { [key: string]: string } = {}
    finalSizes["1080"] = jsonSizes["1080"] || "~150-250 MB"
    finalSizes["720"] = jsonSizes["720"] || "~80-120 MB"
    finalSizes["480"] = jsonSizes["480"] || "~40-60 MB" 
    finalSizes["360"] = jsonSizes["360"] || "~20-30 MB"

    console.log(`[Railway Debug] JSON method final sizes:`, finalSizes)

    return NextResponse.json({ sizes: finalSizes })

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