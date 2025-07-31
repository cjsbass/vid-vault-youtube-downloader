"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Play, 
  Pause, 
  X, 
  Download, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Trash2,
  PlayCircle,
  PauseCircle,
  FolderOpen
} from 'lucide-react'
import Image from 'next/image'
import { QueueItem } from '@/hooks/useDownloadQueue'

interface DownloadQueueProps {
  queue: QueueItem[]
  activeDownloads: number
  totalProgress: number
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
  onClear: () => void
  onPauseAll: () => void
  onResumeAll: () => void
}

const StatusIcon: React.FC<{ status: QueueItem['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-yellow-400" />
    case 'downloading':
      return <Download className="w-4 h-4 text-blue-400 animate-pulse" />
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'failed':
      return <AlertCircle className="w-4 h-4 text-red-400" />
    case 'paused':
      return <Pause className="w-4 h-4 text-gray-400" />
    default:
      return null
  }
}

const StatusBadge: React.FC<{ status: QueueItem['status'] }> = ({ status }) => {
  const colors = {
    pending: 'bg-yellow-900/20 text-yellow-400 border-yellow-400/30',
    downloading: 'bg-blue-900/20 text-blue-400 border-blue-400/30',
    completed: 'bg-green-900/20 text-green-400 border-green-400/30',
    failed: 'bg-red-900/20 text-red-400 border-red-400/30',
    paused: 'bg-gray-900/20 text-gray-400 border-gray-400/30'
  }
  
  return (
    <Badge className={`${colors[status]} font-inter text-xs`}>
      {status.toUpperCase()}
    </Badge>
  )
}

const QueueItem: React.FC<{
  item: QueueItem
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
}> = ({ item, onPause, onResume, onCancel }) => {
  return (
    <div className="flex items-center gap-3 p-3 bg-black/40 border border-green-500/20 rounded-none hover:border-green-500/40 transition-colors">
      {/* Thumbnail */}
      <div className="relative w-16 h-12 flex-shrink-0">
        <Image
          src={item.thumbnail}
          alt={item.title}
          fill
          className="object-cover rounded-none"
          unoptimized
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <StatusIcon status={item.status} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-green-400 font-inter text-sm truncate">
            {item.title}
          </h4>
          <StatusBadge status={item.status} />
          <Badge className="bg-gray-900/20 text-gray-400 border-gray-400/30 font-inter text-xs">
            {item.quality}
          </Badge>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-2">
          <Progress 
            value={item.progress} 
            className="h-2 bg-gray-800 border border-green-500/30"
          />
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-4 text-xs font-inter text-green-300">
          <span>{item.progress.toFixed(1)}%</span>
          <span>{item.downloadedSize} / {item.size}</span>
          {item.status === 'downloading' && (
            <>
              <span>{item.speed}</span>
              <span>ETA: {item.eta}</span>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        {item.status === 'downloading' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
            onClick={() => onPause(item.id)}
          >
            <Pause className="w-4 h-4" />
          </Button>
        )}
        
        {(item.status === 'paused' || item.status === 'failed') && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-400/10"
            onClick={() => onResume(item.id)}
          >
            <Play className="w-4 h-4" />
          </Button>
        )}
        
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
          onClick={() => onCancel(item.id)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({
  queue,
  activeDownloads,
  totalProgress,
  onPause,
  onResume,
  onCancel,
  onClear,
  onPauseAll,
  onResumeAll
}) => {
  if (queue.length === 0) {
    return null
  }

  const pendingCount = queue.filter(item => item.status === 'pending').length
  const completedCount = queue.filter(item => item.status === 'completed').length

  return (
    <Card className="bg-black/60 border-green-500/30 backdrop-blur-sm shadow-[0_0_20px_rgba(50,205,50,0.3)] rounded-none mt-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
                  <CardTitle className="text-green-400 font-inter text-lg flex items-center gap-2">
          <Download className="w-5 h-5" />
          DOWNLOAD QUEUE
        </CardTitle>
          
          <div className="flex items-center gap-2">
            <Badge className="bg-green-900/20 text-green-400 border-green-400/30 font-inter">
              {queue.length} total
            </Badge>
            <Badge className="bg-blue-900/20 text-blue-400 border-blue-400/30 font-inter">
              {activeDownloads} active
            </Badge>
            <Badge className="bg-yellow-900/20 text-yellow-400 border-yellow-400/30 font-inter">
              {pendingCount} pending
            </Badge>
          </div>
        </div>

        {/* Overall Progress */}
        {activeDownloads > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-sm font-inter text-green-300 mb-1">
              <span>Overall Progress</span>
              <span>{totalProgress.toFixed(1)}%</span>
            </div>
            <Progress 
              value={totalProgress} 
              className="h-2 bg-gray-800 border border-green-500/30"
            />
          </div>
        )}

        {/* Queue Controls */}
        <div className="flex items-center gap-2 mt-3">
          {activeDownloads > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10 font-inter"
              onClick={onPauseAll}
            >
              <PauseCircle className="w-4 h-4 mr-1" />
              PAUSE ALL
            </Button>
          )}
          
          <Button
            size="sm"
            variant="ghost"
            className="text-green-400 hover:text-green-300 hover:bg-green-400/10 font-inter"
            onClick={onResumeAll}
          >
            <PlayCircle className="w-4 h-4 mr-1" />
            RESUME ALL
          </Button>
          
          {completedCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-red-400/10 font-inter"
              onClick={onClear}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              CLEAR COMPLETED
            </Button>
          )}
          
          <Button
            size="sm"
            variant="ghost"
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 font-inter"
            onClick={() => {
              // Open downloads folder (platform specific)
              if (typeof window !== 'undefined') {
                window.open('/api/downloads/folder', '_blank')
              }
            }}
          >
            <FolderOpen className="w-4 h-4 mr-1" />
            OPEN FOLDER
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {queue.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}