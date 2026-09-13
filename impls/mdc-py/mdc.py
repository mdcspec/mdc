#!/usr/bin/env python3
"""MDC (Markdown Checklists) — a second, independent implementation.

Conformance level CONF-L1 (parse + lint), Python 3 standard library only.

Strategy: a line-oriented parser. Task-item lines are detected by pattern,
nesting depth is computed from leading indentation, and the attribute block is
extracted and tokenised by hand. No CommonMark library is used — the point is a
genuinely different parsing strategy from the JavaScript reference (which drives
a remark/unified pipeline).

CLI (the conformance contract):
    python3 mdc.py parse <file> --json
    python3 mdc.py lint  <file> --json

Exit codes: 0 success; 1 usage / not-MDC / unsupported-version.
"""
from __future__ import annotations

import json
import re
import sys

# --- slugs and reserved sets -------------------------------------------------

SLUG_RE = re.compile(r"^[A-Za-z0-9_/-]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REPEAT_RE = re.compile(r"^(done|due)\+\d+[dwm]$")

RESERVED_KEYS = {"due", "done", "repeat", "needs", "verify", "reason"}

MALFORMED_MSG = "attribute block does not tokenize; kept as text"

# A task-item line: <indent><marker> [<mark>] <text...>
TASK_RE = re.compile(r"^(\s*)([-*+])[ \t]+\[([ xX])\][ \t]+(.*)$")
# A prose (non-task) list item: <indent><marker> <text...>
LIST_RE = re.compile(r"^(\s*)([-*+])[ \t]+(.*)$")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.*?)[ \t]*$")


# --- frontmatter -------------------------------------------------------------

def read_logical_lines(path):
    """Read file, strip a leading UTF-8 BOM, split into logical lines with the
    trailing CR removed (CRLF tolerance). Returns list of str (no line ending)."""
    with open(path, "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8-sig")
    lines = text.split("\n")
    # A trailing newline produces a final empty element; keep line indexing
    # honest but drop the phantom last empty line for iteration purposes only.
    return [ln[:-1] if ln.endswith("\r") else ln for ln in lines]


def _looks_numeric(token):
    try:
        float(token)
        return True
    except ValueError:
        return False


def parse_frontmatter(lines):
    """Return (frontmatter_dict, mdc_is_string, started_line) or None when there
    is no frontmatter block. frontmatter values are all represented as strings."""
    if not lines or lines[0].strip() != "---":
        return None
    fm = {}
    mdc_is_string = False
    started_line = None
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return None
    for i in range(1, end):
        line = lines[i]
        if not line.strip():
            continue
        if line[:1] in (" ", "\t"):
            continue  # nested/continuation — not consulted in v0
        if ":" not in line:
            continue
        key, _, rawval = line.partition(":")
        key = key.strip()
        val = rawval.strip()
        quoted = False
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
            quoted = True
        fm[key] = val
        if key == "mdc":
            mdc_is_string = quoted or not _looks_numeric(rawval.strip())
        if key == "started":
            started_line = i + 1
    return fm, mdc_is_string, started_line, end


# --- attribute block ---------------------------------------------------------

def split_trailing_block(text):
    """Given trimmed item text, split off a trailing {...} block if present.
    Returns (text_without_block, block_str_or_None). The block must be preceded
    by a space and there must be non-empty text before it (ITEM-3)."""
    if not text.endswith("}"):
        return text, None
    idx = text.rfind("{")
    if idx <= 0:
        return text, None
    if text[idx - 1] != " ":
        return text, None
    before = text[:idx].rstrip()
    if before == "":
        return text, None
    return before, text[idx:]


def tokenize_block(inner):
    """Split the inside of a {...} block on whitespace outside double quotes.
    Returns a list of tokens, or None if a quote is left unbalanced."""
    tokens = []
    cur = ""
    inq = False
    for ch in inner:
        if ch == '"':
            inq = not inq
            cur += ch
        elif ch == " " and not inq:
            if cur:
                tokens.append(cur)
                cur = ""
        else:
            cur += ch
    if cur:
        tokens.append(cur)
    if inq:
        return None
    return tokens


