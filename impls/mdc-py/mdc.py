#!/usr/bin/env python3
"""MDC (Markdown Checklists) — a second, independent implementation.

Conformance level CONF-L2 (parse + lint + fmt + mutate + add + note + edit +
cut), Python 3 standard library only.

Strategy: a line-oriented parser. Task-item lines are detected by pattern,
nesting depth is computed from leading indentation, and the attribute block is
extracted and tokenised by hand. No CommonMark library is used — a genuinely
different parsing strategy from the JavaScript reference (a remark/unified
pipeline).

CLI (the conformance contract):
    parse <file> --json          lint <file> --json
    fmt [--assign-ids] <file>
    check/uncheck/cancel/claim/unclaim/start/unstart <file> <id> [flags]
    add <file> "<text>" [flags]  note <file> <id> "<text>" [flags]
    edit <file> <id> [flags]     cut <template> --out <file> --template-ref <r>

Exit codes: 0 success; 1 usage / IO / parse / not-MDC; 2 domain refusal.
On a refusal, the target file is left byte-untouched.
"""
from __future__ import annotations

import datetime
import json
import os
import re
import sys

# --- slugs and reserved sets -------------------------------------------------

SLUG_RE = re.compile(r"^[A-Za-z0-9_/-]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REPEAT_RE = re.compile(r"^(done|due)\+\d+[dwm]$")

RESERVED_KEYS = {"due", "done", "repeat", "needs", "verify", "reason"}
SOFT_CLASSES = {"doing", "waiting"}

MALFORMED_MSG = "attribute block does not tokenize; kept as text"

TASK_RE = re.compile(r"^(\s*)([-*+])[ \t]+\[([ xX])\][ \t]+(.*)$")
LIST_RE = re.compile(r"^(\s*)([-*+])[ \t]+(.*)$")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.*?)[ \t]*$")


def today():
    return datetime.date.today().isoformat()


# --- raw file I/O (byte-exact, endings + BOM preserved) ----------------------

def read_raw(path):
    """Return (bom, lines) where lines is a list of [content, ending]; ending is
    '\\n', '\\r\\n', or '' (only on a final line with no trailing newline)."""
    with open(path, "rb") as fh:
        data = fh.read()
    bom = data.startswith(b"\xef\xbb\xbf")
    text = data.decode("utf-8-sig")
    segs = text.split("\n")
    lines = []
    for i, seg in enumerate(segs):
        if i < len(segs) - 1:
            crlf = seg.endswith("\r")
            lines.append([seg[:-1] if crlf else seg, "\r\n" if crlf else "\n"])
        else:
            if seg == "":
                pass  # trailing newline already accounted for by the previous line
            else:
                crlf = seg.endswith("\r")
                lines.append([seg[:-1] if crlf else seg, ""])
    return bom, lines


def logical_of(lines):
    return [c for c, _e in lines]


def newline_of(lines):
    for _c, e in lines:
        if e:
            return e
    return "\n"


def rebuild(bom, lines):
    s = "".join(c + e for c, e in lines)
    if bom:
        s = "﻿" + s
    return s.encode("utf-8")


def indent_of(content):
    return len(content) - len(content.lstrip(" "))


# --- frontmatter -------------------------------------------------------------

def _looks_numeric(token):
    try:
        float(token)
        return True
    except ValueError:
        return False


def parse_frontmatter(logical):
    """Return (frontmatter_dict, mdc_is_string, started_line, end_idx) or None."""
    if not logical or logical[0].strip() != "---":
        return None
    end = None
    for i in range(1, len(logical)):
        if logical[i].strip() == "---":
            end = i
            break
    if end is None:
        return None
    fm = {}
    mdc_is_string = False
    started_line = None
    for i in range(1, end):
        line = logical[i]
        if not line.strip() or line[:1] in (" ", "\t") or ":" not in line:
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

def top_level_brace_opens(text):
    """Indices of '{' at brace-depth 0 and outside double quotes."""
    inq = False
    depth = 0
    opens = []
    for i, ch in enumerate(text):
        if ch == '"':
            inq = not inq
        elif not inq:
            if ch == "{":
                if depth == 0:
                    opens.append(i)
                depth += 1
            elif ch == "}":
                if depth > 0:
                    depth -= 1
    return opens


