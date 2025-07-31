"use client"

import type React from "react"
import { useEffect, useRef } from "react"

export const MatrixRain: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number

    const setup = () => {
      canvas.width = window.innerWidth
      // Use the full document height to cover entire page, not just viewport
      canvas.height = Math.max(document.body.scrollHeight, window.innerHeight)

      const katakana =
        "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン"
      const latin = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      const nums = "0123456789"
      const alphabet = katakana + latin + nums

      const fontSize = 16 // Back to original readable size - Railway sync
      const columns = Math.floor(canvas.width / fontSize)

      const rainDrops: number[] = []
      for (let x = 0; x < columns; x++) {
        // Randomize initial positions so rain appears immediately across the screen
        rainDrops[x] = Math.floor(Math.random() * (canvas.height / fontSize))
      }
      
      // Initialize canvas with black background immediately
      ctx.fillStyle = "black"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Frame rate throttling settings
      const fps = 15 // Target frames per second. Lower is slower.
      const nextFrameDelay = 1000 / fps
      let lastTime = 0

      const draw = () => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = "#0F0" // Green text
        ctx.font = `${fontSize}px monospace`

        for (let i = 0; i < rainDrops.length; i++) {
          const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length))
          ctx.fillText(text, i * fontSize, rainDrops[i] * fontSize)

          if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.975) {
            rainDrops[i] = 0
          }
          rainDrops[i]++
        }
      }

      const animate = (timeStamp: number) => {
        // Calculate the time elapsed since the last frame
        const deltaTime = timeStamp - lastTime

        // Only draw a new frame if the elapsed time is greater than our delay
        if (deltaTime > nextFrameDelay) {
          draw()
          // Update the lastTime to the current timeStamp
          lastTime = timeStamp
        }

        // Continue the loop
        animationFrameId = requestAnimationFrame(animate)
      }
      // Run a few initial frames to establish the effect immediately
      for (let i = 0; i < 10; i++) {
        draw()
      }
      
      // Initial call to start the loop
      animate(0)
    }

    setup()

    const handleResize = () => {
      cancelAnimationFrame(animationFrameId)
      setup()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full z-0" style={{ height: '100%', minHeight: '100vh' }} />
}
