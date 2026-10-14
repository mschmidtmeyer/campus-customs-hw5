// Paper airplanes between desks: every send_message becomes a little white plane that arcs from
// the sender's desk to the receiver's, trailing a dashed contrail and a short label of the message.
// Drawn with inline SVG + CSS, moved with the Web Animations API. No images, no libraries.
import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import './planes.css'

export interface Flight {
  id: string
  from: string // agent id ('owner' allowed)
  to: string
  text: string
}

interface PaperPlanesProps {
  flights: Flight[]
  getDeskEl: (agent: string) => HTMLElement | null
  onDone: (id: string) => void
}

interface Pt { x: number; y: number }

const BASE_MS = 1600
const LOOP_MS = 300 // extra time when the plane does a loop-de-loop
const SAMPLES = 96
const LOOP_START = 0.4
const LOOP_END = 0.62
const LABEL_MAX = 40

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clip(text: string, max = LABEL_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const ease = (s: number) => 0.5 - 0.5 * Math.cos(Math.PI * s) // gentle ease-in-out

function centerOf(r: DOMRect, box: DOMRect): Pt {
  return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top }
}

// A quadratic arc bowed upward (or sideways for vertical hops), with an optional loop in the middle.
function flightPath(a: Pt, b: Pt, seed: string): { at: (t: number) => Pt; loop: boolean } | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  if (dist < 8) return null
  const u = { x: dx / dist, y: dy / dist }
  let n = { x: -u.y, y: u.x }
  if (n.y > 0 || (n.y === 0 && n.x < 0)) n = { x: -n.x, y: -n.y } // bow toward the top of the screen
  const loop = dist > 260 && hash(seed) % 2 === 0
  const r = loop ? Math.min(26, dist * 0.06) : 0
  let lift = clamp(dist * 0.32, 40, 150)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const room = mid.y - 14 - 2 * r // space above the arc's midpoint inside the floor
  if (n.y < 0 && (lift / 2) * -n.y > room) {
    const fit = room > 0 ? (room * 2) / -n.y : 0
    if (fit >= 30) lift = fit
    else n = { x: -n.x, y: -n.y } // no room above: dip under instead
  }
  const c = { x: mid.x + n.x * lift, y: mid.y + n.y * lift }
  const at = (t: number): Pt => {
    const m = 1 - t
    let x = m * m * a.x + 2 * m * t * c.x + t * t * b.x
    let y = m * m * a.y + 2 * m * t * c.y + t * t * b.y
    if (r > 0 && t > LOOP_START && t < LOOP_END) {
      const p = (t - LOOP_START) / (LOOP_END - LOOP_START)
      const s = Math.sin(2 * Math.PI * p)
      const k = 1 - Math.cos(2 * Math.PI * p)
      x += r * (s * u.x + k * n.x)
      y += r * (s * u.y + k * n.y)
    }
    return { x, y }
  }
  return { at, loop }
}

export function PaperPlanes({ flights, getDeskEl, onDone }: PaperPlanesProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const getRef = useRef(getDeskEl)
  const doneRef = useRef(onDone)
  useLayoutEffect(() => {
    getRef.current = getDeskEl
    doneRef.current = onDone
  })
  return (
    <div ref={layerRef} className="plane-layer" aria-hidden="true">
      {flights.map((f) => (
        <PlaneFlight key={f.id} flight={f} layerRef={layerRef} getRef={getRef} doneRef={doneRef} />
      ))}
    </div>
  )
}

interface PlaneFlightProps {
  flight: Flight
  layerRef: RefObject<HTMLDivElement | null>
  getRef: RefObject<(agent: string) => HTMLElement | null>
  doneRef: RefObject<(id: string) => void>
}