def find_trailing_block(text):
    """Split off a trailing {...} block (quote-aware) if present. Returns
    (text_without_block, block_str_or_None). Must be preceded by a space with
    non-empty text before it (ITEM-3)."""
    if not text.endswith("}"):
        return text, None
    for i in reversed(top_level_brace_opens(text)):
        if i == 0 or text[i - 1] != " " or text[:i].strip() == "":
            continue
        return text[:i].rstrip(), text[i:]
    return text, None


def tokenize_block(inner):
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
        return bool(SLUG_RE.match(key)) and _valid_value(val)
    return False


def unquote(val):
    if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
        return val[1:-1]
    return val


def parse_attributes(block, line):
    result = {"id": None, "classes": [], "assignee": None, "attrs": {},
              "needs": None, "warnings": [], "malformed": False}
    inner = block[1:-1]
    tokens = tokenize_block(inner)
    if tokens is None or len(tokens) == 0 or any(not valid_token(t) for t in tokens):
        result["malformed"] = True
        result["warnings"].append(
            {"rule": "malformed-attributes", "line": line, "message": MALFORMED_MSG})
        return result
    for tok in tokens:
        if tok[0] == "#":
            if result["id"] is None:
                result["id"] = tok[1:]
            else:
                result["warnings"].append({
                    "rule": "multiple-ids", "line": line,
                    "message": f"multiple ids; first (#{result['id']}) wins"})
        elif tok[0] == ".":
            result["classes"].append(tok[1:])
        elif tok[0] == "@":
            if result["assignee"] is None:
                result["assignee"] = tok[1:]
            else:
                result["warnings"].append({
                    "rule": "multiple-assignees", "line": line,
                    "message": f"multiple assignees; first (@{result['assignee']}) wins"})
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
    if mark == " ":
        return "open", text
    if (text.startswith("~~") and text.endswith("~~") and len(text) >= 4
            and "~~" not in text[2:-2]):
        return "cancelled", text[2:-2]
    return "done", text


# --- item construction -------------------------------------------------------

def build_item(marker, mark, rawtext, line, section, depth, raw_line):
    text = rawtext.strip()
    body, block = find_trailing_block(text)
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
            body = text
        else:
            id_ = parsed["id"]
            classes = parsed["classes"]
            assignee = parsed["assignee"]
            attrs = parsed["attrs"]
            needs = parsed["needs"] or []
    state, model_text = classify_state(mark, body)
    item = {
        "id": id_, "text": model_text, "state": state, "assignee": assignee,
        "classes": classes, "attrs": attrs, "section": section, "line": line,
        "children": [], "computed": None,
        "_needs": needs, "_depth": depth, "_raw": raw_line, "_marker": marker,
        "_mark": mark, "_malformed": malformed, "_gate": "gate" in classes,
        "_optional": "optional" in classes,
        "_terminal": state in ("done", "cancelled"),
    }
    return item, warnings


def parse_items(logical, fm_end):
    top = []
    all_items = []
    warnings = []
    section = None
    stack = []
    for idx in range(fm_end + 1, len(logical)):
        line = logical[idx]
        lineno = idx + 1
        hm = HEADING_RE.match(line)
        if hm:
            section = hm.group(2)
            continue
        tm = TASK_RE.match(line)
        if tm:
            indent = len(tm.group(1).expandtabs(4))
            while stack and stack[-1]["indent"] >= indent:
                stack.pop()
            depth = len(stack)
            item, w = build_item(tm.group(2), tm.group(3), tm.group(4),
                                  lineno, section, depth, line)
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
    return top, all_items, warnings


# --- document load -----------------------------------------------------------

def load_document(path):
    """Return dict with bom, lines, logical, frontmatter, err, top, all_items."""
    bom, lines = read_raw(path)
    logical = logical_of(lines)
    fm = parse_frontmatter(logical)
    doc = {"bom": bom, "lines": lines, "logical": logical, "err": None,
           "frontmatter": {}, "fm_end": None, "top": [], "all_items": []}
    if fm is None:
        doc["err"] = "not-mdc"
        return doc
    frontmatter, mdc_is_string, started_line, fm_end = fm
    doc["frontmatter"] = frontmatter
    doc["started_line"] = started_line
    doc["fm_end"] = fm_end
    if "mdc" not in frontmatter or not mdc_is_string:
        doc["err"] = "not-mdc"
        return doc
    if frontmatter["mdc"] != "0.1":
        doc["err"] = "unsupported-version"
        return doc
    top, all_items, warnings = parse_items(logical, fm_end)
    doc["top"] = top
    doc["all_items"] = all_items
    doc["warnings"] = warnings
    return doc


