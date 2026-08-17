/**
 * Derived computation over the parsed item tree: blocked / gates / rollups /
 * actionable / next. Derived state is computed, never stored in the file.
 */

/** @typedef {import('./parse.js').MdcDocument} MdcDocument */
/** @typedef {import('./parse.js').MdcItem} MdcItem */

/**
 * @typedef {Object} MdcStatus
 * @property {{ open: number, done: number, cancelled: number, total: number }} totals
 * @property {{ done: number, total: number }} progress Cancelled items excluded from both counts.
 * @property {string[]} blocked Ids (or `"<line N>"` for id-less items) of blocked items.
 * @property {string[]} actionable Ids in document order.
 * @property {string[]} doing Ids of items carrying the `.doing` class.
 * @property {Array<{ section: string | null, done: number, total: number }>} sections Per-section rollup in document order.
 */

/** @param {MdcItem} item @returns {boolean} */
function isTerminal(item) {
  return item.state === 'done' || item.state === 'cancelled';
}

/** @param {MdcItem} item @returns {string[]} */
function needsOf(item) {
  return Array.isArray(item.attrs.needs) ? item.attrs.needs : [];
}

/**
 * A `needs=` target of the form `<path>#<id>` is a cross-file reference:
 * reserved syntax, opaque to v0. A local id can never contain `#` (not a slug
 * char), so `#` is the unambiguous discriminator. v0 preserves the target
 * verbatim in `attrs.needs` but excludes it from dependency semantics — it is
 * neither a blocking edge (v0 cannot know the external item's state) nor a
 * dangling local id; resolution is a `.mddb`/tooling concern.
 *
 * @param {string} target A single `needs=` target.
 * @returns {boolean}
 */
export function isCrossFileRef(target) {
  return target.includes('#');
}

/** @param {MdcItem} item @returns {string} */
function itemKey(item) {
  return item.id ?? `<line ${item.line}>`;
}

/**
 * Depth-first flattening of the item tree in document order (parents precede
 * their children).
 *
 * @param {MdcDocument} doc
 * @returns {Array<{ item: MdcItem, parent: MdcItem | null, depth: number }>}
 */
export function flattenItems(doc) {
  /** @type {Array<{ item: MdcItem, parent: MdcItem | null, depth: number }>} */
  const flat = [];
  /** @param {MdcItem[]} items @param {MdcItem | null} parent @param {number} depth */
  const walk = (items, parent, depth) => {
    for (const item of items) {
      flat.push({ item, parent, depth });
      walk(item.children, item, depth + 1);
    }
  };
  walk(doc.items, null, 0);
  return flat;
}

/**
 * Items that are members of a `needs` cycle (an item that can reach itself via
 * resolved `needs=` edges; references resolve to the first occurrence of an id).
 *
 * @param {MdcDocument} doc
 * @returns {Set<MdcItem>}
 */
export function needsCycleMembers(doc) {
  const flat = flattenItems(doc);
  /** @type {Map<string, MdcItem>} */
  const byId = new Map();
  for (const { item } of flat) {
    if (item.id !== null && !byId.has(item.id)) byId.set(item.id, item);
  }
  /** @type {Set<MdcItem>} */
  const members = new Set();
  for (const { item } of flat) {
    if (needsOf(item).length === 0) continue;
    const stack = [item];
    const seen = new Set();
    let found = false;
    while (stack.length > 0 && !found) {
      const current = /** @type {MdcItem} */ (stack.pop());
      for (const target of needsOf(current)) {
        if (isCrossFileRef(target)) continue; // cross-file edges never form a local cycle
        const resolved = byId.get(target);
        if (!resolved) continue;
        if (resolved === item) {
          found = true;
          break;
        }
        if (!seen.has(resolved)) {
          seen.add(resolved);
          stack.push(resolved);
        }
      }
    }
    if (found) members.add(item);
  }
  return members;
}

/**
 * Fill `item.computed` (blocked, blockedBy, gatedBy, actionable, progress) for
 * every item in the tree, applying `needs` edges, `.gate` document-order
 * gating, parent/child inheritance, and cancelled-exclusion rollups.
 *
 * @param {MdcDocument} doc Parsed document whose items lack (or have stale) `computed`.
 * @returns {MdcDocument} The same document with `computed` populated.
 */