def _valid_value(val):
    if val.startswith('"'):
        return val.endswith('"') and len(val) >= 2
    return not any(c in val for c in ('"', "{", "}"))


def valid_token(tok):
    if tok[:1] in ("#", ".", "@"):
        return bool(SLUG_RE.match(tok[1:]))
    if "=" in tok:
        key, _, val = tok.partition("=")
        if not SLUG_RE.match(key):
            return False
        return _valid_value(val)
    return False


def unquote(val):
    if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
        return val[1:-1]
    return val


def parse_attributes(block, line):
    """Parse a trailing {...} block. Returns a dict with id/classes/assignee/
    attrs/needs and the parser warnings, plus a 'malformed' flag."""
    result = {
        "id": None,
        "classes": [],
        "assignee": None,
        "attrs": {},
        "needs": None,
        "warnings": [],
        "malformed": False,
    }
    inner = block[1:-1]
    tokens = tokenize_block(inner)
    if tokens is None or len(tokens) == 0 or any(not valid_token(t) for t in tokens):
        result["malformed"] = True
        result["warnings"].append(
            {"rule": "malformed-attributes", "line": line, "message": MALFORMED_MSG}
        )
        return result

    for tok in tokens:
        if tok[0] == "#":
            if result["id"] is None:
                result["id"] = tok[1:]
            else:
                result["warnings"].append({
                    "rule": "multiple-ids", "line": line,
                    "message": f"multiple ids; first (#{result['id']}) wins",
                })
        elif tok[0] == ".":
            result["classes"].append(tok[1:])
        elif tok[0] == "@":
            if result["assignee"] is None:
                result["assignee"] = tok[1:]
            else:
                result["warnings"].append({
                    "rule": "multiple-assignees", "line": line,
                    "message": f"multiple assignees; first (@{result['assignee']}) wins",
                })
        else:
            key, _, val = tok.partition("=")
            if key == "needs":
                needs = [unquote(v) for v in val.split(",")]
                result["needs"] = needs
                result["attrs"]["needs"] = needs
            else:
                result["attrs"][key] = unquote(val)
    return result


# --- states ------------------------------------------------------------------

def classify_state(mark, text):
    """Return (state, model_text). Cancelled = done bracket whose entire text is
    a single ~~...~~ span (no interior ~~)."""
    if mark == " ":
        return "open", text
    # mark is x or X -> done, unless a single strikethrough span wraps all text
    if (text.startswith("~~") and text.endswith("~~") and len(text) >= 4
            and "~~" not in text[2:-2]):
        return "cancelled", text[2:-2]
    return "done", text


# --- item construction -------------------------------------------------------

def build_item(indent, marker, mark, rawtext, line, section, depth, raw_line):
    text = rawtext.strip()
    body, block = split_trailing_block(text)
    id_ = None
    classes = []
    assignee = None
    attrs = {}
    needs = []
    warnings = []
    malformed = False
    if block is not None:
        parsed = parse_attributes(block, line)
        warnings = parsed["warnings"]
        if parsed["malformed"]:
            malformed = True
            body = text  # braces stay in the text (L0 safety)
        else:
            id_ = parsed["id"]
            classes = parsed["classes"]
            assignee = parsed["assignee"]
            attrs = parsed["attrs"]
            needs = parsed["needs"] or []

    state, model_text = classify_state(mark, body)

    item = {
        "id": id_,
        "text": model_text,
        "state": state,
        "assignee": assignee,
        "classes": classes,
        "attrs": attrs,
        "section": section,
        "line": line,
        "children": [],
        "computed": None,
        # private fields (stripped before output)
        "_needs": needs,
        "_depth": depth,
        "_raw": raw_line,
        "_marker": marker,
        "_mark": mark,
        "_malformed": malformed,
        "_gate": "gate" in classes,
        "_optional": "optional" in classes,
        "_terminal": state in ("done", "cancelled"),
    }
    return item, warnings