def id_map_of(all_items):
    m = {}
    for it in all_items:
        if it["id"] and it["id"] not in m:
            m[it["id"]] = it
    return m


# --- derived semantics -------------------------------------------------------

def find_cycle_members(all_items, id_map):
    graph = {}
    for it in all_items:
        if it["id"] and it["id"] not in graph:
            graph[it["id"]] = [t for t in it["_needs"] if "#" not in t and t in id_map]
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
    id_map = id_map_of(all_items)
    cycle_members = find_cycle_members(all_items, id_map)
    gates = sorted([g for g in all_items if g["_gate"] and not g["_terminal"]],
                   key=lambda g: g["line"])

    def gate_key(g):
        return g["id"] if g["id"] else f"<line {g['line']}>"

    def own_blocked_by(it):
        out = []
        for t in it["_needs"]:
            if "#" in t:
                continue
            if t not in id_map:
                out.append(t)
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
        actionable = (it["state"] == "open" and not blocked and not gb
                      and all(c["_terminal"] for c in it["children"]))
        it["computed"] = {"blocked": blocked, "blockedBy": combined,
                          "gatedBy": gb, "actionable": actionable,
                          "progress": progress(it)}
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
        out[k] = [clean_item(c) for c in it["children"]] if k == "children" else it[k]
    return out


# --- canonical serialization -------------------------------------------------

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
    return "{" + " ".join(parts) + "}" if parts else ""


def canonical_line(it):
    indent = "  " * it["_depth"]
    mark = " " if it["state"] == "open" else "x"
    ctext = "~~" + it["text"] + "~~" if it["state"] == "cancelled" else it["text"]
    block = canonical_block(it)
    line = f"{indent}- [{mark}] {ctext}"
    if block:
        line += " " + block
    return line


# --- slug generation (ID-4) --------------------------------------------------

def gen_slug(text):
    words = text.lower().split()[:3]
    slug = "-".join(words)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "item"


def unique_id(base, used):
    if base not in used:
        return base
    n = 2
    while f"{base}-{n}" in used:
        n += 1
    return f"{base}-{n}"


# --- lint --------------------------------------------------------------------

def lint_document(path):
    doc = load_document(path)
    if doc["err"]:
        return []
    frontmatter = doc["frontmatter"]
    top, all_items = doc["top"], doc["all_items"]
    compute_derived(top, all_items)
    id_map = id_map_of(all_items)
    cycle_members = find_cycle_members(all_items, id_map)

    findings = []

    def add(rule, severity, line, id_, message):
        findings.append({"rule": rule, "severity": severity, "line": line,
                         "id": id_, "message": message})

    if "started" in frontmatter and not DATE_RE.match(frontmatter["started"]):
        add("invalid-date", "error", doc.get("started_line"), None,
            f'invalid date "{frontmatter["started"]}" for started; expected YYYY-MM-DD')

    if frontmatter.get("kind") == "run" and "template" in frontmatter:
        tmpl = frontmatter["template"]
        if "@" not in tmpl:
            add("unpinned-template", "warning", None, None,
                f'run pins template "{tmpl}" without an @version; '
                "it may drift if the template changes")

    seen_ids = set()
    for it in all_items:
        line, iid = it["line"], it["id"]
        if it["_malformed"]:
            add("malformed-attributes", "error", line, None, MALFORMED_MSG)
            continue
        for w in _line_sigil_warnings(it):
            add(w["rule"], "error", line, iid, w["message"])
        if iid:
            if iid in seen_ids:
                add("duplicate-id", "error", line, iid, f'duplicate id "{iid}"')
            else:
                seen_ids.add(iid)
        for t in it["_needs"]:
            if "#" in t:
                add("unresolved-cross-file-ref", "warning", line, iid,
                    f'needs references cross-file target "{t}"; '
                    "v0 tooling does not resolve it")
            elif t not in id_map:
                add("dangling-needs", "error", line, iid,
                    f'needs references unknown id "{t}"')
        if iid in cycle_members:
            add("needs-cycle", "error", line, iid, "item is in a needs cycle")
        for dk in ("due", "done"):
            if dk in it["attrs"] and not DATE_RE.match(it["attrs"][dk]):
                add("invalid-date", "error", line, iid,
                    f'invalid date "{it["attrs"][dk]}" for {dk}; expected YYYY-MM-DD')
        if "repeat" in it["attrs"] and not REPEAT_RE.match(it["attrs"]["repeat"]):
            add("invalid-repeat", "error", line, iid,
                f'invalid repeat "{it["attrs"]["repeat"]}"; '
                "expected (done|due)+<n><d|w|m>")
        for key in it["attrs"]:
            if key not in RESERVED_KEYS and not key.startswith("x-"):
                add("unknown-key", "warning", line, iid,
                    f'unknown key "{key}"; extension keys must use the x- prefix')
        if it["state"] == "cancelled" and "reason" not in it["attrs"]:
            add("cancelled-without-reason", "warning", line, iid,
                "cancelled item has no reason=")
        if canonical_line(it) != it["_raw"]:
            add("non-canonical-state", "warning", line, iid,
                "not in canonical form; fmt would rewrite this line")

    findings.sort(key=lambda f: (f["line"] if f["line"] is not None else -1, f["rule"]))
    for f in findings:
        f.pop("line", None)
    return findings


