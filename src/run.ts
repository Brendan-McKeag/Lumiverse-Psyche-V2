declare const spindle: import('lumiverse-spindle-types').SpindleAPI

/* ------------------------------------------------------------------ *
 * Psyche (core fork) — plugin-side run glue
 *
 * The run-state types, approval ledger, and directive renderer live in
 * @psyche/core; this module re-exports them for the plugin's import sites
 * and keeps only what genuinely belongs to the plugin: storage paths and
 * the world-book injection provisioning, which talk to the spindle host API.
 * ------------------------------------------------------------------ */

export * from '@psyche/core/state'
export * from '@psyche/core/approval'
export * from '@psyche/core/directive'

export const runPath = (chatId: string) => `runs/${chatId}.json`

/* ------------------- injection-entry provisioning ------------------ */
/*
 * Live state reaches the visible reply through ONE world-book entry per
 * character card, force-injected (and content-overridden) at generation time
 * by the world-info interceptor. The entry is disabled at rest, so when the
 * extension is turned off it injects nothing and the prompt is fully normal.
 *
 * We never touch the user's own books — we own a dedicated "<name> — Psyche"
 * book per card and remember it in per-character meta.
 */

export const PSYCHE_EXT = 'psyche'
export const injectMetaPath = (cid: string) => `inject/${cid}.json`

interface InjectMeta {
  bookId: string
  entryId: string
}

/** True when a world-info entry is our injection placeholder. */
export function isInjectionEntry(extensions: Record<string, unknown> | undefined): boolean {
  const wf = extensions?.[PSYCHE_EXT] as { inject?: boolean } | undefined
  return Boolean(wf?.inject)
}

/**
 * Ensure the card character has our dedicated book + placeholder entry, and
 * return the entry id. Idempotent and cheap on the warm path (one storage
 * read). Safe to call once per turn from the after-reply handler.
 */
export async function ensureInjectionEntry(
  characterId: string,
  characterName: string,
  userId?: string,
): Promise<string | null> {
  try {
    const meta = await spindle.storage.getJson<InjectMeta | null>(injectMetaPath(characterId), {
      fallback: null,
    })
    if (meta?.entryId) {
      const entry = await spindle.world_books.entries.get(meta.entryId, userId).catch(() => null)
      if (entry) {
        if (entry.disabled || !entry.constant) {
          await spindle.world_books.entries
            .update(meta.entryId, { disabled: false, constant: true }, userId)
            .catch(() => {})
        }
        return meta.entryId
      }
    }

    // Provision a fresh book + entry and attach the book to the card.
    const book = await spindle.world_books.create(
      {
        name: `${characterName || 'Character'} — Psyche`,
        description: 'Live emotional state injected by the Psyche extension. Managed automatically.',
        metadata: { psyche: true },
      },
      userId,
    )
    const entry = await spindle.world_books.entries.create(
      book.id,
      {
        comment: '[Psyche] live emotional state',
        content: '(emotional state will appear here while Psyche is active)',
        key: ['__psyche_state__'],
        // CONSTANT + enabled: a constant ("always-on") entry is injected into
        // every prompt regardless of keywords — the most reliable world-info
        // mechanism there is. We keep its CONTENT current by overwriting it each
        // turn, so there is no dependence on forced/mutated. The panel toggle is
        // honored by a world-info interceptor that disables it when off.
        disabled: false,
        constant: true,
        extensions: { [PSYCHE_EXT]: { inject: true } },
      },
      userId,
    )

    const char = await spindle.characters.get(characterId, userId).catch(() => null)
    const current = char?.world_book_ids ?? []
    if (!current.includes(book.id)) {
      await spindle.characters.update(characterId, { world_book_ids: [...current, book.id] }, userId)
    }

    await spindle.storage.setJson(injectMetaPath(characterId), { bookId: book.id, entryId: entry.id })
    spindle.log.info(`[psyche] provisioned injection entry ${entry.id} for character ${characterId}`)
    return entry.id
  } catch (err) {
    spindle.log.error(`[psyche] ensureInjectionEntry failed: ${String(err)}`)
    return null
  }
}
