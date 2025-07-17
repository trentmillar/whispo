import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Copy, Check } from "lucide-react"
import { Button } from "@renderer/components/ui/button"
import { rendererHandlers, tipcClient } from "~/lib/tipc-client"

export function Component() {
  const [overlayData, setOverlayData] = useState<{
    question: string
    response: string
    isLoading: boolean
  }>({ question: "", response: "", isLoading: true })
  
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const unlisten = rendererHandlers.showOverlay.listen(({ question, response }) => {
      setOverlayData({ question, response, isLoading: false })
    })
    
    return unlisten
  }, [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(overlayData.response)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    tipcClient.confirmTranscript({ transcript: overlayData.response })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, type: "spring", damping: 25 }}
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden max-w-[600px] w-full"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-neutral-800">
          <h2 className="text-lg font-semibold dark:text-white">AI Response</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8"
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
        <div className="flex items-center justify-end gap-2 p-6 border-t dark:border-neutral-800">
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
      </motion.div>
    </div>
  )
}