def _line_sigil_warnings(it):
    out = []
    tm = TASK_RE.match(it["_raw"])
    if not tm:
        return out
    _, block = find_trailing_block(tm.group(4).strip())
    if block is None:
        return out
    for w in parse_attributes(block, it["line"])["warnings"]:
        if w["rule"] in ("multiple-ids", "multiple-assignees"):
            out.append(w)
    return out


# --- fmt ---------------------------------------------------------------------

def do_fmt(path, assign_ids):
    doc = load_document(path)
    if doc["err"]:
        sys.stderr.write(f"{doc['err']}\n")
        return 1
    lines, all_items = doc["lines"], doc["all_items"]
    if assign_ids:
        used = set(it["id"] for it in all_items if it["id"])
        for it in all_items:
            if not it["id"] and not it["_malformed"]:
                new = unique_id(gen_slug(it["text"]), used)
                it["id"] = new
                used.add(new)
    for it in all_items:
        if not it["_malformed"]:
            lines[it["line"] - 1][0] = canonical_line(it)
    with open(path, "wb") as fh:
        fh.write(rebuild(doc["bom"], lines))
    return 0


# --- mutations ---------------------------------------------------------------

def do_mutate(verb, path, item_id, flags):
    doc = load_document(path)
    if doc["err"]:
        sys.stderr.write(f"{doc['err']}\n")
        return 1
    it = id_map_of(doc["all_items"]).get(item_id)
    if it is None:
        sys.stderr.write(f"unknown id: {item_id}\n")
        return 2

    def strip_soft():
        it["classes"] = [c for c in it["classes"] if c not in SOFT_CLASSES]

    if verb == "check":
        if it["state"] != "open":
            return 2
        it["state"] = "done"
        strip_soft()
        it["attrs"]["done"] = flags.get("date") or today()
        it["_terminal"] = True
    elif verb == "uncheck":
        if it["state"] != "done":
            return 2
        it["state"] = "open"
        it["attrs"].pop("done", None)
        it["_terminal"] = False
    elif verb == "cancel":
        if it["state"] == "cancelled":
            return 2
        reason = flags.get("reason")
        if reason is None:
            sys.stderr.write("cancel requires --reason\n")
            return 1
        it["state"] = "cancelled"
        strip_soft()
        it["attrs"]["reason"] = reason
        it["_terminal"] = True
    elif verb == "claim":
        handle = flags.get("as")
        if handle is None:
            sys.stderr.write("claim requires --as\n")
            return 1
        if it["assignee"] is not None:
            return 2
        it["assignee"] = handle
    elif verb == "unclaim":
        if it["assignee"] is None:
            return 2
        frm = flags.get("from")
        if frm is not None and it["assignee"] != frm:
            return 2
        it["assignee"] = None
    elif verb == "start":
        if it["state"] != "open" or "doing" in it["classes"]:
            return 2
        it["classes"].append("doing")
    elif verb == "unstart":
        if "doing" not in it["classes"]:
            return 2
        it["classes"] = [c for c in it["classes"] if c != "doing"]
    else:
        sys.stderr.write(f"unknown verb: {verb}\n")
        return 1

    new_line = canonical_line(it)
    doc["lines"][it["line"] - 1][0] = new_line
    with open(path, "wb") as fh:
        fh.write(rebuild(doc["bom"], doc["lines"]))
    print(new_line)
    return 0