export function computeDerived(doc) {
  const flat = flattenItems(doc);
  /** @type {Map<string, MdcItem>} */
  const byId = new Map();
  for (const { item } of flat) {
    if (item.id !== null && !byId.has(item.id)) byId.set(item.id, item);
  }
  const cycleMembers = needsCycleMembers(doc);
  const gates = flat.map((f) => f.item).filter((item) => item.classes.includes('gate'));
  const gateKeys = [...new Set(gates.map(itemKey))];

  for (const { item, parent } of flat) {
    /** @type {string[]} */
    const ownBlockedBy = [];
    for (const target of needsOf(item)) {
      if (isCrossFileRef(target)) continue; // reserved, unresolved in v0 — never a blocking edge
      const resolved = byId.get(target);
      if (!resolved || !isTerminal(resolved)) ownBlockedBy.push(target);
    }
    const inherited = parent ? parent.computed : null;
    const blockedBy = [...new Set([...ownBlockedBy, ...(inherited?.blockedBy ?? [])])];

    const ownGatedBy = item.classes.includes('optional')
      ? []
      : gates.filter((g) => g.line < item.line && !isTerminal(g)).map(itemKey);
    const gatedKeySet = new Set([...ownGatedBy, ...(inherited?.gatedBy ?? [])]);
    // .optional is excluded from gating entirely — directly and by inheritance
    // through a gated parent (DER-3/DER-4 resolved in .optional's favor).
    const gatedBy = item.classes.includes('optional') ? [] : gateKeys.filter((key) => gatedKeySet.has(key));

    // A needs cycle blocks only its non-terminal members (they are mutually
    // deadlocked); a done/cancelled cycle member no longer blocks itself or its
    // dependents. Dangling and non-terminal targets are already in blockedBy.
    const blocked =
      blockedBy.length > 0 || (cycleMembers.has(item) && !isTerminal(item)) || (inherited?.blocked ?? false);
    item.computed = { blocked, blockedBy, gatedBy, actionable: false, progress: null };
  }

  /**
   * Done/total over all transitive descendants, cancelled excluded from both.
   * @param {MdcItem} item
   * @returns {{ done: number, total: number }}
   */
  const countDescendants = (item) => {
    let done = 0;
    let total = 0;
    for (const child of item.children) {
      if (child.state !== 'cancelled') {
        total++;
        if (child.state === 'done') done++;
      }
      const sub = countDescendants(child);
      done += sub.done;
      total += sub.total;
    }
    return { done, total };
  };

  for (const { item } of flat) {
    const { blocked, gatedBy } = item.computed;
    item.computed.actionable =
      item.state === 'open' && !blocked && gatedBy.length === 0 && item.children.every(isTerminal);
    item.computed.progress = item.children.length > 0 ? countDescendants(item) : null;
  }
  return doc;
}

/**
 * Actionable items in document order — the payload of `mdc next --json`.
 *
 * @param {MdcDocument} doc Document with `computed` populated.
 * @returns {MdcItem[]}
 */
export function nextItems(doc) {
  return flattenItems(doc)
    .map((f) => f.item)
    .filter((item) => item.computed.actionable);
}

/**
 * @typedef {Object} ReportEntry
 * @property {string} id Item id, or `"<line N>"` when id-less.
 * @property {string} text
 * @property {string | null} assignee
 * @property {string[]} [blockedBy] Present in the `blocked` bucket when needs/cycle block it.
 * @property {string[]} [gatedBy] Present in the `blocked` bucket when a `.gate` blocks it.
 * @property {boolean} [pendingChildren] In `blocked` with no needs/gate cause: waiting on children.
 * @property {string | null} [done] `done=` date, in the `done` bucket.
 * @property {string | null} [reason] `reason=`, in the `cancelled` bucket.
 */