def parse_items(lines, fm_end):
    """Parse the body after frontmatter into a nested item tree + warnings.
    Returns (top_level_items, all_items_in_doc_order, warnings)."""
    top = []
    all_items = []
    warnings = []
    section = None
    # stack of dicts: {indent, is_task, item}
    stack = []

    for idx in range(fm_end + 1, len(lines)):
        line = lines[idx]
        lineno = idx + 1
        stripped = line.strip()

        hm = HEADING_RE.match(line)
        if hm:
            section = hm.group(2)
            continue

        tm = TASK_RE.match(line)
        if tm:
            indent = len(tm.group(1).expandtabs(4))
            # pop deeper-or-equal list contexts
            while stack and stack[-1]["indent"] >= indent:
                stack.pop()
            depth = len(stack)
            item, w = build_item(
                tm.group(1), tm.group(2), tm.group(3), tm.group(4),
                lineno, section, depth, line,
            )
            warnings.extend(w)
            all_items.append(item)
            parent = stack[-1] if stack else None
            if parent is not None and parent["is_task"]:
                parent["item"]["children"].append(item)
            else:
                top.append(item)
            stack.append({"indent": indent, "is_task": True, "item": item})
            continue

        lm = LIST_RE.match(line)
        if lm:
            indent = len(lm.group(1).expandtabs(4))
            while stack and stack[-1]["indent"] >= indent:
                stack.pop()
            stack.append({"indent": indent, "is_task": False, "item": None})
            continue

        # Blank line or prose: does not change list nesting in this model.
        # (Indentation of subsequent list items resolves nesting via the stack.)

    return top, all_items, warnings


# --- derived semantics -------------------------------------------------------

def find_cycle_members(all_items, id_map):
    """Return the set of ids that lie on a needs cycle (local edges only)."""
    graph = {}
    for it in all_items:
        if it["id"] and it["id"] not in graph:
            targets = []
            for t in it["_needs"]:
                if "#" in t:
                    continue
                if t in id_map:
                    targets.append(t)
            graph[it["id"]] = targets

    members = set()

    def reaches_self(start):
        seen = set()
        stack = list(graph.get(start, []))
        while stack:
            n = stack.pop()
            if n == start:
                return True
            if n in seen:
                continue
            seen.add(n)
            stack.extend(graph.get(n, []))
        return False

    for node in graph:
        if reaches_self(node):
            members.add(node)
    return members


def compute_derived(top, all_items):
    id_map = {}
    for it in all_items:
        if it["id"] and it["id"] not in id_map:
            id_map[it["id"]] = it

    cycle_members = find_cycle_members(all_items, id_map)

    # gates that actively gate: .gate items that are not terminal, by line order
    gates = sorted(
        [g for g in all_items if g["_gate"] and not g["_terminal"]],
        key=lambda g: g["line"],
    )

    def gate_key(g):
        return g["id"] if g["id"] else f"<line {g['line']}>"

    def own_blocked_by(it):
        out = []
        for t in it["_needs"]:
            if "#" in t:
                continue  # cross-file: never a blocking edge
            if t not in id_map:
                out.append(t)  # dangling
            elif not id_map[t]["_terminal"]:
                out.append(t)
        return out

    def gated_by(it):
        if it["_optional"]:
            return []
        return [gate_key(g) for g in gates if g["line"] < it["line"]]

    def progress(it):
        if not it["children"]:
            return None
        done = total = 0
        stack = list(it["children"])
        while stack:
            c = stack.pop()
            if c["state"] != "cancelled":
                total += 1
                if c["state"] == "done":
                    done += 1
            stack.extend(c["children"])
        return {"done": done, "total": total}

    def resolve(it, parent_blocked_by):
        own = own_blocked_by(it)
        combined = list(own)
        for x in parent_blocked_by:
            if x not in combined:
                combined.append(x)
        in_cycle = it["id"] in cycle_members and not it["_terminal"]
        blocked = bool(combined) or in_cycle
        gb = gated_by(it)
        all_children_terminal = all(c["_terminal"] for c in it["children"])
        actionable = (
            it["state"] == "open"
            and not blocked
            and not gb
            and all_children_terminal
        )
        it["computed"] = {
            "blocked": blocked,
            "blockedBy": combined,
            "gatedBy": gb,
            "actionable": actionable,
            "progress": progress(it),
        }
        for c in it["children"]:
            resolve(c, combined)

    for it in top:
        resolve(it, [])