# --- edit --------------------------------------------------------------------

def do_edit(path, item_id, flags):
    field_flags = ("text", "needs", "add-needs", "rm-needs",
                   "add-class", "rm-class", "due")
    present = [f for f in field_flags if f in flags]
    if not present:
        sys.stderr.write("edit requires at least one field flag\n")
        return 1
    if ("needs" in flags) and ("add-needs" in flags or "rm-needs" in flags):
        sys.stderr.write("edit: --needs conflicts with --add-needs/--rm-needs\n")
        return 1
    for ck in ("add-class", "rm-class"):
        if ck in flags and flags[ck] in SOFT_CLASSES:
            sys.stderr.write("edit cannot change soft classes\n")
            return 1
    if "due" in flags and not DATE_RE.match(flags["due"]):
        sys.stderr.write("edit: bad --due date\n")
        return 1

    doc = load_document(path)
    if doc["err"]:
        sys.stderr.write(f"{doc['err']}\n")
        return 1
    it = id_map_of(doc["all_items"]).get(item_id)
    if it is None:
        sys.stderr.write(f"unknown id: {item_id}\n")
        return 2

    if "text" in flags:
        it["text"] = flags["text"]
    if "needs" in flags:
        vals = [v for v in flags["needs"].split(",") if v != ""]
        if vals:
            it["attrs"]["needs"] = vals
        else:
            it["attrs"].pop("needs", None)
    if "add-needs" in flags:
        cur = list(it["attrs"].get("needs", []))
        for v in flags["add-needs"].split(","):
            if v and v not in cur:
                cur.append(v)
        it["attrs"]["needs"] = cur
    if "rm-needs" in flags:
        cur = [v for v in it["attrs"].get("needs", [])
               if v not in flags["rm-needs"].split(",")]
        if cur:
            it["attrs"]["needs"] = cur
        else:
            it["attrs"].pop("needs", None)
    if "add-class" in flags and flags["add-class"] not in it["classes"]:
        it["classes"].append(flags["add-class"])
    if "rm-class" in flags:
        it["classes"] = [c for c in it["classes"] if c != flags["rm-class"]]
    if "due" in flags:
        it["attrs"]["due"] = flags["due"]

    new_line = canonical_line(it)
    doc["lines"][it["line"] - 1][0] = new_line
    with open(path, "wb") as fh:
        fh.write(rebuild(doc["bom"], doc["lines"]))
    print(new_line)
    return 0


# --- add ---------------------------------------------------------------------

def do_add(path, text, flags):
    if not text:
        sys.stderr.write("add requires non-empty text\n")
        return 1
    if "after" in flags and "section" in flags:
        sys.stderr.write("add: --after and --section are mutually exclusive\n")
        return 1
    if "id" in flags and not SLUG_RE.match(flags["id"]):
        sys.stderr.write("add: malformed --id slug\n")
        return 1
    if "due" in flags and not DATE_RE.match(flags["due"]):
        sys.stderr.write("add: bad --due date\n")
        return 1

    doc = load_document(path)
    if doc["err"]:
        sys.stderr.write(f"{doc['err']}\n")
        return 1
    lines, all_items = doc["lines"], doc["all_items"]
    used = set(it["id"] for it in all_items if it["id"])

    if "id" in flags:
        if flags["id"] in used:
            sys.stderr.write(f"add: id collision {flags['id']}\n")
            return 2
        new_id = flags["id"]
    else:
        new_id = unique_id(gen_slug(text), used)

    # determine placement + depth
    depth = 0
    if "after" in flags:
        target = id_map_of(all_items).get(flags["after"])
        if target is None:
            sys.stderr.write(f"add: unknown --after id {flags['after']}\n")
            return 2
        depth = target["_depth"]
        L = target["line"] - 1
        tind = indent_of(lines[L][0])
        j = L + 1
        while j < len(lines) and lines[j][0].strip() != "" and indent_of(lines[j][0]) > tind:
            j += 1
        insert_at = j
    elif "section" in flags:
        hidx = None
        for idx, content in enumerate(logical_of(lines)):
            hm = HEADING_RE.match(content)
            if hm and hm.group(2) == flags["section"]:
                hidx = idx
                break
        if hidx is None:
            sys.stderr.write(f"add: unknown --section {flags['section']}\n")
            return 2
        j = hidx + 1
        last = hidx
        while j < len(lines):
            if HEADING_RE.match(lines[j][0]):
                break
            if lines[j][0].strip() != "":
                last = j
            j += 1
        insert_at = last + 1
    else:
        insert_at = None  # append at end

    attrs = {}
    needs = [v for v in flags["needs"].split(",") if v] if "needs" in flags else []
    if needs:
        attrs["needs"] = needs
    if "due" in flags:
        attrs["due"] = flags["due"]
    classes = [c for c in flags["class"].split(",") if c] if "class" in flags else []
    new_item = {"id": new_id, "classes": classes, "assignee": flags.get("as"),
                "attrs": attrs, "state": "open", "text": text, "_depth": depth}
    new_line = canonical_line(new_item)
    nl = newline_of(lines)

    if insert_at is None:
        if lines and lines[-1][1] == "":
            lines[-1][1] = nl
            lines.append([new_line, ""])
        else:
            lines.append([new_line, nl])
    else:
        lines.insert(insert_at, [new_line, nl])

    with open(path, "wb") as fh:
        fh.write(rebuild(doc["bom"], lines))
    print(new_line)
    return 0


