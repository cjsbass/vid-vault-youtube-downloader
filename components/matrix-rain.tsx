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
      canvas.height = window.innerHeight

      const katakana =
        "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン"
      const latin = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      const nums = "0123456789"
      const alphabet = katakana + latin + nums

      const fontSize = 16 // Back to original readable size
      const columns = Math.floor(canvas.width / fontSize)

      const rainDrops: number[] = []
      for (let x = 0; x < columns; x++) {
        rainDrops[x] = 1
      }

      let frameCount = 0
      const frameSkip = 2 // Just slightly slower

      const draw = () => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = "#0F0" // Green text
        ctx.font = `${fontSize}px monospace`

        for (let i = 0; i < rainDrops.length; i++) {
          const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length))
          ctx.fillText(text, i * fontSize, rainDrops[i] * fontSize)

          if (frameCount % frameSkip === 0) {
            if (rainDrops[i] * fontSize > canvas.height && Math.random() > 0.975) {
              rainDrops[i] = 0
            }
            rainDrops[i]++
          }
        }
        frameCount++
      }

      const animate = () => {
        draw()
        animationFrameId = requestAnimationFrame(animate)
      }
      animate()
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

  return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-0" />
}
