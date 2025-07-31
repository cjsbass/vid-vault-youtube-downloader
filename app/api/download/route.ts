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
    
    // Quality mapping for yt-dlp format selection
    const qualityMap: { [key: string]: string } = {
      '1080': 'best[height<=1080]',
      '720': 'best[height<=720]',
      '480': 'best[height<=480]',
      '360': 'best[height<=360]'
    }

    const formatSelector = qualityMap[quality] || 'best'

    // Get filename and file size first
    const infoProcess = spawn('yt-dlp', [
      '--print', 'filename',
      '--print', 'filesize',
      '--format', formatSelector,
      '--output', '%(title)s.%(ext)s',
      youtubeUrl
    ])

    let infoOutput = ''
    let infoError = ''

    infoProcess.stdout.on('data', (data) => {
      infoOutput += data.toString()
    })

    infoProcess.stderr.on('data', (data) => {
      infoError += data.toString()
    })

    await new Promise<void>((resolve, reject) => {
      infoProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`yt-dlp info failed: ${infoError}`))
        } else {
          resolve()
        }
      })
    })

    const infoLines = infoOutput.trim().split('\n')
    const filename = infoLines[0]
    const filesize = infoLines[1] || 'NA'
    
    console.log(`Download info - Filename: ${filename}, Filesize: ${filesize}`)
    
    const sanitizedFilename = filename.replace(/[^\w\s.-]/g, '_').trim()

    // Stream the video directly to the user with proper download headers
    const downloadProcess = spawn('yt-dlp', [
      '--format', formatSelector,
      '--output', '-', // Output to stdout
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

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
      'Cache-Control': 'no-cache',
    }

    // Add Content-Length if we have a valid file size (enables progress bar)
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