# --- note --------------------------------------------------------------------

def do_note(path, item_id, message, flags):
    if not message or "\n" in message:
        sys.stderr.write("note requires a non-empty single-line message\n")
        return 1
    doc = load_document(path)
    if doc["err"]:
        sys.stderr.write(f"{doc['err']}\n")
        return 1
    lines = doc["lines"]
    it = id_map_of(doc["all_items"]).get(item_id)
    if it is None:
        sys.stderr.write(f"unknown id: {item_id}\n")
        return 2

    depth = it["_depth"]
    prefix = "  " * (depth + 1)
    author = flags.get("as")
    date = flags.get("date") or today()
    note_line = prefix + "- note" + (f" @{author}" if author else "") + f" {date}: {message}"

    L = it["line"] - 1
    item_indent = indent_of(lines[L][0])
    insert_at = L + 1
    j = L + 1
    while j < len(lines):
        c = lines[j][0]
        if c.strip() == "" or indent_of(c) <= item_indent:
            break
        if c.lstrip(" ").startswith("- note"):
            insert_at = j + 1
        j += 1

    nl = newline_of(lines)
    if insert_at >= len(lines) and lines and lines[-1][1] == "":
        lines[-1][1] = nl
        lines.append([note_line, ""])
    else:
        lines.insert(insert_at, [note_line, nl])

    with open(path, "wb") as fh:
        fh.write(rebuild(doc["bom"], lines))
    print(note_line)
    return 0


# --- cut ---------------------------------------------------------------------

def do_cut(template_path, flags):
    out = flags.get("out")
    if out is None:
        sys.stderr.write("cut requires --out\n")
        return 1
    ref = flags.get("template-ref")
    if ref is None:
        sys.stderr.write("cut requires --template-ref\n")
        return 1
    doc = load_document(template_path)
    if doc["err"]:
        sys.stderr.write(f"{doc['err']}\n")
        return 1
    frontmatter = doc["frontmatter"]
    if frontmatter.get("kind") != "template":
        sys.stderr.write("cut: source is not a kind: template document\n")
        return 1
    if os.path.exists(out):
        sys.stderr.write(f"cut: {out} already exists\n")
        return 2

    nl = newline_of(doc["lines"])
    title = flags.get("title", frontmatter.get("title"))
    fm_lines = ["---", 'mdc: "0.1"', "kind: run", f"template: {ref}"]
    if title is not None:
        fm_lines.append(f"title: {title}")
    if "mode" in frontmatter:
        fm_lines.append(f"mode: {frontmatter['mode']}")
    fm_lines.append(f"started: {flags.get('date') or today()}")
    handled = {"mdc", "kind", "title", "template", "mode", "started"}
    for k, v in frontmatter.items():
        if k not in handled:
            fm_lines.append(f"{k}: {v}")
    fm_lines.append("---")

    out_lines = [[c, nl] for c in fm_lines]

    # reset item lines in the body
    reset_by_line = {}
    for it in doc["all_items"]:
        if it["_malformed"]:
            continue
        r = dict(it)
        r["state"] = "open"
        r["assignee"] = None
        r["attrs"] = {k: v for k, v in it["attrs"].items()
                      if k not in ("done", "due", "reason")}
        r["classes"] = [c for c in it["classes"] if c not in SOFT_CLASSES]
        reset_by_line[it["line"]] = canonical_line(r)

    for idx in range(doc["fm_end"] + 1, len(doc["lines"])):
        content, ending = doc["lines"][idx]
        lineno = idx + 1
        if lineno in reset_by_line:
            content = reset_by_line[lineno]
        out_lines.append([content, ending])

    with open(out, "wb") as fh:
        fh.write(rebuild(doc["bom"], out_lines))
    return 0


