import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

/* ------------------------------------------------------------------ *
 * Psyche (core fork) — frontend
 *
 * Drawer tab visualizing the run's characters: their live 40-dimension
 * affect vector as bars, and their approval of the player. The operator can
 * toggle presence, edit values directly, or reset the run. Invisible to the
 * player inside the chat.
 * ------------------------------------------------------------------ */

interface Emotion {
  key: string
  label: string
  kind: 'unipolar' | 'bipolar'
  value: number
  baseline: number
  descriptor: string
}
interface Character {
  id: string
  name: string
  isPrimary: boolean
  present: boolean
  approval: number
  approvalLabel: string
  emotions: Emotion[]
}
interface Snapshot {
  chatId: string
  characters: Character[]
}

export function setup(ctx: SpindleFrontendContext) {
  let snap: Snapshot | null = null
  let selectedId: string | null = null

  const removeStyle = ctx.dom.addStyle(`
    .ps-wrap { display:flex; flex-direction:column; gap:10px; padding:12px; font-size:12.5px; color:var(--lumiverse-text); }
    .ps-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .ps-row.between { justify-content:space-between; }
    .ps-muted { color:var(--lumiverse-text-muted); font-size:11px; }
    .ps-h { font-size:12px; font-weight:600; color:var(--lumiverse-text-muted); margin:6px 0 2px; }
    .ps-chip { font-size:11px; padding:3px 9px; border-radius:999px; border:1px solid var(--lumiverse-border); cursor:pointer; background:var(--lumiverse-fill); }
    .ps-chip.sel { border-color:var(--lumiverse-accent,#6c8cff); color:var(--lumiverse-accent,#6c8cff); }
    .ps-chip.prim { font-weight:600; }
    .ps-btn { padding:5px 10px; font-size:12px; cursor:pointer; background:var(--lumiverse-fill); color:var(--lumiverse-text); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); }
    .ps-btn:hover { background:var(--lumiverse-fill-subtle); }
    .ps-btn.danger { color:#e5534b; }
    .ps-section { border-top:1px solid var(--lumiverse-border); padding-top:10px; display:flex; flex-direction:column; gap:8px; }
    .ps-input,.ps-ta { width:100%; padding:6px 8px; font-size:12px; background:var(--lumiverse-fill); color:var(--lumiverse-text); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); box-sizing:border-box; }
    .ps-ta { min-height:70px; resize:vertical; font-family:inherit; }
    .ps-emo { display:grid; grid-template-columns:84px 1fr 48px 60px; align-items:center; gap:6px; margin:2px 0; }
    .ps-emo .nm { font-size:11px; }
    .ps-eval { width:100%; padding:2px 3px; font-size:10.5px; text-align:right; background:var(--lumiverse-fill); color:var(--lumiverse-text); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); box-sizing:border-box; }
    .ps-eval:focus { border-color:var(--lumiverse-accent,#6c8cff); outline:none; }
    .ps-track { position:relative; height:8px; border-radius:6px; background:var(--lumiverse-fill-subtle,#2a2a33); overflow:hidden; }
    .ps-fill { position:absolute; top:0; bottom:0; background:var(--lumiverse-accent,#6c8cff); border-radius:6px; }
    .ps-fill.hot { background:#e0683c; }
    .ps-fill.neg { background:#d9a13b; }
    .ps-mid { position:absolute; top:0; bottom:0; left:50%; width:1px; background:var(--lumiverse-border); }
    .ps-val { font-size:10.5px; color:var(--lumiverse-text-muted); text-align:right; }
    .ps-engine { font-size:12px; font-weight:600; padding:6px 10px; border-radius:var(--lumiverse-radius); border:1px solid var(--lumiverse-border); text-align:center; }
    .ps-engine.run { color:#e0a23c; border-color:#e0a23c; background:rgba(224,162,60,0.10); }
    .ps-engine.idle { color:#4fbf67; border-color:#4fbf67; background:rgba(79,191,103,0.07); }
    .ps-pre { white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:10.5px; line-height:1.4; max-height:360px; overflow:auto; padding:8px; background:var(--lumiverse-fill-subtle); border:1px solid var(--lumiverse-border); border-radius:var(--lumiverse-radius); }
  `)

  const tab = ctx.ui.registerDrawerTab({
    id: 'psyche',
    title: 'Psyche',
    shortName: 'Psyche',
    headerTitle: 'Psyche',
    description: "Inspect the run's characters and their feelings",
    keywords: ['psyche', 'emotion', 'mood', 'feelings', 'approval', 'affect'],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4.97 0-9-3.58-9-8 0-4.42 4.03-8 9-8s9 3.13 9 7c0 3.5-3 5-6 5-1.5 0-2 1-1.5 2.5"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/></svg>',
  })

  tab.root.innerHTML = `
    <div class="ps-wrap">
      <div class="ps-engine idle">● idle</div>
      <div class="ps-row between">
        <span class="ps-muted ps-status">Loading…</span>
        <button class="ps-btn ps-refresh">Refresh</button>
      </div>
      <div class="ps-row ps-chars"></div>

      <div class="ps-section ps-detail" style="display:none">
        <div class="ps-row between">
          <h4 class="ps-h ps-d-name" style="margin:0"></h4>
          <label class="ps-row ps-muted"><input type="checkbox" class="ps-present" /> present</label>
        </div>

        <h4 class="ps-h">Approval <span class="ps-muted">— their opinion of you (−10000…+10000, never decays)</span></h4>
        <div class="ps-emo">
          <span class="nm ps-appr-label"></span>
          <div class="ps-track"><div class="ps-mid"></div><div class="ps-fill ps-appr-fill"></div></div>
          <input class="ps-eval ps-appr-val" type="number" min="-10000" max="10000" step="1" />
          <span class="ps-val ps-appr-band"></span>
        </div>

        <h4 class="ps-h">Affect</h4>
        <div class="ps-emos"></div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Run</h4>
        <div class="ps-row">
          <button class="ps-btn danger ps-reset">Reset run</button>
        </div>
        <div class="ps-muted ps-activity">No activity yet.</div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Settings</h4>
        <label class="ps-row"><input type="checkbox" class="ps-en" /> Enabled</label>
        <label class="ps-row"><input type="checkbox" class="ps-texture" /> Human texture (energy-matched replies — flat moods read flat)</label>
        <div><span class="ps-muted">Engine rounds per turn</span><input type="number" class="ps-input ps-rounds" min="1" max="20" /></div>
        <div><span class="ps-muted">Decay rate (0–1, relax toward baseline)</span><input type="number" class="ps-input ps-decay" min="0" max="1" step="0.01" /></div>
        <div><span class="ps-muted">Engine directive (optional)</span><textarea class="ps-ta ps-dir" placeholder="e.g. Slow-burn; keep characters guarded until trust is earned."></textarea></div>
        <div><span class="ps-muted">Engine model (separate connection for Psyche's bookkeeping)</span><select class="ps-input ps-conn"><option value="">Auto — last-used or default connection</option></select></div>
        <div class="ps-row"><button class="ps-btn ps-save-cfg">Save settings</button></div>
      </div>

      <div class="ps-section">
        <h4 class="ps-h">Debug — what the last update sent</h4>
        <div class="ps-row">
          <button class="ps-btn ps-dbg" data-k="update">Mind update</button>
          <button class="ps-btn ps-dbg" data-k="injection">→ Injected directive</button>
          <button class="ps-btn ps-dbg-refresh" title="Re-fetch latest">↻</button>
        </div>
        <div class="ps-muted ps-dbg-meta"></div>
        <pre class="ps-pre ps-dbg-out">Click a step to see the last request sent to the model and its response. Captured per turn.</pre>
      </div>
    </div>
  `

  const q = <T extends HTMLElement>(s: string) => tab.root.querySelector(s) as T
  const status = q<HTMLElement>('.ps-status')
  const charsEl = q<HTMLElement>('.ps-chars')
  const detail = q<HTMLElement>('.ps-detail')
  const dName = q<HTMLElement>('.ps-d-name')
  const presentEl = q<HTMLInputElement>('.ps-present')
  const emosEl = q<HTMLElement>('.ps-emos')
  const apprLabelEl = q<HTMLElement>('.ps-appr-label')
  const apprFillEl = q<HTMLElement>('.ps-appr-fill')
  const apprValEl = q<HTMLInputElement>('.ps-appr-val')
  const apprBandEl = q<HTMLElement>('.ps-appr-band')
  const activity = q<HTMLElement>('.ps-activity')
  const enEl = q<HTMLInputElement>('.ps-en')
  const textureEl = q<HTMLInputElement>('.ps-texture')
  const roundsEl = q<HTMLInputElement>('.ps-rounds')
  const decayEl = q<HTMLInputElement>('.ps-decay')
  const dirEl = q<HTMLTextAreaElement>('.ps-dir')
  const connEl = q<HTMLSelectElement>('.ps-conn')
  let connOptions: { id: string; name: string; provider: string; model: string }[] = []
  let connError = ''
  let agentConnId = ''
  const dbgOut = q<HTMLElement>('.ps-dbg-out')
  const dbgMeta = q<HTMLElement>('.ps-dbg-meta')
  let debugData: any = {}
  let dbgKey = 'injection'
  const engineEl = q<HTMLElement>('.ps-engine')

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

  const selected = (): Character | null =>
    snap?.characters.find((c) => c.id === selectedId) ?? snap?.characters[0] ?? null

  function renderChips() {
    if (!snap || !snap.characters.length) {
      charsEl.innerHTML = ''
      return
    }
    charsEl.innerHTML = snap.characters
      .map(
        (c) =>
          `<span class="ps-chip ${c.id === selected()?.id ? 'sel' : ''} ${c.isPrimary ? 'prim' : ''}" data-id="${c.id}">${esc(
            c.name,
          )}${c.present ? '' : ' ·'}</span>`,
      )
      .join('')
    charsEl.querySelectorAll('.ps-chip').forEach((el) =>
      el.addEventListener('click', () => {
        selectedId = (el as HTMLElement).dataset.id!
        renderDetail()
      }),
    )
  }

  function emotionRow(e: Emotion): string {
    let bar: string
    if (e.kind === 'bipolar') {
      const half = Math.min(50, Math.abs(e.value) * 50)
      const left = e.value < 0 ? 50 - half : 50
      bar = `<div class="ps-track"><div class="ps-mid"></div><div class="ps-fill ${
        e.value < 0 ? 'neg' : ''
      }" style="left:${left}%;width:${half}%"></div></div>`
    } else {
      const w = Math.min(100, Math.max(0, e.value * 100))
      bar = `<div class="ps-track"><div class="ps-fill ${e.value >= 0.8 ? 'hot' : ''}" style="left:0;width:${w}%"></div></div>`
    }
    const min = e.kind === 'bipolar' ? -1 : 0
    return (
      `<div class="ps-emo">` +
      `<span class="nm" title="${esc(e.label)}">${esc(e.label.split(' (')[0])}</span>` +
      bar +
      `<input class="ps-eval" type="number" data-key="${e.key}" value="${e.value.toFixed(2)}" ` +
      `min="${min}" max="1" step="0.01" title="${esc(e.label)} — type a new value (${min}…1)" />` +
      `<span class="ps-val" title="${esc(e.descriptor)}">${esc(e.descriptor)}</span>` +
      `</div>`
    )
  }

  function renderDetail() {
    const c = selected()
    renderChips()
    if (!c) {
      detail.style.display = 'none'
      return
    }
    selectedId = c.id
    detail.style.display = 'flex'
    dName.textContent = `${c.name}${c.isPrimary ? ' (primary)' : ''}`
    presentEl.checked = c.present

    // Approval meter: the ±1000 window is where most play lives; the fill
    // saturates there while the input still takes the full ±10000 scale.
    const appr = c.approval ?? 0
    apprLabelEl.textContent = 'approval'
    const half = Math.min(50, (Math.abs(appr) / 1000) * 50)
    const left = appr < 0 ? 50 - half : 50
    apprFillEl.className = `ps-fill ps-appr-fill ${appr < 0 ? 'neg' : ''}`
    apprFillEl.style.left = `${left}%`
    apprFillEl.style.width = `${half}%`
    apprValEl.value = String(Math.round(appr))
    apprValEl.title = `exact value ${Math.round(appr)}; bar saturates at ±1000, full scale ±10000`
    apprBandEl.textContent = c.approvalLabel ?? ''
    apprBandEl.title = c.approvalLabel ?? ''

    // bipolar axes first, then unipolar in a STABLE canonical order so the
    // editable fields don't reshuffle under the cursor as values change.
    const bip = c.emotions.filter((e) => e.kind === 'bipolar')
    const uni = c.emotions.filter((e) => e.kind === 'unipolar')
    emosEl.innerHTML = [...bip, ...uni].map(emotionRow).join('')
    emosEl.querySelectorAll('.ps-eval').forEach((el) => {
      const inp = el as HTMLInputElement
      inp.addEventListener('change', () => {
        const v = Number(inp.value)
        if (!Number.isFinite(v)) return
        ctx.sendToBackend({ type: 'set_emotion', characterId: c.id, emotion: inp.dataset.key, value: v })
      })
    })
  }

  function render() {
    if (!snap || !snap.characters.length) {
      status.textContent = snap ? 'No characters tracked yet — send a message to begin.' : 'No active run'
      charsEl.innerHTML = ''
      detail.style.display = 'none'
      return
    }
    status.textContent = `${snap.characters.length} character${snap.characters.length > 1 ? 's' : ''}`
    renderDetail()
  }

  const requestState = () => {
    ctx.sendToBackend({ type: 'get_state' })
  }

  function fillConnectionSelect(el: HTMLSelectElement, savedId: string) {
    const opts = ['<option value="">Auto — last-used or default connection</option>']
    for (const c of connOptions) {
      const label = `${c.name} — ${c.provider}/${c.model}`
      opts.push(`<option value="${esc(c.id)}"${c.id === savedId ? ' selected' : ''}>${esc(label)}</option>`)
    }
    if (savedId && !connOptions.some((c) => c.id === savedId)) {
      opts.push(`<option value="${esc(savedId)}" selected>(saved connection ${esc(savedId)})</option>`)
    }
    if (!connOptions.length) {
      const why = connError
        ? `couldn't load connections: ${connError}`
        : 'no connections loaded yet — reopen this tab to retry'
      opts.push(`<option value="" disabled>(${esc(why)})</option>`)
    }
    el.innerHTML = opts.join('')
    el.value = savedId
  }

  function renderConnections() {
    fillConnectionSelect(connEl, agentConnId)
  }

  function renderDebug() {
    tab.root
      .querySelectorAll('.ps-dbg')
      .forEach((b) => b.classList.toggle('sel', (b as HTMLElement).dataset.k === dbgKey))
    if (dbgKey === 'injection') {
      const inj = debugData?.injection
      dbgMeta.textContent = inj ? `injected directive · ${new Date(inj.at).toLocaleString()}` : 'no capture yet'
      dbgOut.textContent = inj?.directive || 'No directive captured yet — take a turn.'
      return
    }
    const t = debugData?.[dbgKey]
    if (!t) {
      dbgMeta.textContent = 'no capture yet'
      dbgOut.textContent = `No ${dbgKey} capture yet — take a turn.`
      return
    }
    dbgMeta.textContent = `${t.meta ?? ''} · ${new Date(t.at).toLocaleString()}`
    dbgOut.textContent =
      `########## REQUEST — sent to the model ##########\n\n${t.request}\n\n` +
      `########## RESPONSE — model output ##########\n\n${t.response}`
  }
  const requestDebug = () => ctx.sendToBackend({ type: 'get_debug' })
  const requestEngine = () => ctx.sendToBackend({ type: 'get_engine' })

  function setEngine(state: string, stage?: string) {
    const running = state === 'running'
    engineEl.className = `ps-engine ${running ? 'run' : 'idle'}`
    engineEl.textContent = running
      ? `● Engine working${stage ? ' — ' + stage : ''}… please wait before replying`
      : '● Idle — safe to reply'
    tab.setBadge(running ? '⏳' : null)
  }

  ctx.sendToBackend({ type: 'get_config' })
  ctx.sendToBackend({ type: 'get_connections' })
  requestState()
  requestDebug()
  requestEngine()
  tab.onActivate(() => {
    requestState()
    requestDebug()
    requestEngine()
    ctx.sendToBackend({ type: 'get_connections' })
  })
  ctx.events.on('CHAT_SWITCHED', () => {
    selectedId = null
    requestState()
    requestDebug()
    requestEngine()
  })

  tab.root.querySelectorAll('.ps-dbg').forEach((b) =>
    b.addEventListener('click', () => {
      dbgKey = (b as HTMLElement).dataset.k!
      renderDebug()
    }),
  )
  q('.ps-dbg-refresh').addEventListener('click', requestDebug)

  q('.ps-refresh').addEventListener('click', requestState)
  presentEl.addEventListener('change', () => {
    const c = selected()
    if (c) ctx.sendToBackend({ type: 'set_present', characterId: c.id, present: presentEl.checked })
  })
  apprValEl.addEventListener('change', () => {
    const c = selected()
    const v = Number(apprValEl.value)
    if (c && Number.isFinite(v)) ctx.sendToBackend({ type: 'set_approval', characterId: c.id, value: v })
  })
  q('.ps-reset').addEventListener('click', async () => {
    const { confirmed } = await ctx.ui.showConfirm({
      title: 'Reset run',
      message: 'Clear all tracked characters and their feelings for this chat?',
      variant: 'danger',
      confirmLabel: 'Reset',
    })
    if (confirmed) ctx.sendToBackend({ type: 'reset_run' })
  })
  q('.ps-save-cfg').addEventListener('click', () => {
    ctx.sendToBackend({
      type: 'set_config',
      config: {
        enabled: enEl.checked,
        maxRounds: Number(roundsEl.value),
        decayRate: Number(decayEl.value),
        directive: dirEl.value,
        agentConnectionId: connEl.value,
        humanTexture: textureEl.checked,
      },
    })
  })

  const unsub = ctx.onBackendMessage((raw: unknown) => {
    const p = raw as any
    switch (p?.type) {
      case 'state': {
        snap = p.snapshot ?? null
        if (selectedId && !snap?.characters.some((c: Character) => c.id === selectedId)) selectedId = null
        render()
        if (p.note) activity.textContent = p.note
        break
      }
      case 'state_changed': {
        activity.textContent = `Last turn: ${p.edits} edits over ${p.rounds} rounds${p.note ? ` — ${p.note}` : ''}`
        requestState()
        requestDebug()
        break
      }
      case 'debug': {
        debugData = p.debug ?? {}
        renderDebug()
        break
      }
      case 'engine': {
        if (p.chatId && snap?.chatId && p.chatId !== snap.chatId) break
        setEngine(p.state, p.stage)
        break
      }
      case 'config': {
        const c = p.config ?? {}
        enEl.checked = c.enabled !== false
        textureEl.checked = c.humanTexture !== false
        roundsEl.value = String(c.maxRounds ?? 8)
        decayEl.value = String(c.decayRate ?? 0.12)
        dirEl.value = c.directive ?? ''
        agentConnId = c.agentConnectionId ?? ''
        renderConnections()
        break
      }
      case 'connections': {
        connOptions = Array.isArray(p.connections) ? p.connections : []
        connError = typeof p.error === 'string' ? p.error : ''
        renderConnections()
        break
      }
    }
  })

  return () => {
    unsub()
    tab.destroy()
    removeStyle()
    ctx.dom.cleanup()
  }
}
