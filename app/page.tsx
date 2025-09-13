"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Download, Youtube, Loader2, Share2, Plus } from "lucide-react"
import Image from "next/image"
import { Inter } from "next/font/google"
import { cn } from "@/lib/utils"
import { MatrixRain } from "@/components/matrix-rain"
import { useDownloadQueue } from "@/hooks/useDownloadQueue"
import { DownloadQueue } from "@/components/download-queue"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

// YouTube video data interface
interface VideoData {
  id: string
  title: string
  thumbnail: string
  duration: string
  resolutions: {
    quality: string
    size: string
    url: string
    torrentUrl: string
    isExact?: boolean
  }[]
  error?: string | null
}

// Utility functions
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function fetchYouTubeVideoData(videoId: string): Promise<VideoData> {
  // Get video info from YouTube oEmbed API (no API key required)
  const oembedResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
  const oembedData = await oembedResponse.json()
  
  // YouTube thumbnail URLs (high quality)
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  
  // Get real file sizes from our API
  const sizesResponse = await fetch(`/api/video-info?videoId=${videoId}`)
  let realSizes: { [key: string]: string } = {}
  let apiError: string | null = null
  
  if (sizesResponse.ok) {
    const sizesData = await sizesResponse.json()
    realSizes = sizesData.sizes || {}
    console.log('[Debug] API Response:', sizesData)
    console.log('[Debug] Real sizes:', realSizes)
  } else {
    console.error('[Debug] API Error:', sizesResponse.status, sizesResponse.statusText)
    if (sizesResponse.status === 403) {
      const errorData = await sizesResponse.json()
      apiError = errorData.message || 'YouTube is blocking requests from this server'
    }
  }

    // Available download qualities with real sizes
  const allQualities = [
    { 
      quality: "1080p", 
      size: realSizes["1080"] || "~150-250 MB", 
      url: `/api/download?videoId=${videoId}&quality=1080`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_1080p.mp4&tr=udp://tracker.openbittorrent.com:80`,
      available: !!realSizes["1080"], // Available if we have any size info
      isExact: realSizes["1080"] ? !realSizes["1080"].includes("~") : false // Track if size is exact
    },
    { 
      quality: "720p", 
      size: realSizes["720"] || "~80-120 MB", 
      url: `/api/download?videoId=${videoId}&quality=720`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_720p.mp4&tr=udp://tracker.openbittorrent.com:80`,
      available: !!realSizes["720"], // Available if we have any size info
      isExact: realSizes["720"] ? !realSizes["720"].includes("~") : false // Track if size is exact
    },
    { 
      quality: "480p", 
      size: realSizes["480"] || "~40-60 MB", 
      url: `/api/download?videoId=${videoId}&quality=480`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_480p.mp4&tr=udp://tracker.openbittorrent.com:80`,
      available: !!realSizes["480"], // Available if we have any size info
      isExact: realSizes["480"] ? !realSizes["480"].includes("~") : false // Track if size is exact
    },
    { 
      quality: "360p", 
      size: realSizes["360"] || "~20-30 MB",
      url: `/api/download?videoId=${videoId}&quality=360`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_360p.mp4&tr=udp://tracker.openbittorrent.com:80`,
      available: !!realSizes["360"], // Available if we have any size info
      isExact: realSizes["360"] ? !realSizes["360"].includes("~") : false // Track if size is exact
    },
  ]
  
  // Show qualities that have size information (exact or approximate)
  console.log('[Debug] All qualities before filtering:', allQualities)
  const resolutions = allQualities.filter(quality => quality.available)
  console.log('[Debug] Available resolutions after filtering:', resolutions)

  return {
    id: videoId,
    title: oembedData.title,
    thumbnail,
    duration: "Unknown", // Would need additional API call for duration
    resolutions: resolutions.map(res => ({
      quality: res.quality,
      size: res.size,
      url: res.url,
      torrentUrl: res.torrentUrl,
      isExact: res.isExact
    })),
    error: apiError
  }
}