# --- CLI ---------------------------------------------------------------------

def parse_flags(args, boolean_flags=frozenset()):
    pos = []
    flags = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a.startswith("--"):
            name = a[2:]
            if name in boolean_flags:
                flags[name] = True
                i += 1
            else:
                flags[name] = args[i + 1] if i + 1 < len(args) else ""
                i += 2
        else:
            pos.append(a)
            i += 1
    return pos, flags


def main(argv):
    if not argv:
        sys.stderr.write("usage: mdc <verb> <file> [args]\n")
        return 1
    verb = argv[0]
    rest = argv[1:]

    if verb in ("parse", "lint"):
        file_arg = next((a for a in rest if not a.startswith("-")), None)
        if file_arg is None:
            sys.stderr.write("usage: mdc <verb> <file> --json\n")
            return 1
        try:
            if verb == "parse":
                doc = load_document(file_arg)
                if doc["err"]:
                    print(json.dumps({"error": doc["err"]}))
                    return 1
                compute_derived(doc["top"], doc["all_items"])
                model = {
                    "mdc": doc["frontmatter"]["mdc"],
                    "kind": doc["frontmatter"].get("kind", "list"),
                    "title": doc["frontmatter"].get("title", None),
                    "frontmatter": doc["frontmatter"],
                    "items": [clean_item(it) for it in doc["top"]],
                    "warnings": [{"rule": w["rule"], "line": w["line"],
                                  "message": w["message"]} for w in doc["warnings"]],
                }
                print(json.dumps(model))
                return 0
            print(json.dumps(lint_document(file_arg)))
            return 0
        except FileNotFoundError:
            sys.stderr.write(f"cannot read {file_arg}\n")
            return 1

    try:
        if verb == "fmt":
            pos, flags = parse_flags(rest, {"assign-ids"})
            if not pos:
                sys.stderr.write("usage: mdc fmt [--assign-ids] <file>\n")
                return 1
            return do_fmt(pos[0], "assign-ids" in flags)

        if verb in ("check", "uncheck", "cancel", "claim", "unclaim", "start", "unstart"):
            pos, flags = parse_flags(rest)
            if len(pos) < 2:
                sys.stderr.write(f"usage: mdc {verb} <file> <id> [flags]\n")
                return 1
            return do_mutate(verb, pos[0], pos[1], flags)

        if verb == "edit":
            pos, flags = parse_flags(rest)
            if len(pos) < 2:
                sys.stderr.write("usage: mdc edit <file> <id> [flags]\n")
                return 1
            return do_edit(pos[0], pos[1], flags)

        if verb == "add":
            pos, flags = parse_flags(rest)
            if len(pos) < 2:
                sys.stderr.write('usage: mdc add <file> "<text>" [flags]\n')
                return 1
            return do_add(pos[0], pos[1], flags)

        if verb == "note":
            pos, flags = parse_flags(rest)
            if len(pos) < 3:
                sys.stderr.write('usage: mdc note <file> <id> "<text>" [flags]\n')
                return 1
            return do_note(pos[0], pos[1], pos[2], flags)

        if verb == "cut":
            pos, flags = parse_flags(rest)
            if not pos:
                sys.stderr.write("usage: mdc cut <template> --out <file> --template-ref <ref>\n")
                return 1
            return do_cut(pos[0], flags)
    except FileNotFoundError as exc:
        sys.stderr.write(f"cannot read {exc.filename}\n")
        return 1

    sys.stderr.write(f"unknown verb: {verb}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
