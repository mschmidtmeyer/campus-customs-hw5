// Handsome Dan, the Yale bulldog, built from divs (no image assets). Each agent wears a costume
// layered on top of the same dog; costume pieces are added per agent in the creative pass.
import type { CSSProperties, ReactNode } from 'react'
import './dan.css'

export interface DanProps {
  outfit?: string // body / jacket color
  accent?: string // collar or tie color
  working?: boolean
  size?: number // px width; the dog scales from 140
  costume?: ReactNode // hats, glasses, props: absolutely positioned inside the dog box
  label?: string
}

export function Dan({ outfit = '#00356b', accent = '#f2c94c', working = false, size = 140, costume, label }: DanProps) {
  const style = { '--outfit': outfit, '--accent': accent, '--scale': size / 140 } as CSSProperties
  return (
    <div className={`dan ${working ? 'dan-working' : ''}`} style={style} role="img" aria-label={label ?? 'Handsome Dan'}>
      <div className="dan-box">
        <div className="dan-body"><div className="dan-collar"><span className="dan-tag">Y</span></div></div>
        <div className="dan-ear dan-ear-left" />
        <div className="dan-ear dan-ear-right" />
        <div className="dan-head">
          <div className="dan-brow dan-brow-left" />
          <div className="dan-brow dan-brow-right" />
          <div className="dan-eye dan-eye-left"><div className="dan-pupil" /></div>
          <div className="dan-eye dan-eye-right"><div className="dan-pupil" /></div>
          <div className="dan-muzzle">
            <div className="dan-nose" />
            <div className="dan-jowl dan-jowl-left" />
            <div className="dan-jowl dan-jowl-right" />
            <div className="dan-tooth dan-tooth-left" />
            <div className="dan-tooth dan-tooth-right" />
          </div>
        </div>
        {costume}
      </div>
    </div>
  )
}
