import { useState, useCallback, useEffect } from 'react'

export interface QueueItem {
  id: string
  videoId: string
  title: string
  thumbnail: string
  quality: string
  size: string
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'paused'
  progress: number
  downloadedSize: string
  speed: string
  eta: string
  addedAt: number
  startedAt?: number
  completedAt?: number
}

interface UseDownloadQueueReturn {
  queue: QueueItem[]
  addToQueue: (item: Omit<QueueItem, 'id' | 'status' | 'progress' | 'downloadedSize' | 'speed' | 'eta' | 'addedAt'>) => void
  removeFromQueue: (id: string) => void
  pauseDownload: (id: string) => void
  resumeDownload: (id: string) => void
  cancelDownload: (id: string) => void
  clearQueue: () => void
  pauseAll: () => void
  resumeAll: () => void
  activeDownloads: number
  totalProgress: number
}

export const useDownloadQueue = (): UseDownloadQueueReturn => {
  const [queue, setQueue] = useState<QueueItem[]>([])

  // Add item to queue
  const addToQueue = useCallback((item: Omit<QueueItem, 'id' | 'status' | 'progress' | 'downloadedSize' | 'speed' | 'eta' | 'addedAt'>) => {
    const newItem: QueueItem = {
      ...item,
      id: `${item.videoId}_${item.quality}_${Date.now()}`,
      status: 'pending',
      progress: 0,
      downloadedSize: '0 MB',
      speed: '0 MB/s',
      eta: '--:--',
      addedAt: Date.now()
    }
    
    setQueue(prev => [...prev, newItem])
    
    // Start download immediately if it's the first in queue
    setTimeout(() => startNextDownload(), 100)
  }, [])

  // Remove item from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id))
  }, [])

  // Pause download
  const pauseDownload = useCallback((id: string) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'paused' as const } : item
    ))
    // Call pause API
    fetch(`/api/queue/pause/${id}`, { method: 'POST' })
  }, [])

  // Resume download
  const resumeDownload = useCallback((id: string) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'downloading' as const } : item
    ))
    // Call resume API
    fetch(`/api/queue/resume/${id}`, { method: 'POST' })
  }, [])

  // Cancel download
  const cancelDownload = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id))
    // Call cancel API
    fetch(`/api/queue/cancel/${id}`, { method: 'POST' })
  }, [])

  // Clear completed downloads
  const clearQueue = useCallback(() => {
    setQueue(prev => prev.filter(item => item.status === 'downloading' || item.status === 'pending'))
  }, [])

  // Pause all downloads
  const pauseAll = useCallback(() => {
    setQueue(prev => prev.map(item => 
      item.status === 'downloading' ? { ...item, status: 'paused' as const } : item
    ))
    fetch('/api/queue/pause-all', { method: 'POST' })
  }, [])

  // Resume all downloads
  const resumeAll = useCallback(() => {
    setQueue(prev => prev.map(item => 
      item.status === 'paused' ? { ...item, status: 'downloading' as const } : item
    ))
    fetch('/api/queue/resume-all', { method: 'POST' })
  }, [])

  // Start next download in queue
  const startNextDownload = useCallback(() => {
    setQueue(prev => {
      const activeDownloads = prev.filter(item => item.status === 'downloading').length
      if (activeDownloads >= 1) return prev // Limit to 1 concurrent download for now
      
      const nextPending = prev.find(item => item.status === 'pending')
      if (!nextPending) return prev
      
      // Start the download
      fetch('/api/queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: nextPending.id,
          videoId: nextPending.videoId,
          quality: nextPending.quality
        })
      })
      
      return prev.map(item => 
        item.id === nextPending.id 
          ? { ...item, status: 'downloading' as const, startedAt: Date.now() } 
          : item
      )
    })
  }, [])

  // Calculate stats
  const activeDownloads = queue.filter(item => item.status === 'downloading').length
  const totalProgress = queue.length > 0 
    ? queue.reduce((sum, item) => sum + item.progress, 0) / queue.length 
    : 0

  // Set up Server-Sent Events for real-time progress updates
  useEffect(() => {
    const eventSource = new EventSource('/api/queue/progress')
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setQueue(prev => prev.map(item => 
          item.id === data.id 
            ? { 
                ...item, 
                progress: data.progress,
                downloadedSize: data.downloadedSize,
                speed: data.speed,
                eta: data.eta,
                status: data.status,
                ...(data.status === 'completed' && { completedAt: Date.now() })
              }
            : item
        ))
        
        // Start next download when current completes
        if (data.status === 'completed') {
          setTimeout(startNextDownload, 500)
        }
      } catch (e) {
        console.error('Error parsing SSE data:', e)
      }
    }

    eventSource.onerror = () => {
      console.warn('SSE connection lost, will retry...')
    }

    return () => {
      eventSource.close()
    }
  }, [startNextDownload])

  return {
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
  }
}