// One workstation on the office floor: Handsome Dan in costume behind a wooden desk, with a
// monitor that shows what he is doing (tool chip, the '#id' of the ticket he is on, typed-out thought),
// a desk lamp that becomes the spotlight while he works, a nameplate, his desk prop and a hover card
// with his job. Several desks can be lit at once when the team runs several tickets.
import { useEffect, useId, useState } from 'react'
import type { AgentInfo, ScreenTheme } from './agents'
import { Costume, DeskProp } from './Costumes'
import { Dan } from './Dan'
import type { AgentLive } from './derive'
import './desk.css'

export interface DeskProps {
  agent: AgentInfo
  live: AgentLive
  dim: boolean
  corner?: boolean
  deskRef?: (el: HTMLDivElement | null) => void
}

type Mode = 'on' | 'wait' | 'off'

const MAX_CHARS = 160
const TYPE_MS = 1200

// Last ~160 characters of what the agent said, cleaned of markdown marks.
function screenText(s: string | null): string {
  if (!s) return ''
  const t = s.replace(/[*#`]+/g, '').replace(/\s+/g, ' ').trim()
  if (t.length <= MAX_CHARS) return t
  const cut = t.slice(t.length - (MAX_CHARS - 1))
  const space = cut.indexOf(' ')
  return '…' + (space > 0 && space < 24 ? cut.slice(space + 1) : cut)
}

// Reveal `text` over `ms` whenever it changes; returns how many characters to show.
function useTypewriter(text: string, ms: number): number {
  const [prog, setProg] = useState<{ text: string; n: number }>({ text: '', n: 0 })
  useEffect(() => {
    if (!text) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProg({ text, n: text.length })
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const n = Math.min(text.length, Math.max(1, Math.ceil(((t - t0) / ms) * text.length)))
      setProg((p) => (p.text === text && p.n === n ? p : { text, n }))
      if (n < text.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, ms])
  return prog.text === text ? prog.n : 0
}

function Typed({ text }: { text: string }) {
  const n = useTypewriter(text, TYPE_MS)
  return (
    <>
      <span>{text.slice(0, n)}</span>
      <span className="pc-caret" aria-hidden="true" />
    </>
  )
}

function Hourglass({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 10 14" aria-hidden="true">
      <path d="M1 1h8M1 13h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 1.5C2 4.5 4.3 5.6 4.3 7S2 9.5 2 12.5M8 1.5C8 4.5 5.7 5.6 5.7 7S8 9.5 8 12.5"
            fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3 3.2h4C6.6 4.6 5.4 5.4 5 6.3 4.6 5.4 3.4 4.6 3 3.2zM3.2 12.3h3.6C6.4 11.2 5.6 10.6 5 10.4 4.4 10.6 3.6 11.2 3.2 12.3z"
            fill="currentColor" opacity="0.8" />
    </svg>
  )
}

function WrenchIcon() {
  return (
    <svg className="pc-chip-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor"
            d="M11.2 1a4 4 0 0 0-3.9 5L1.6 11.7a1.6 1.6 0 0 0 2.3 2.3l5.7-5.7a4 4 0 0 0 5-4.8l-2.3 2.3-2-.5-.6-2L12 .9A4 4 0 0 0 11.2 1z" />
    </svg>
  )
}

// The ticket this desk is on, so you can tell several lit desks apart.
function TicketTag({ id }: { id: number | null }) {
  if (id == null) return null
  return <span className="pc-ticket" title={`Ticket #${id}`}>#{id}</span>
}

function Screen({ theme, mode, live }: { theme: ScreenTheme; mode: Mode; live: AgentLive }) {
  const text = screenText(live.thought)
  return (
    <div className={`pc-screen ${mode === 'off' ? 'pc-screen-off' : `pc-${theme}`}`}>
      {mode === 'off' && (
        <div className="pc-saver" aria-hidden="true">
          <span className="pc-saver-x"><span className="pc-saver-y">Y</span></span>
        </div>
      )}

      {mode === 'wait' && (
        <div className="pc-waiting" key="wait">
          <Hourglass className="pc-hourglass" />
          <span>Waiting…</span>
          <TicketTag id={live.ticketId} />
        </div>
      )}

      {mode === 'on' && (
        <div className="pc-app" key="on">
          <div className="pc-bar">
            <span className="pc-winbtns" aria-hidden="true"><i /><i /><i /></span>
            {live.tool ? (
              <span className="pc-chip" key={live.toolSeq} title={live.tool}>
                <WrenchIcon />
                <span className="pc-chip-text">{live.tool}</span>
              </span>
            ) : (
              <span className="pc-bar-label">thinking…</span>
            )}
            <TicketTag id={live.ticketId} />
          </div>
          <div className="pc-body">
            {theme === 'chat' && <div className="pc-bubble pc-bubble-in" aria-hidden="true"><i /><i /></div>}
            <div className={theme === 'chat' ? 'pc-bubble pc-bubble-out' : 'pc-text'}>
              {text ? <Typed text={text} /> : <span className="pc-typing" aria-label="thinking"><i /><i /><i /></span>}
            </div>
          </div>
        </div>
      )}

      <div className="pc-glare" aria-hidden="true" />
    </div>
  )
}

function Monitor({ theme, mode, live }: { theme: ScreenTheme; mode: Mode; live: AgentLive }) {
  return (
    <div className={`pc pc-is-${mode}`}>
      <div className="pc-frame">
        <Screen theme={theme} mode={mode} live={live} />
        <span className="pc-led" aria-hidden="true" />
      </div>
      <div className="pc-neck" aria-hidden="true" />
      <div className="pc-base" aria-hidden="true" />
    </div>
  )
}

function Lamp() {
  return (
    <div className="lamp" aria-hidden="true">
      <div className="lamp-arm lamp-arm-low" />
      <div className="lamp-arm lamp-arm-up" />
      <div className="lamp-joint lamp-joint-elbow" />
      <div className="lamp-base" />
      <div className="lamp-shade"><div className="lamp-bulb" /></div>
      <div className="lamp-joint lamp-joint-head" />
    </div>
  )
}

export function Desk({ agent, live, dim, corner = false, deskRef }: DeskProps) {
  const cardId = useId()
  const working = live.working
  const waiting = live.waiting && !working
  const mode: Mode = working ? 'on' : waiting ? 'wait' : 'off'
  const status = working ? 'Working' : waiting ? 'Waiting' : 'Idle'
  const onTicket = (working || waiting) && live.ticketId != null ? live.ticketId : null
  const cls = [
    'desk',
    corner && 'desk-corner',
    working && 'desk-on',
    waiting && 'desk-waiting',
    dim && !working && 'desk-dim',
  ].filter(Boolean).join(' ')

  return (
    <div ref={deskRef} className={cls} data-agent={agent.id} tabIndex={0} role="group"
         aria-label={`${agent.name}, ${agent.title}. ${status}${onTicket != null ? ` on ticket #${onTicket}` : ''}.`}
         aria-describedby={cardId}>
      <div className="desk-shadow" aria-hidden="true" />
      <div className="desk-ring" aria-hidden="true" />

      <div className="desk-scene">
        <div className={corner ? 'desk-chair desk-chair-leather' : 'desk-chair'} aria-hidden="true" />
        <div className="desk-dan">
          <Dan outfit={agent.outfit} accent={agent.accent} working={working} size={110}
               costume={<Costume agent={agent.id} />} label={agent.name} />
        </div>

        <div className="desk-top" aria-hidden="true" />
        {corner && <div className="desk-blotter" aria-hidden="true" />}
        <div className="desk-lip" aria-hidden="true" />
        <div className="desk-panel">
          <div className="desk-plate">{agent.name}</div>
        </div>
        <div className="desk-foot desk-foot-l" aria-hidden="true" />
        <div className="desk-foot desk-foot-r" aria-hidden="true" />

        <div className="lamp-pool" aria-hidden="true" />
        <div className="desk-papers" aria-hidden="true"><i /><i /><b /></div>
        <div className="desk-prop"><DeskProp agent={agent.id} working={working} /></div>
        <div className="lamp-cone" aria-hidden="true" />
        <Monitor theme={agent.screen} mode={mode} live={live} />
        <Lamp />

        {waiting && (
          <div className="desk-sign" aria-hidden="true">
            <span className="desk-sign-board"><Hourglass className="desk-sign-hg" />Waiting</span>
          </div>
        )}
      </div>

      <div className="desk-card" id={cardId} role="tooltip">
        <div className="desk-card-head">
          <strong>{agent.name}</strong>
          <span className={`desk-card-status desk-card-${status.toLowerCase()}`}>
            {status}{onTicket != null && ` · #${onTicket}`}
          </span>
        </div>
        <div className="desk-card-title">{agent.title}</div>
        <p className="desk-card-job">{agent.job}</p>
        <div className="desk-card-tools">
          {agent.tools.map((t) => <code key={t}>{t}</code>)}
        </div>
      </div>
    </div>
  )
}