# --- model output ------------------------------------------------------------

MODEL_KEYS = ["id", "text", "state", "assignee", "classes", "attrs",
              "section", "line", "children", "computed"]


def clean_item(it):
    out = {}
    for k in MODEL_KEYS:
        if k == "children":
            out[k] = [clean_item(c) for c in it["children"]]
        else:
            out[k] = it[k]
    return out


def build_model(path):
    """Return (model_dict, None) or (None, error_token)."""
    lines = read_logical_lines(path)
    fm = parse_frontmatter(lines)
    if fm is None:
        return None, "not-mdc"
    frontmatter, mdc_is_string, _started_line, fm_end = fm
    if "mdc" not in frontmatter or not mdc_is_string:
        return None, "not-mdc"
    version = frontmatter["mdc"]
    if version != "0.1":
        return None, "unsupported-version"

    top, all_items, warnings = parse_items(lines, fm_end)
    compute_derived(top, all_items)

    model = {
        "mdc": version,
        "kind": frontmatter.get("kind", "list"),
        "title": frontmatter.get("title", None),
        "frontmatter": frontmatter,
        "items": [clean_item(it) for it in top],
        "warnings": [{"rule": w["rule"], "line": w["line"], "message": w["message"]}
                     for w in warnings],
    }
    return model, None


# --- canonical line (for non-canonical-state detection) ----------------------

def quote_value(val):
    if val == "" or any(c in val for c in (" ", "\t", "{", "}")):
        return '"' + val + '"'
    return val


def canonical_block(it):
    parts = []
    if it["id"]:
        parts.append("#" + it["id"])
    for c in sorted(it["classes"]):
        parts.append("." + c)
    if it["assignee"]:
        parts.append("@" + it["assignee"])
    for key in sorted(it["attrs"].keys()):
        if key == "needs":
            val = ",".join(it["attrs"]["needs"])
        else:
            val = it["attrs"][key]
        parts.append(key + "=" + quote_value(val))
    if not parts:
        return ""
    return "{" + " ".join(parts) + "}"


def canonical_line(it):
    indent = "  " * it["_depth"]
    mark = " " if it["state"] == "open" else "x"
    if it["state"] == "cancelled":
        ctext = "~~" + it["text"] + "~~"
    else:
        ctext = it["text"]
    block = canonical_block(it)
    line = f"{indent}- [{mark}] {ctext}"
    if block:
        line += " " + block
    return line


# --- lint --------------------------------------------------------------------