const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/

export default function YoutubeDownloaderPage() {
  const [url, setUrl] = useState("")
  const [videoData, setVideoData] = useState<VideoData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingQuality, setDownloadingQuality] = useState<string | null>(null)
  const [fetchingSizes, setFetchingSizes] = useState(false)

  // Download Queue Management
  const {
    queue,
    addToQueue,
    removeFromQueue,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    clearQueue,
    pauseAll,
    resumeAll,
    activeDownloads,
    totalProgress
  } = useDownloadQueue()

  const analyzeVideo = useCallback(async (videoUrl: string) => {
    if (!videoUrl.trim()) {
      setError(">>> ERROR: No URL provided. System requires input.")
      return
    }

    if (!youtubeRegex.test(videoUrl)) {
      setError(">>> ERROR: Invalid YouTube URL signature detected.")
      return
    }

    const videoId = extractVideoId(videoUrl)
    if (!videoId) {
      setError(">>> ERROR: Could not extract video ID from URL.")
      return
    }

    setIsLoading(true)
    setError(null)
    setVideoData(null)
    setFetchingSizes(true)

    try {
      const videoData = await fetchYouTubeVideoData(videoId)
      if (videoData.error) {
        setError(`>>> ERROR: ${videoData.error}`)
        setVideoData(null)
      } else {
        setVideoData(videoData)
      }
    } catch (error) {
      console.error("Error fetching video data:", error)
      setError(">>> ERROR: Failed to fetch video information. Network or API error.")
    } finally {
      setIsLoading(false)
      setFetchingSizes(false)
    }
  }, [])

  // Auto-analyze when a valid YouTube URL is detected
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (url.trim() && youtubeRegex.test(url)) {
        analyzeVideo(url)
      } else if (url.trim() && !youtubeRegex.test(url)) {
        setError(">>> ERROR: Invalid YouTube URL signature detected.")
        setVideoData(null)
      } else if (!url.trim()) {
        setError(null)
        setVideoData(null)
      }
    }, 800) // Debounce for 800ms

    return () => clearTimeout(timeoutId)
  }, [url, analyzeVideo])

  const handleFetchVideo = async (e: React.FormEvent) => {
    e.preventDefault()
    analyzeVideo(url)
  }

  const handleDownload = (quality: string) => {
    setDownloadingQuality(quality)
    setError(null)
    
    // Reset loading state after a few seconds (download should have started)
    setTimeout(() => {
      setDownloadingQuality(null)
    }, 3000)
  }

  const handleAddToQueue = (resolution: { quality: string; size: string }) => {
    if (!videoData) return
    
    addToQueue({
      videoId: videoData.id,
      title: videoData.title,
      thumbnail: videoData.thumbnail,
      quality: resolution.quality,
      size: resolution.size
    })
    
    setError(null)
  }

  return (
    <div className={cn("min-h-screen w-full bg-black text-white overflow-hidden", inter.variable)}>
      <MatrixRain />

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1
              className="font-inter text-5xl sm:text-6xl md:text-7xl text-green-400 tracking-widest glitch font-bold"
              data-text="CorgnelliTube"
            >
              CorgnelliTube
            </h1>
            <p className="text-green-500 mt-2 text-lg font-inter">&gt;&gt;&gt; Your Gateway to the Media Mainframe</p>
          </div>

          <Card className="bg-black/60 border-green-500/30 backdrop-blur-sm shadow-[0_0_20px_rgba(50,205,50,0.3)] rounded-none">
            <CardHeader>
              <CardTitle className="font-inter text-3xl text-green-400 flex items-center gap-2">
                <Youtube className="w-8 h-8" />
                &gt; Auto-Scan Download Sequence
              </CardTitle>
              <CardDescription className="text-green-700 font-inter">
                &gt; Paste YouTube URL - Analysis initiates automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFetchVideo} className="flex flex-col sm:flex-row gap-4">
                <Input
                  type="url"
                  placeholder="Paste YouTube URL for auto-analysis..."
                  className="flex-grow bg-gray-900/80 border-green-500/50 text-green-300 placeholder:text-green-800 focus:ring-green-400 focus:ring-offset-black rounded-none font-inter"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button
                  type="submit"
                  disabled={isLoading || !url.trim()}
                  className="bg-green-600/80 hover:bg-green-500/80 text-black font-bold transition-all duration-300 shadow-[0_0_15px_rgba(74,222,128,0.6)] hover:shadow-[0_0_25px_rgba(74,222,128,1)] rounded-none font-inter tracking-wider disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      SCANNING...
                    </>
                  ) : (
                    "RE-SCAN"
                  )}
                </Button>
              </form>
              {error && <p className="text-red-500 mt-4 text-center font-inter">{error}</p>}
            </CardContent>
          </Card>

          {videoData && (
            <Card className="mt-8 bg-black/60 border-green-500/30 backdrop-blur-sm shadow-[0_0_20px_rgba(50,205,50,0.3)] rounded-none animate-fade-in">
              <CardHeader>
                <div className="aspect-video overflow-hidden border-2 border-green-500/50">
                  <Image
                    src={videoData.thumbnail}
                    alt={videoData.title}
                    width={1280}
                    height={720}
                    className="w-full h-full object-cover"
                    unoptimized={true}
                    onError={(e) => {
                      // Fallback to standard resolution thumbnail if maxres fails
                      e.currentTarget.src = `https://img.youtube.com/vi/${videoData.id}/hqdefault.jpg`
                    }}
                  />
                </div>
                <CardTitle className="font-inter text-2xl text-green-400 pt-4">&gt; {videoData.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {videoData.resolutions.map((res) => (
                    <div
                      key={res.quality}
                      className="flex items-center justify-between p-3 bg-gray-900/70 rounded-none border border-green-900"
                    >
                      <div className="flex items-center gap-4 font-inter">
                        <span className="text-lg text-green-400">{res.quality}</span>
                        <span className="text-sm text-green-600">
                          {fetchingSizes && res.size.includes('~') ? (
                            <>
                              <Loader2 className="inline mr-1 h-3 w-3 animate-spin" />
                              Getting real size...
                            </>
                          ) : (
                            `[${res.size}]`
                          )}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-400 hover:bg-blue-400/10 hover:text-blue-300 rounded-none font-inter border border-blue-500/30"
                          onClick={() => handleAddToQueue(res)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          ADD TO QUEUE
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-400 hover:bg-green-400/10 hover:text-green-300 rounded-none font-inter"
                          onClick={() => {
                            handleDownload(res.quality)
                            // Trigger download by navigating to our API endpoint
                            window.location.href = `/api/download?videoId=${videoData.id}&quality=${res.quality.replace('p', '')}`
                          }}
                          disabled={downloadingQuality === res.quality}
                        >
                          {downloadingQuality === res.quality ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              PREPARING...
                            </>
                          ) : (
                            <>
                              <Download className="mr-2 h-4 w-4" />
                              DOWNLOAD
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="text-cyan-400 hover:bg-cyan-400/10 hover:text-cyan-300 rounded-none font-inter border border-cyan-500/30"
                        >
                          <a href={res.torrentUrl} title="Download via torrent (opens in uTorrent/BitTorrent)">
                            <Share2 className="mr-2 h-4 w-4" />
                            TORRENT
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Download Queue */}
          <DownloadQueue
            queue={queue}
            activeDownloads={activeDownloads}
            totalProgress={totalProgress}
            onPause={pauseDownload}
            onResume={resumeDownload}
            onCancel={cancelDownload}
            onClear={clearQueue}
            onPauseAll={pauseAll}
            onResumeAll={resumeAll}
          />
        </div>
      </main>
    </div>
  )
}
