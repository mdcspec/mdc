// Public programmatic API for @mdcspec/mdc.
//
// The CLI (./cli.js) is the primary surface; this barrel is the stable
// entry point for embedding the reference parser, model, linter, formatter,
// and mutation verbs in another tool (e.g. the MCP server). Internal module
// layout under ./src is not part of the public API — import from here.

export { parseDocument } from './parse.js';
export {
  statusReport,
  nextItems,
  reportData,
  computeDerived,
  flattenItems,
} from './model.js';
export { lintDocument } from './lint.js';
export { formatDocument } from './fmt.js';
export {
  check,
  uncheck,
  cancel,
  claim,
  unclaim,
  start,
  unstart,
  note,
  edit,
  addItem,
  PreconditionError,
} from './mutate.js';
export { cutRun } from './cut.js';
