"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Download, Youtube, Loader2, Share2 } from "lucide-react"
import Image from "next/image"
import { VT323 } from "next/font/google"
import { cn } from "@/lib/utils"
import { MatrixRain } from "@/components/matrix-rain"

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt323",
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
  }[]
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
  
  // Available download qualities
  const resolutions = [
    { 
      quality: "1080p", 
      size: "~150-250 MB", 
      url: `/api/download?videoId=${videoId}&quality=1080`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_1080p.mp4&tr=udp://tracker.openbittorrent.com:80`
    },
    { 
      quality: "720p", 
      size: "~80-120 MB", 
      url: `/api/download?videoId=${videoId}&quality=720`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_720p.mp4&tr=udp://tracker.openbittorrent.com:80`
    },
    { 
      quality: "480p", 
      size: "~40-60 MB", 
      url: `/api/download?videoId=${videoId}&quality=480`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_480p.mp4&tr=udp://tracker.openbittorrent.com:80`
    },
    { 
      quality: "360p", 
      size: "~20-30 MB", 
      url: `/api/download?videoId=${videoId}&quality=360`,
      torrentUrl: `magnet:?xt=urn:btih:${videoId}&dn=${encodeURIComponent(oembedData.title)}_360p.mp4&tr=udp://tracker.openbittorrent.com:80`
    },
  ]

  return {
    id: videoId,
    title: oembedData.title,
    thumbnail,
    duration: "Unknown", // Would need additional API call for duration
    resolutions
  }
}

const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/

export default function YoutubeDownloaderPage() {
  const [url, setUrl] = useState("")
  const [videoData, setVideoData] = useState<VideoData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingQuality, setDownloadingQuality] = useState<string | null>(null)

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

    try {
      const videoData = await fetchYouTubeVideoData(videoId)
      setVideoData(videoData)
    } catch (error) {
      console.error("Error fetching video data:", error)
      setError(">>> ERROR: Failed to fetch video information. Network or API error.")
    } finally {
      setIsLoading(false)
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

  return (
    <div className={cn("min-h-screen w-full bg-black text-white overflow-hidden", vt323.variable)}>
      <MatrixRain />

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1
              className="font-vt323 text-5xl sm:text-6xl md:text-7xl text-green-400 tracking-widest glitch"
              data-text="VID-VAULT"
            >
              VID-VAULT
            </h1>
            <p className="text-green-500 mt-2 text-lg font-vt323">&gt;&gt;&gt; Your Gateway to the Media Mainframe</p>
          </div>

          <Card className="bg-black/60 border-green-500/30 backdrop-blur-sm shadow-[0_0_20px_rgba(50,205,50,0.3)] rounded-none">
            <CardHeader>
              <CardTitle className="font-vt323 text-3xl text-green-400 flex items-center gap-2">
                <Youtube className="w-8 h-8" />
                &gt; Auto-Scan Download Sequence
              </CardTitle>
              <CardDescription className="text-green-700 font-vt323">
                &gt; Paste YouTube URL - Analysis initiates automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFetchVideo} className="flex flex-col sm:flex-row gap-4">
                <Input
                  type="url"
                  placeholder="Paste YouTube URL for auto-analysis..."
                  className="flex-grow bg-gray-900/80 border-green-500/50 text-green-300 placeholder:text-green-800 focus:ring-green-400 focus:ring-offset-black rounded-none font-mono"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button
                  type="submit"
                  disabled={isLoading || !url.trim()}
                  className="bg-green-600/80 hover:bg-green-500/80 text-black font-bold transition-all duration-300 shadow-[0_0_15px_rgba(74,222,128,0.6)] hover:shadow-[0_0_25px_rgba(74,222,128,1)] rounded-none font-vt323 tracking-wider disabled:opacity-50"
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
              {error && <p className="text-red-500 mt-4 text-center font-vt323">{error}</p>}
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
                <CardTitle className="font-vt323 text-2xl text-green-400 pt-4">&gt; {videoData.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {videoData.resolutions.map((res) => (
                    <div
                      key={res.quality}
                      className="flex items-center justify-between p-3 bg-gray-900/70 rounded-none border border-green-900"
                    >
                      <div className="flex items-center gap-4 font-vt323">
                        <span className="text-lg text-green-400">{res.quality}</span>
                        <span className="text-sm text-green-600">[{res.size}]</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-400 hover:bg-green-400/10 hover:text-green-300 rounded-none font-vt323"
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
                          className="text-cyan-400 hover:bg-cyan-400/10 hover:text-cyan-300 rounded-none font-vt323 border border-cyan-500/30"
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
        </div>
      </main>
    </div>
  )
}
