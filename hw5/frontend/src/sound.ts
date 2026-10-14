// Tiny synthesized office sounds (no audio files): a key tick, a rubber-stamp thud, a cash-register
// "cha-ching" and a paper-plane whoosh. Off by default; the choice is remembered in localStorage.
// The AudioContext is created lazily and resumed inside toggle() so browsers allow playback.
import { useCallback, useEffect, useRef, useState } from 'react'

export type SoundName = 'tick' | 'stamp' | 'chaching' | 'whoosh'

const STORAGE_KEY = 'cc-desk-sound'
const MASTER_VOLUME = 0.32 // everything stays quiet
const MIN_GAP_MS: Record<SoundName, number> = { tick: 45, stamp: 120, chaching: 300, whoosh: 160 }

type AudioCtor = typeof AudioContext

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

function writePref(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* storage unavailable (private mode): the toggle still works for this visit */
  }
}

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

interface Rig {
  ctx: AudioContext
  out: GainNode
  noise: AudioBuffer
}

function makeRig(): Rig | null {
  const Ctor = audioCtor()
  if (!Ctor) return null
  try {
    const ctx = new Ctor()
    const out = ctx.createGain()
    out.gain.value = MASTER_VOLUME
    out.connect(ctx.destination)
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1), ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return { ctx, out, noise }
  } catch {
    return null
  }
}

// ---------- small building blocks ----------

function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function tone(rig: Rig, t: number, type: OscillatorType, freq: number, peak: number, attack: number,
              decay: number, endFreq?: number): void {
  const { ctx, out } = rig
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + attack + decay)
  envelope(g, t, peak, attack, decay)
  osc.connect(g).connect(out)
  osc.start(t)
  osc.stop(t + attack + decay + 0.05)
}

function noiseBurst(rig: Rig, t: number, filter: BiquadFilterType, freq: number, peak: number,
                    attack: number, decay: number, q = 0.8): void {
  const { ctx, out, noise } = rig
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.frequency.setValueAtTime(freq, t)
  f.Q.value = q
  const g = ctx.createGain()
  envelope(g, t, peak, attack, decay)
  src.connect(f).connect(g).connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + attack + decay + 0.05)
}

// ---------- the four sounds ----------

function tick(rig: Rig, t: number): void {
  // soft key click: a very short bright blip on top of a tiny high noise tap
  tone(rig, t, 'triangle', 2100, 0.07, 0.002, 0.035, 1400)
  noiseBurst(rig, t, 'highpass', 3500, 0.05, 0.001, 0.018)
}

function stamp(rig: Rig, t: number): void {
  // rubber stamp on paper: low pitch-dropping thud plus a muffled slap
  tone(rig, t, 'sine', 150, 0.45, 0.004, 0.2, 52)
  noiseBurst(rig, t, 'lowpass', 520, 0.25, 0.002, 0.07)
}

function bell(rig: Rig, t: number, freq: number, peak: number): void {
  tone(rig, t, 'sine', freq, peak, 0.004, 0.55)
  tone(rig, t, 'sine', freq * 2.76, peak * 0.28, 0.003, 0.25) // metallic partial
  tone(rig, t, 'triangle', freq * 2, peak * 0.15, 0.003, 0.18)
}

function chaching(rig: Rig, t: number): void {
  // drawer "ch" (short bright noise), then two bright bell tones
  noiseBurst(rig, t, 'highpass', 2600, 0.09, 0.003, 0.08)
  noiseBurst(rig, t + 0.09, 'bandpass', 4200, 0.06, 0.003, 0.06, 1.2)
  bell(rig, t + 0.06, 1318.5, 0.12) // E6
  bell(rig, t + 0.2, 1760, 0.12) // A6
}

function whoosh(rig: Rig, t: number): void {
  // air sweeping past: band-passed noise whose center frequency rises then falls, panned across
  const { ctx, out, noise } = rig
  const dur = 0.55
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.1
  f.frequency.setValueAtTime(320, t)
  f.frequency.exponentialRampToValueAtTime(2300, t + dur * 0.45)
  f.frequency.exponentialRampToValueAtTime(600, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let tail: AudioNode = g
  if (typeof ctx.createStereoPanner === 'function') {
    const pan = ctx.createStereoPanner()
    pan.pan.setValueAtTime(-0.6, t)
    pan.pan.linearRampToValueAtTime(0.6, t + dur)
    g.connect(pan)
    tail = pan
  }
  src.connect(f).connect(g)
  tail.connect(out)
  src.start(t, Math.random() * 0.4)
  src.stop(t + dur + 0.05)
}

const PLAYERS: Record<SoundName, (rig: Rig, t: number) => void> = { tick, stamp, chaching, whoosh }

// ---------- the hook ----------

export function useSound(): { on: boolean; toggle: () => void; play: (name: SoundName) => void } {
  const [on, setOn] = useState<boolean>(readPref)
  const onRef = useRef(on)
  const rigRef = useRef<Rig | null>(null)
  const lastRef = useRef<Partial<Record<SoundName, number>>>({})

  const ensureRig = useCallback((): Rig | null => {
    if (!rigRef.current || rigRef.current.ctx.state === 'closed') rigRef.current = makeRig()
    return rigRef.current
  }, [])

  const resume = useCallback((rig: Rig | null) => {
    if (rig && rig.ctx.state === 'suspended') void rig.ctx.resume().catch(() => undefined)
  }, [])

  const play = useCallback((name: SoundName) => {
    if (!onRef.current) return
    const now = performance.now()
    const last = lastRef.current[name] ?? -Infinity
    if (now - last < MIN_GAP_MS[name]) return // no machine-gun clicking during busy turns
    lastRef.current[name] = now
    const rig = ensureRig()
    if (!rig) return
    resume(rig)
    try {
      PLAYERS[name](rig, rig.ctx.currentTime + 0.01)
    } catch {
      /* a failed sound must never break the desk */
    }
  }, [ensureRig, resume])

  const toggle = useCallback(() => {
    const next = !onRef.current
    onRef.current = next
    setOn(next)
    writePref(next)
    if (next) {
      const rig = ensureRig() // created and resumed inside the click: allowed by autoplay rules
      resume(rig)
      play('tick')
    } else if (rigRef.current && rigRef.current.ctx.state === 'running') {
      void rigRef.current.ctx.suspend().catch(() => undefined)
    }
  }, [ensureRig, resume, play])

  // Sound was left ON from an earlier visit: wake the audio on the first click or key press.
  useEffect(() => {
    if (!on) return
    const wake = () => resume(ensureRig())
    window.addEventListener('pointerdown', wake, { once: true })
    window.addEventListener('keydown', wake, { once: true })
    return () => {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [on, ensureRig, resume])

  // Close the audio context when the desk unmounts (it is recreated lazily if needed again).
  useEffect(() => () => {
    const rig = rigRef.current
    rigRef.current = null
    if (rig && rig.ctx.state !== 'closed') void rig.ctx.close().catch(() => undefined)
  }, [])

  return { on, toggle, play }
}
