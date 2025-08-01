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
      .catch(error => console.warn('[Queue] Error cancelling download:', error))
  }, [])

  // Clear completed and failed downloads
  const clearQueue = useCallback(() => {
    setQueue(prev => prev.filter(item => 
      item.status === 'downloading' || item.status === 'pending'
    ))
    // Also cleanup server state
    fetch('/api/queue/cleanup', { method: 'POST' })
      .catch(error => console.warn('[Queue] Error cleaning up server state:', error))
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
      .then(response => {
        if (response.status === 409) {
          console.warn(`[Queue] Download conflict for ${nextPending.id}, cleaning up and retrying`)
          // Clean up server state and retry
          fetch('/api/queue/cleanup', { method: 'POST' })
            .then(() => {
              // Retry after cleanup
              setTimeout(() => startNextDownload(), 1000)
            })
        } else if (!response.ok) {
          console.error(`[Queue] Failed to start download: ${response.status}`)
          // Mark as failed
          setQueue(prev => prev.map(item => 
            item.id === nextPending.id 
              ? { ...item, status: 'failed' as const } 
              : item
          ))
        }
      })
      .catch(error => {
        console.error('[Queue] Error starting download:', error)
        // Mark as failed
        setQueue(prev => prev.map(item => 
          item.id === nextPending.id 
            ? { ...item, status: 'failed' as const } 
            : item
        ))
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
    const connectSSE = () => {
      const eventSource = new EventSource('/api/queue/progress')
      
      eventSource.onopen = () => {
        console.log('[Queue] SSE connected')
      }
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Skip connection message
          if (data.type === 'connected') {
            console.log('[Queue] SSE connection confirmed')
            return
          }
          
          console.log('[Queue] Received progress update:', data)
          
          setQueue(prev => prev.map(item => 
            item.id === data.id 
              ? { 
                  ...item, 
                  progress: data.progress || item.progress,
                  downloadedSize: data.downloadedSize || item.downloadedSize,
                  speed: data.speed || item.speed,
                  eta: data.eta || item.eta,
                  status: data.status || item.status,
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

      eventSource.onerror = (error) => {
        console.warn('SSE connection error:', error)
        eventSource.close()
        // Retry connection after 3 seconds
        setTimeout(connectSSE, 3000)
      }

      return eventSource
    }

    const eventSource = connectSSE()

    return () => {
      if (eventSource) {
        eventSource.close()
      }
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