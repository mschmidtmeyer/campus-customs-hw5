// Handsome Dan's work clothes and desk props, drawn in HTML/CSS (no image assets).
// <Costume> pieces sit inside Dan's unscaled 140×150 box, so pass it as Dan's `costume` prop.
// <DeskProp> is a small object that stands on the desk top in front of each Dan.
import type { ReactNode } from 'react'
import type { AgentId } from './types'
import './costumes.css'

type Wearer = AgentId | 'owner'

// Body-hugging pieces live in .cos-bodyclip, which has the same shape as Dan's body and clips to it.
const OUTFITS: Record<Wearer, ReactNode> = {
  // Navy blazer lapels, white shirt V, striped Yale-blue tie, pocket square.
  boss: (
    <div className="cos-bodyclip">
      <div className="cos-shirt" />
      <div className="cos-lapel cos-lapel-l" />
      <div className="cos-lapel cos-lapel-r" />
      <div className="cos-tie-knot" />
      <div className="cos-tie" />
      <div className="cos-pocket" />
    </div>
  ),
  // Yellow hard hat + hi-vis vest.
  inventory: (
    <>
      <div className="cos-hardhat" />
      <div className="cos-hardhat-brim" />
      <div className="cos-bodyclip">
        <div className="cos-vest cos-vest-l" />
        <div className="cos-vest cos-vest-r" />
      </div>
    </>
  ),
  // Green translucent visor + round glasses.
  accounting: (
    <>
      <div className="cos-visor-band" />
      <div className="cos-visor" />
      <div className="cos-glasses">
        <span className="cos-temple cos-temple-l" />
        <span className="cos-temple cos-temple-r" />
        <span className="cos-lens cos-lens-l" />
        <span className="cos-bridge" />
        <span className="cos-lens cos-lens-r" />
      </div>
    </>
  ),
  // Navy work cap + tool belt with a wrench in the pouch.
  facilities: (
    <>
      <div className="cos-cap" />
      <div className="cos-cap-logo">Y</div>
      <div className="cos-cap-brim" />
      <div className="cos-bodyclip">
        <div className="cos-belt" />
        <div className="cos-buckle" />
      </div>
      <div className="cos-belt-wrench" />
      <div className="cos-pouch" />
    </>
  ),
  // Headset (band, ear cup, mic arm) + "Hi, I'm Dan" badge.
  customer_service: (
    <>
      <div className="cos-headset-band" />
      <div className="cos-headset-pad" />
      <div className="cos-headset-mic" />
      <div className="cos-headset-tip" />
      <div className="cos-headset-cup" />
      <div className="cos-badge">
        <span className="cos-badge-hi">{'Hi, I’m'}</span>
        <span className="cos-badge-name">Dan</span>
      </div>
    </>
  ),
  // Yale sweater: knit texture + a felt "Y" patch.
  owner: (
    <>
      <div className="cos-bodyclip cos-knit" />
      <div className="cos-patch">Y</div>
    </>
  ),
}

export function Costume({ agent }: { agent: AgentId | 'owner' }) {
  return (
    <div className={`cos cos-${agent}`} aria-hidden="true">
      {OUTFITS[agent]}
    </div>
  )
}

export function DeskProp({ agent, working }: { agent: AgentId; working: boolean }) {
  return (
    <div className={`cos-prop cos-prop-${agent}${working ? ' cos-prop-on' : ''}`} aria-hidden="true">
      {agent === 'boss' && (
        <>
          <div className="cos-block" />
          <div className="cos-gavel">
            <span className="cos-gavel-handle" />
            <span className="cos-gavel-head" />
          </div>
          <div className="cos-mug">Y</div>
          {!working && <div className="cos-steam"><i /><i /></div>}
        </>
      )}

      {agent === 'inventory' && (
        <>
          <div className="cos-box cos-box-1" />
          <div className="cos-box cos-box-2" />
          <div className="cos-box cos-box-3" />
        </>
      )}

      {agent === 'accounting' && (
        <>
          <div className="cos-calc">
            <div className="cos-calc-screen">
              <span>1250.00</span>
              <span>8431.17</span>
              <span>-96.40</span>
            </div>
            <div className="cos-calc-keys">
              {Array.from({ length: 16 }, (_, i) => <i key={i} />)}
            </div>
          </div>
          <div className="cos-coins"><i /><i /><i /></div>
        </>
      )}

      {agent === 'facilities' && (
        <>
          <div className="cos-wrench">
            <span className="cos-wrench-handle" />
            <span className="cos-wrench-head" />
            <span className="cos-wrench-tail" />
          </div>
          <div className="cos-keyring">
            <span className="cos-key cos-key-1" />
            <span className="cos-key cos-key-2" />
          </div>
        </>
      )}

      {agent === 'customer_service' && (
        <>
          <div className="cos-phone">
            <span className="cos-phone-base" />
            <span className="cos-handset"><i /><i /></span>
          </div>
          <div className="cos-tent">Hi!</div>
        </>
      )}
    </div>
  )
}
