import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('videoId')
  const quality = searchParams.get('quality')

  if (!videoId || !quality) {
    return NextResponse.json({ error: 'Missing videoId or quality parameter' }, { status: 400 })
  }

  try {
    // Construct the YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    
    // More flexible quality mapping with fallbacks
    const getFormatSelector = (quality: string): string[] => {
      switch(quality) {
        case '1080':
          return [
            'best[height<=1080][ext=mp4]',
            'best[height<=1080]',
            'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
            'best[height<=720]',
            'best'
          ]
        case '720':
          return [
            'best[height<=720][ext=mp4]', 
            'best[height<=720]',
            'bestvideo[height<=720]+bestaudio/best[height<=720]',
            'best[height<=480]',
            'best'
          ]
        case '480':
          return [
            'best[height<=480][ext=mp4]',
            'best[height<=480]', 
            'bestvideo[height<=480]+bestaudio/best[height<=480]',
            'best[height<=360]',
            'best'
          ]
        case '360':
          return [
            'best[height<=360][ext=mp4]',
            'best[height<=360]',
            'bestvideo[height<=360]+bestaudio/best[height<=360]',
            'worst',
            'best'
          ]
        default:
          return ['best']
      }
    }

    const formatSelectors = getFormatSelector(quality)

    // Try format selectors in order until one works
    let successfulFormat = 'best'
    let infoOutput = ''
    let infoError = ''
    
    for (const formatSelector of formatSelectors) {
      console.log(`[Download] Trying format: ${formatSelector}`)
      
      const infoProcess = spawn('yt-dlp', [
        '--print', 'filename',
        '--print', 'filesize', 
        '--format', formatSelector,
        '--output', '%(title)s.%(ext)s',
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        '--extractor-retries', '2',
        '--fragment-retries', '2',
        '--retry-sleep', '1',
        '--no-warnings',
        youtubeUrl
      ])

      infoOutput = ''
      infoError = ''

      infoProcess.stdout.on('data', (data) => {
        infoOutput += data.toString()
      })

      infoProcess.stderr.on('data', (data) => {
        infoError += data.toString()
      })

      try {
        await new Promise<void>((resolve, reject) => {
          infoProcess.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`yt-dlp info failed: ${infoError}`))
            } else {
              resolve()
            }
          })
        })
        
        // If we get here, this format worked
        successfulFormat = formatSelector
        console.log(`[Download] Successfully found format: ${formatSelector}`)
        break
        
      } catch (error) {
        console.log(`[Download] Format ${formatSelector} failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        // Continue to next format
        continue
      }
    }
    
    if (!infoOutput) {
      throw new Error(`All format selectors failed for quality ${quality}`)
    }



    const infoLines = infoOutput.trim().split('\n')
    const filename = infoLines[0]
    const filesize = infoLines[1] || 'NA'
    
    console.log(`Download info - Filename: ${filename}, Filesize: ${filesize}`)
    
    const sanitizedFilename = filename.replace(/[^\w\s.-]/g, '_').trim()

    // Stream the video directly to the user using the successful format
    console.log(`[Download] Starting download with format: ${successfulFormat}`)
    const downloadProcess = spawn('yt-dlp', [
      '--format', successfulFormat,
      '--output', '-', // Output to stdout
      '--no-check-certificate',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      '--extractor-retries', '2',
      '--fragment-retries', '2',
      '--retry-sleep', '1',
      '--no-warnings',
      '--http-chunk-size', '1M',
      '--buffer-size', '16K',
      youtubeUrl
    ])

    // Convert process stdout to web stream
    const readable = new ReadableStream({
      start(controller) {
        downloadProcess.stdout.on('data', (chunk) => {
          controller.enqueue(chunk)
        })

        downloadProcess.stdout.on('end', () => {
          controller.close()
        })

        downloadProcess.stderr.on('data', (data) => {
          // Don't log progress - it's expected
          const output = data.toString()
          if (!output.includes('[download]') && !output.includes('%')) {
            console.error('yt-dlp stderr:', output)
          }
        })

        downloadProcess.on('error', (error) => {
          console.error('yt-dlp process error:', error)
          controller.error(error)
        })

        downloadProcess.on('close', (code) => {
          if (code !== 0) {
            controller.error(new Error(`yt-dlp process exited with code ${code}`))
          }
        })
      },
      cancel() {
        downloadProcess.kill()
      }
    })

    // Prepare headers with resume capability
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes', // Enable resume functionality
      'X-Accel-Buffering': 'no', // Better streaming for download managers
    }

    // Add Content-Length if we have a valid file size (enables progress bar and resume)
    if (filesize !== 'NA' && !isNaN(parseInt(filesize))) {
      headers['Content-Length'] = filesize
    } else {
      headers['Transfer-Encoding'] = 'chunked'
    }

    // Return the stream with download headers
    return new Response(readable, { headers })

  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ 
      error: 'Failed to download video', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}