function PlaneFlight({ flight, layerRef, getRef, doneRef }: PlaneFlightProps) {
  const planeRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<SVGPathElement>(null)
  const landRef = useRef<HTMLDivElement>(null)
  const finishedRef = useRef(false)
  const label = clip(flight.text)
  const { id, from, to } = flight

  useLayoutEffect(() => {
    const finish = () => {
      if (finishedRef.current) return
      finishedRef.current = true
      doneRef.current(id)
    }
    const layer = layerRef.current
    const plane = planeRef.current
    const trail = trailRef.current
    const land = landRef.current
    const fromEl = getRef.current(from)
    const toEl = getRef.current(to)
    if (!layer || !plane || !trail || !land || !fromEl || !toEl || prefersReducedMotion()) {
      finish()
      return
    }
    const box = layer.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) {
      finish()
      return
    }
    const a = centerOf(fromEl.getBoundingClientRect(), box)
    const b = centerOf(toEl.getBoundingClientRect(), box)
    const path = flightPath(a, b, id)
    if (!path) {
      finish()
      return
    }
    const duration = BASE_MS + (path.loop ? LOOP_MS : 0)
    const flip = b.x < a.x // keep the wings up when flying right-to-left

    // Sample the flight once: positions, heading (unwrapped so loops spin smoothly), distance flown.
    const pts: Pt[] = []
    const angles: number[] = []
    const cum: number[] = []
    let prevAngle = 0
    for (let i = 0; i <= SAMPLES; i++) {
      const t = ease(i / SAMPLES)
      const p = path.at(t)
      const p0 = path.at(Math.max(0, t - 0.004))
      const p1 = path.at(Math.min(1, t + 0.004))
      let ang = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI
      if (i > 0) {
        while (ang - prevAngle > 180) ang -= 360
        while (ang - prevAngle < -180) ang += 360
      }
      prevAngle = ang
      pts.push(p)
      angles.push(ang)
      cum.push(i === 0 ? 0 : cum[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y))
    }
    const total = cum[SAMPLES]

    const planeFrames: Keyframe[] = []
    const trailFrames: Keyframe[] = []
    const labelFrames: Keyframe[] = []
    const lw = labelRef.current?.offsetWidth ?? 0
    const lh = labelRef.current?.offsetHeight ?? 0

    // Dashed contrail: a fixed run of dashes that slides along the path just behind the plane.
    const DASH = 5
    const GAP = 6
    const windowLen = Math.min(120, total * 0.45)
    const k = Math.max(2, Math.floor((windowLen + GAP) / (DASH + GAP)))
    const run = k * DASH + (k - 1) * GAP
    const pattern = `${Array(k - 1).fill(`${DASH} ${GAP}`).join(' ')} ${DASH} ${Math.ceil(total + run + 60)}`
    trail.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '))
    trail.style.strokeDasharray = pattern

    for (let i = 0; i <= SAMPLES; i++) {
      const s = i / SAMPLES
      const { x, y } = pts[i]
      const wobble = 4 * Math.sin(s * Math.PI * 5)
      const sc = 0.85 + 0.3 * Math.sin(Math.PI * s)
      const fade = s < 0.06 ? s / 0.06 : s > 0.93 ? (1 - s) / 0.07 : 1
      planeFrames.push({
        offset: s,
        opacity: fade,
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(angles[i] + wobble).toFixed(1)}deg) scale(${sc.toFixed(3)}, ${(flip ? -sc : sc).toFixed(3)})`,
      })
      trailFrames.push({
        offset: s,
        strokeDashoffset: `${(run - (cum[i] - 14)).toFixed(1)}px`,
        opacity: s > 0.85 ? (0.7 * (1 - s)) / 0.15 : 0.7,
      })
      if (lw) {
        const lx = clamp(x - lw / 2, 4, Math.max(4, box.width - lw - 4))
        const ly = clamp(y + 18, 2, Math.max(2, box.height - lh - 2))
        const lo = s < 0.1 ? s / 0.1 : s > 0.68 ? Math.max(0, (0.95 - s) / 0.27) : 1
        labelFrames.push({ offset: s, opacity: lo, transform: `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)` })
      }
    }

    const anims: Animation[] = []
    anims.push(plane.animate(planeFrames, { duration, easing: 'linear', fill: 'both' }))
    anims.push(trail.animate(trailFrames, { duration, easing: 'linear', fill: 'both' }))
    if (labelRef.current && labelFrames.length) {
      anims.push(labelRef.current.animate(labelFrames, { duration, easing: 'linear', fill: 'both' }))
    }
    // A soft ring where the plane lands; the flight is done when the ring has faded.
    land.style.left = `${b.x}px`
    land.style.top = `${b.y}px`
    const ring = land.animate(
      [
        { opacity: 0, transform: 'scale(0.3)' },
        { opacity: 0.75, transform: 'scale(0.8)', offset: 0.25 },
        { opacity: 0, transform: 'scale(1.7)' },
      ],
      { duration: 480, delay: duration * 0.9, easing: 'ease-out', fill: 'both' },
    )
    anims.push(ring)
    ring.onfinish = finish

    return () => {
      ring.onfinish = null
      anims.forEach((an) => an.cancel())
    }
  }, [id, from, to, layerRef, getRef, doneRef])

  return (
    <div className="plane-flight">
      <svg className="plane-trail">
        <path ref={trailRef} />
      </svg>
      <div ref={landRef} className="plane-land" />
      {label && <div ref={labelRef} className="plane-label">{label}</div>}
      <div ref={planeRef} className="plane">
        <svg className="plane-svg" viewBox="0 0 32 24" width="32" height="24">
          <path d="M2 3 L30 12 L10 12 Z" fill="#ffffff" />
          <path d="M10 12 L30 12 L6 20 Z" fill="#dce9f8" />
          <path d="M10 12 L30 12 L13 16 Z" fill="#b9cfea" />
          <path d="M2 3 L30 12 L6 20 L10 12 Z" fill="none" stroke="#00356b" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M10 12 L30 12" fill="none" stroke="#286dc0" strokeWidth="0.7" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