/**
 * Standup-shaped view backing `mdc report`: every item sorted into exactly one
 * bucket — done, in-progress (`.doing`), ready (actionable), blocked (open but
 * not ready, with its cause), or cancelled — plus a per-assignee load rollup.
 * Pure read over the computed model; writes nothing.
 *
 * @param {MdcDocument} doc Document with `computed` populated.
 * @returns {{
 *   title: string | null,
 *   progress: { done: number, total: number },
 *   done: ReportEntry[], inProgress: ReportEntry[], ready: ReportEntry[],
 *   blocked: ReportEntry[], cancelled: ReportEntry[],
 *   byAssignee: Array<{ assignee: string, done: number, doing: number, open: number }>,
 * }}
 */
export function reportData(doc) {
  /** @type {ReportEntry[]} */
  const done = [];
  /** @type {ReportEntry[]} */
  const inProgress = [];
  /** @type {ReportEntry[]} */
  const ready = [];
  /** @type {ReportEntry[]} */
  const blocked = [];
  /** @type {ReportEntry[]} */
  const cancelled = [];
  /** @type {Map<string, { assignee: string, done: number, doing: number, open: number }>} */
  const load = new Map();
  const bump = (/** @type {string | null} */ who, /** @type {'done'|'doing'|'open'} */ key) => {
    if (who === null) return;
    if (!load.has(who)) load.set(who, { assignee: who, done: 0, doing: 0, open: 0 });
    /** @type {any} */ (load.get(who))[key]++;
  };

  for (const { item } of flattenItems(doc)) {
    const base = { id: itemKey(item), text: item.text, assignee: item.assignee };
    if (item.state === 'cancelled') {
      const reason = item.attrs.reason;
      cancelled.push({ ...base, reason: typeof reason === 'string' ? reason : null });
    } else if (item.state === 'done') {
      const d = item.attrs.done;
      done.push({ ...base, done: typeof d === 'string' ? d : null });
      bump(item.assignee, 'done');
    } else if (item.classes.includes('doing')) {
      inProgress.push(base);
      bump(item.assignee, 'doing');
    } else if (item.computed.actionable) {
      ready.push(base);
      bump(item.assignee, 'open');
    } else {
      const { blockedBy, gatedBy } = item.computed;
      /** @type {ReportEntry} */
      const entry = { ...base };
      if (blockedBy.length > 0) entry.blockedBy = blockedBy;
      if (gatedBy.length > 0) entry.gatedBy = gatedBy;
      if (blockedBy.length === 0 && gatedBy.length === 0) entry.pendingChildren = true;
      blocked.push(entry);
      bump(item.assignee, 'open');
    }
  }

  return {
    title: doc.title ?? null,
    progress: { done: done.length, total: done.length + inProgress.length + ready.length + blocked.length },
    done,
    inProgress,
    ready,
    blocked,
    cancelled,
    byAssignee: [...load.values()],
  };
}

/**
 * Aggregate report backing `mdc status`.
 *
 * @param {MdcDocument} doc Document with `computed` populated.
 * @returns {MdcStatus}
 */
export function statusReport(doc) {
  const items = flattenItems(doc).map((f) => f.item);
  const totals = { open: 0, done: 0, cancelled: 0, total: items.length };
  const progress = { done: 0, total: 0 };
  /** @type {string[]} */
  const blocked = [];
  /** @type {string[]} */
  const actionable = [];
  /** @type {string[]} */
  const doing = [];
  /** @type {Map<string | null, { section: string | null, done: number, total: number }>} */
  const sections = new Map();

  for (const item of items) {
    totals[item.state]++;
    if (!sections.has(item.section)) sections.set(item.section, { section: item.section, done: 0, total: 0 });
    const rollup = /** @type {{ section: string | null, done: number, total: number }} */ (sections.get(item.section));
    if (item.state !== 'cancelled') {
      progress.total++;
      rollup.total++;
      if (item.state === 'done') {
        progress.done++;
        rollup.done++;
      }
    }
    if (item.computed.blocked) blocked.push(itemKey(item));
    if (item.computed.actionable) actionable.push(itemKey(item));
    if (item.classes.includes('doing')) doing.push(itemKey(item));
  }
  return { totals, progress, blocked, actionable, doing, sections: [...sections.values()] };
}
