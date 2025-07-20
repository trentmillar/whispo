import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Copy, Check } from "lucide-react"
import { Button } from "@renderer/components/ui/button"
import { rendererHandlers, tipcClient } from "~/lib/tipc-client"
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function Component() {
  const [overlayData, setOverlayData] = useState<{
    question: string
    response: string
    isLoading: boolean
  }>({ question: "", response: "", isLoading: true })
  
  const [copied, setCopied] = useState(false)
  const queryClient = useQueryClient()
  
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => tipcClient.getConfig(),
  })
  
  const [opacity, setOpacity] = useState(config?.overlayOpacity ?? 95)

  useEffect(() => {
    const unlistenShow = rendererHandlers.showOverlay.listen(({ question, response }) => {
      setOverlayData({ question, response, isLoading: false })
    })
    
    return unlistenShow
  }, [])
  
  useEffect(() => {
    if (config?.overlayOpacity !== undefined) {
      setOpacity(config.overlayOpacity)
    }
  }, [config?.overlayOpacity])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(overlayData.response)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    tipcClient.confirmTranscript({ transcript: overlayData.response })
  }
  
  const updateOpacity = useCallback(async (newOpacity: number) => {
    setOpacity(newOpacity)
    const currentConfig = await tipcClient.getConfig()
    await tipcClient.saveConfig({
      config: {
        ...currentConfig,
        overlayOpacity: newOpacity
      }
    })
    queryClient.invalidateQueries({ queryKey: ["config"] })
  }, [queryClient])
  
  useEffect(() => {
    const unlistenClose = rendererHandlers.closeOverlay.listen(() => {
      handleClose()
    })
    
    return unlistenClose
  }, [handleClose])
  
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const newOpacity = Math.max(20, opacity - 5)
        await updateOpacity(newOpacity)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const newOpacity = Math.min(100, opacity + 5)
        await updateOpacity(newOpacity)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [opacity, updateOpacity, handleClose])

  return (
    <div className="fixed inset-0 bg-transparent flex items-center justify-center p-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, type: "spring", damping: 25 }}
        className="backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden max-w-[600px] w-full border border-neutral-200 dark:border-neutral-800 pointer-events-auto"
        style={{
          backgroundColor: `rgba(255, 255, 255, ${opacity / 100})`,
          ...(window.matchMedia('(prefers-color-scheme: dark)').matches && {
            backgroundColor: `rgba(23, 23, 23, ${opacity / 100})`
          })
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-neutral-800" style={{ WebkitAppRegion: 'drag' } as any}>
          <h2 className="text-lg font-semibold dark:text-white">AI Response</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Question */}
          <div className="space-y-2">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Your question:</p>
            <p className="text-sm font-medium dark:text-white">{overlayData.question}</p>
          </div>

          {/* Response */}
          <div className="space-y-2">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">AI response:</p>
            {overlayData.isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full" />
                <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full animation-delay-200" />
                <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full animation-delay-400" />
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{overlayData.response}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t dark:border-neutral-800">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Opacity: {opacity}% • ←/→ adjust • ESC close
          </div>
          <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!overlayData.response || overlayData.isLoading}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={handleClose}
          >
            Done
          </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}