def lint_document(path):
    lines = read_logical_lines(path)
    fm = parse_frontmatter(lines)
    if fm is None:
        return []
    frontmatter, mdc_is_string, started_line, fm_end = fm
    if "mdc" not in frontmatter or not mdc_is_string or frontmatter["mdc"] != "0.1":
        return []

    top, all_items, _warnings = parse_items(lines, fm_end)
    compute_derived(top, all_items)

    id_map = {}
    for it in all_items:
        if it["id"] and it["id"] not in id_map:
            id_map[it["id"]] = it
    cycle_members = find_cycle_members(all_items, id_map)

    findings = []

    def add(rule, severity, line, id_, message):
        findings.append({"rule": rule, "severity": severity, "line": line,
                         "id": id_, "message": message})

    # frontmatter: invalid started date
    if "started" in frontmatter and not DATE_RE.match(frontmatter["started"]):
        add("invalid-date", "error", started_line, None,
            f'invalid date "{frontmatter["started"]}" for started; expected YYYY-MM-DD')

    # unpinned template
    if frontmatter.get("kind") == "run" and "template" in frontmatter:
        tmpl = frontmatter["template"]
        if "@" not in tmpl:
            add("unpinned-template", "warning", None, None,
                f'run pins template "{tmpl}" without an @version; '
                "it may drift if the template changes")

    seen_ids = set()
    for it in all_items:
        line = it["line"]
        iid = it["id"]

        if it["_malformed"]:
            add("malformed-attributes", "error", line, None, MALFORMED_MSG)
            # fmt leaves malformed lines byte-untouched -> no non-canonical-state
            continue

        # multiple ids / assignees (re-derive from the parser warnings)
        # recorded during parse via warnings; recompute here from raw block.
        for w in _line_sigil_warnings(it):
            add(w["rule"], "error", line, iid, w["message"])

        # duplicate id
        if iid:
            if iid in seen_ids:
                add("duplicate-id", "error", line, iid, f'duplicate id "{iid}"')
            else:
                seen_ids.add(iid)

        # needs: dangling, cross-file
        for t in it["_needs"]:
            if "#" in t:
                add("unresolved-cross-file-ref", "warning", line, iid,
                    f'needs references cross-file target "{t}"; '
                    "v0 tooling does not resolve it")
            elif t not in id_map:
                add("dangling-needs", "error", line, iid,
                    f'needs references unknown id "{t}"')

        # needs cycle
        if iid in cycle_members:
            add("needs-cycle", "error", line, iid, "item is in a needs cycle")

        # dates
        for datekey in ("due", "done"):
            if datekey in it["attrs"] and not DATE_RE.match(it["attrs"][datekey]):
                add("invalid-date", "error", line, iid,
                    f'invalid date "{it["attrs"][datekey]}" for {datekey}; '
                    "expected YYYY-MM-DD")

        # repeat
        if "repeat" in it["attrs"] and not REPEAT_RE.match(it["attrs"]["repeat"]):
            add("invalid-repeat", "error", line, iid,
                f'invalid repeat "{it["attrs"]["repeat"]}"; '
                "expected (done|due)+<n><d|w|m>")

        # unknown key
        for key in it["attrs"]:
            if key not in RESERVED_KEYS and not key.startswith("x-"):
                add("unknown-key", "warning", line, iid,
                    f'unknown key "{key}"; extension keys must use the x- prefix')

        # cancelled without reason
        if it["state"] == "cancelled" and "reason" not in it["attrs"]:
            add("cancelled-without-reason", "warning", line, iid,
                "cancelled item has no reason=")

        # non-canonical state (fmt would rewrite the line)
        if canonical_line(it) != it["_raw"]:
            add("non-canonical-state", "warning", line, iid,
                "not in canonical form; fmt would rewrite this line")

    # order by line, then rule name ascending; None line sorts first (frontmatter)
    findings.sort(key=lambda f: (f["line"] if f["line"] is not None else -1, f["rule"]))
    for f in findings:
        f.pop("line", None)
    return findings


def _line_sigil_warnings(it):
    """Recompute multiple-ids / multiple-assignees findings for an item by
    re-parsing its trailing block (the model already dropped the extras)."""
    out = []
    # _raw includes indent+marker+bracket; re-extract the text after the bracket
    tm = TASK_RE.match(it["_raw"])
    if not tm:
        return out
    text = tm.group(4).strip()
    _, block = split_trailing_block(text)
    if block is None:
        return out
    parsed = parse_attributes(block, it["line"])
    for w in parsed["warnings"]:
        if w["rule"] in ("multiple-ids", "multiple-assignees"):
            out.append(w)
    return out


# --- CLI ---------------------------------------------------------------------

def main(argv):
    if len(argv) < 2:
        sys.stderr.write("usage: mdc <parse|lint> <file> --json\n")
        return 1
    verb = argv[0]
    # locate file arg (first non-flag after verb)
    file_arg = None
    for a in argv[1:]:
        if not a.startswith("-"):
            file_arg = a
            break
    if file_arg is None:
        sys.stderr.write("usage: mdc <parse|lint> <file> --json\n")
        return 1

    if verb == "parse":
        try:
            model, err = build_model(file_arg)
        except FileNotFoundError:
            sys.stderr.write(f"cannot read {file_arg}\n")
            return 1
        if err is not None:
            print(json.dumps({"error": err}))
            return 1
        print(json.dumps(model))
        return 0

    if verb == "lint":
        try:
            findings = lint_document(file_arg)
        except FileNotFoundError:
            sys.stderr.write(f"cannot read {file_arg}\n")
            return 1
        print(json.dumps(findings))
        return 0

    sys.stderr.write(f"unknown verb: {verb}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
