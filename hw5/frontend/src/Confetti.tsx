// Yale-blue confetti for money moments: every time `burst` goes up, ~120 pieces pop out of the
// top center of the screen and flutter down for about 2.8 s. Plain DOM + Web Animations, no images.
import { useEffect, useRef } from 'react'
import './confetti.css'

const COLORS = ['#00356b', '#00356b', '#286dc0', '#63aaff', '#ffffff'] // Yale blue weighted a bit heavier
const PIECES = 120
const BASE_MS = 2800

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)
// roughly bell-shaped in [-1, 1]: most pieces land near the middle, a few fly wide
const spread = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1

function fire(host: HTMLElement): number {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const burst = document.createElement('div')
  burst.className = 'confetti-burst'
  let longest = 0

  for (let i = 0; i < PIECES; i++) {
    const piece = document.createElement('i')
    const color = COLORS[i % COLORS.length]
    const shape = Math.random()
    piece.className = `confetti-piece ${shape < 0.18 ? 'confetti-dot' : shape < 0.36 ? 'confetti-strip' : 'confetti-rect'}`
    if (color === '#ffffff') piece.classList.add('confetti-white')
    piece.style.background = color
    burst.appendChild(piece)

    const dx = spread() * vw * 0.55 // where it ends up sideways
    const popY = rand(0.06, 0.24) * vh // the initial pop downward/outward
    const sway = rand(-60, 60)
    const spin = rand(360, 1080) * (Math.random() < 0.5 ? -1 : 1)
    const flip = rand(540, 1440)
    const duration = BASE_MS + rand(-450, 450)
    const delay = rand(0, 160)
    longest = Math.max(longest, duration + delay)

    piece.animate(
      [
        { transform: 'translate3d(0, 0, 0) rotate(0deg) rotateX(0deg)', opacity: 1, easing: 'cubic-bezier(0.15, 0.7, 0.35, 1)' },
        { transform: `translate3d(${dx * 0.55}px, ${popY}px, 0) rotate(${spin * 0.3}deg) rotateX(${flip * 0.3}deg)`, opacity: 1, offset: 0.22 },
        { transform: `translate3d(${dx * 0.8 + sway}px, ${vh * 0.55}px, 0) rotate(${spin * 0.65}deg) rotateX(${flip * 0.65}deg)`, opacity: 1, offset: 0.62 },
        { transform: `translate3d(${dx + sway * 0.4}px, ${vh * 0.88}px, 0) rotate(${spin * 0.9}deg) rotateX(${flip * 0.9}deg)`, opacity: 0.9, offset: 0.86 },
        { transform: `translate3d(${dx - sway * 0.3}px, ${vh + 40}px, 0) rotate(${spin}deg) rotateX(${flip}deg)`, opacity: 0 },
      ],
      { duration, delay, fill: 'both', easing: 'linear' },
    )
  }

  host.appendChild(burst)
  return window.setTimeout(() => burst.remove(), longest + 120)
}

export function Confetti({ burst }: { burst: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const lastRef = useRef(burst) // the initial value never fires
  const timersRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const previous = lastRef.current
    lastRef.current = burst
    if (!burst || burst <= previous) return // 0, first render, or a reset to a lower number
    const host = hostRef.current
    if (!host || prefersReducedMotion()) return
    const timers = timersRef.current
    const id = fire(host)
    timers.add(id)
    window.setTimeout(() => timers.delete(id), BASE_MS + 1200)
  }, [burst])

  // Unmount: stop pending cleanups and drop any pieces still falling.
  useEffect(() => {
    const timers = timersRef.current
    const host = hostRef.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
      host?.replaceChildren()
    }
  }, [])

  return <div ref={hostRef} className="confetti-layer" aria-hidden="true" />
}
