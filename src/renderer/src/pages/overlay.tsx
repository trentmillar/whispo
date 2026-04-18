import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Copy, Check, Sparkles } from "lucide-react"
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
    <div className="fixed inset-0 bg-transparent flex items-center justify-center p-6 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, type: "spring", damping: 25 }}
        className="backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden w-[900px] max-w-[90vw] border border-white/10 pointer-events-auto"
        style={{
          backgroundColor: `rgba(31, 31, 31, ${opacity / 100})`,
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-6 py-4 border-b border-white/10"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>ESC close</span>
            <span>•</span>
            <span>↑↓ navigate</span>
            <span>•</span>
            <span>Tab topics</span>
            <span>•</span>
            <span>Enter elaborate</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-7 w-7 hover:bg-white/10"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <X className="h-4 w-4 text-gray-400" />
          </Button>
        </div>

        {/* Main Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Number Badge */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 font-semibold">1</span>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-4">
              {/* Title */}
              <h2 className="text-xl font-semibold text-white">AI Response</h2>

              {/* Question */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 italic">
                    **{overlayData.question}**
                  </span>
                </div>
              </div>

              {/* Response */}
              <div className="space-y-3">
                {overlayData.isLoading ? (
                  <div className="flex items-center space-x-2 py-4">
                    <div className="animate-pulse h-2 w-2 bg-emerald-500 rounded-full" />
                    <div className="animate-pulse h-2 w-2 bg-emerald-500 rounded-full animation-delay-200" />
                    <div className="animate-pulse h-2 w-2 bg-emerald-500 rounded-full animation-delay-400" />
                  </div>
                ) : (
                  <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
                    {overlayData.response}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500">
              {overlayData.question?.split(' ').filter(w => w.trim()).length || 0} words • {overlayData.response?.split(' ').filter(w => w.trim()).length || 0} words
            </div>
            <div className="text-xs text-gray-500">
              Opacity: {opacity}% • ←/→ adjust
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!overlayData.response || overlayData.isLoading}
              className="text-gray-400 hover:text-white hover:bg-white/10"
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              elaborate
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}