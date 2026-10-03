# MDC (Markdown Checklists) — a third, independent implementation, in Crystal.
#
# Conformance target: CONF-L2 (parse + lint + fmt + mutate + add + note + edit +
# cut). Crystal standard library only (JSON builder, Regex/PCRE2). Compiled to a
# native binary for near-zero startup cost in agent/CI loops.
#
# Strategy: a line-oriented parser. Task-item lines are detected by pattern,
# nesting depth is computed from leading indentation, and the attribute block is
# extracted and tokenised by hand (quote-aware) — a different parsing strategy
# from the JavaScript reference (a remark/unified pipeline).
#
# CLI (the conformance contract):
#     parse <file> --json          lint <file> --json
#     fmt [--assign-ids] <file>
#     check/uncheck/cancel/claim/unclaim/start/unstart <file> <id> [flags]
#     add <file> "<text>" [flags]  note <file> <id> "<text>" [flags]
#     edit <file> <id> [flags]     cut <template> --out <file> --template-ref <r>
#
# Exit codes: 0 success; 1 usage / IO / parse / not-MDC; 2 domain refusal.
# On a refusal, the target file is left byte-untouched.

require "json"

module Mdc
  extend self

  alias AttrVal = String | Array(String)

  SLUG_RE   = /\A[A-Za-z0-9_\/-]+\z/
  DATE_RE   = /\A\d{4}-\d{2}-\d{2}\z/
  REPEAT_RE = /\A(done|due)\+\d+[dwm]\z/

  RESERVED_KEYS = {"due", "done", "repeat", "needs", "verify", "reason"}
  SOFT_CLASSES  = {"doing", "waiting"}

  MALFORMED_MSG = "attribute block does not tokenize; kept as text"

  # Regexes containing `#` / `{` are built from %q strings to avoid Crystal
  # string interpolation inside regex literals.
  TASK_RE    = Regex.new(%q{^(\s*)([-*+])[ \t]+\[([ xX])\][ \t]+(.*)$})
  LIST_RE    = Regex.new(%q{^(\s*)([-*+])[ \t]+(.*)$})
  HEADING_RE = Regex.new(%q{^(#{1,6})[ \t]+(.*?)[ \t]*$})

  def today : String
    Time.local.to_s("%Y-%m-%d")
  end

  # --- data types ------------------------------------------------------------

  record Warning, rule : String, line : Int32?, message : String

  record Finding, rule : String, severity : String, line : Int32?, id : String?, message : String

  class Computed
    property blocked : Bool
    property blocked_by : Array(String)
    property gated_by : Array(String)
    property actionable : Bool
    property progress : NamedTuple(done: Int32, total: Int32)?

    def initialize(@blocked, @blocked_by, @gated_by, @actionable, @progress)
    end
  end

  class Item
    property id : String?
    property text : String
    property state : String
    property assignee : String?
    property classes : Array(String)
    property attrs : Hash(String, AttrVal)
    property section : String?
    property line : Int32
    property children : Array(Item)
    property computed : Computed?
    property needs : Array(String)
    property depth : Int32
    property raw : String
    property marker : String
    property mark : String
    property malformed : Bool
    property gate : Bool
    property optional : Bool
    property terminal : Bool

    def initialize(@text = "", @state = "open", @depth = 0)
      @id = nil
      @assignee = nil
      @classes = [] of String
      @attrs = {} of String => AttrVal
      @section = nil
      @line = 0
      @children = [] of Item
      @computed = nil
      @needs = [] of String
      @raw = ""
      @marker = "-"
      @mark = " "
      @malformed = false
      @gate = false
      @optional = false
      @terminal = false
    end
  end

  class Line
    property content : String
    property ending : String

    def initialize(@content, @ending)
    end
  end

  class Doc
    property bom : Bool
    property lines : Array(Line)
    property logical : Array(String)
    property err : String?
    property frontmatter : Hash(String, String)
    property fm_end : Int32?
    property started_line : Int32?
    property top : Array(Item)
    property all_items : Array(Item)
    property warnings : Array(Warning)

    def initialize
      @bom = false
      @lines = [] of Line
      @logical = [] of String
      @err = nil
      @frontmatter = {} of String => String
      @fm_end = nil
      @started_line = nil
      @top = [] of Item
      @all_items = [] of Item
      @warnings = [] of Warning
    end
  end

  # --- raw file I/O (byte-exact, endings + BOM preserved) --------------------

  def read_raw(path : String) : {Bool, Array(Line)}
    raw = File.read(path)
    bom = raw.starts_with?('﻿')
    text = bom ? raw.lchop('﻿') : raw
    segs = text.split("\n")
    lines = [] of Line
    segs.each_with_index do |seg, i|
      if i < segs.size - 1
        crlf = seg.ends_with?("\r")
        lines << Line.new(crlf ? seg[0...-1] : seg, crlf ? "\r\n" : "\n")
      else
        next if seg == ""
        crlf = seg.ends_with?("\r")
        lines << Line.new(crlf ? seg[0...-1] : seg, "")
      end
    end
    {bom, lines}
  end

  def logical_of(lines : Array(Line)) : Array(String)
    lines.map(&.content)
  end

  def newline_of(lines : Array(Line)) : String
    lines.each { |l| return l.ending unless l.ending.empty? }
    "\n"
  end

  def rebuild(bom : Bool, lines : Array(Line)) : String
    s = String.build do |io|
      lines.each { |l| io << l.content << l.ending }
    end
    bom ? "﻿" + s : s
  end

  def indent_of(content : String) : Int32
    content.size - content.lstrip(' ').size
  end

  def expand_tabs(s : String, tabsize = 4) : String
    col = 0
    String.build do |io|
      s.each_char do |ch|
        if ch == '\t'
          spaces = tabsize - (col % tabsize)
          spaces.times { io << ' ' }
          col += spaces
        else
          io << ch
          col += 1
        end
      end
    end
  end

  # --- frontmatter -----------------------------------------------------------

  def looks_numeric?(token : String) : Bool
    !token.to_f?(strict: true).nil?
  end

  # Returns {fm, mdc_is_string, started_line, end_idx} or nil.
  def parse_frontmatter(logical : Array(String)) : {Hash(String, String), Bool, Int32?, Int32}?
    return nil if logical.empty? || logical[0].strip != "---"
    endi = nil
    (1...logical.size).each do |i|
      if logical[i].strip == "---"
        endi = i
        break
      end
    end
    return nil if endi.nil?
    fm = {} of String => String
    mdc_is_string = false
    started_line = nil
    (1...endi).each do |i|
      line = logical[i]
      next if line.strip.empty?
      first = line[0]?
      next if first == ' ' || first == '\t'
      next unless line.includes?(':')
      key, _, rawval = line.partition(":")
      key = key.strip
      val = rawval.strip
      quoted = false
      if val.size >= 2 && val[0] == val[-1] && (val[0] == '"' || val[0] == '\'')
        val = val[1...-1]
        quoted = true
      end
      fm[key] = val
      if key == "mdc"
        mdc_is_string = quoted || !looks_numeric?(rawval.strip)
      end
      if key == "started"
        started_line = i + 1
      end
    end
    {fm, mdc_is_string, started_line, endi}
  end

  # --- attribute block -------------------------------------------------------

  def top_level_brace_opens(chars : Array(Char)) : Array(Int32)
    inq = false
    depth = 0
    opens = [] of Int32
    chars.each_with_index do |ch, i|
      if ch == '"'
        inq = !inq
      elsif !inq
        if ch == '{'
          opens << i if depth == 0
          depth += 1
        elsif ch == '}'
          depth -= 1 if depth > 0
        end
      end
    end
    opens
  end

  # Split off a trailing {...} block (quote-aware) if present.
  def find_trailing_block(text : String) : {String, String?}
    return {text, nil} unless text.ends_with?("}")
    chars = text.chars
    top_level_brace_opens(chars).reverse_each do |i|
      next if i == 0 || chars[i - 1] != ' '
      before = chars[0...i].join
      next if before.strip.empty?
      return {before.rstrip, chars[i..].join}
    end
    {text, nil}
  end

  def tokenize_block(inner : String) : Array(String)?
    tokens = [] of String
    cur = ""
    inq = false
    inner.each_char do |ch|
      if ch == '"'
        inq = !inq
        cur += ch
      elsif ch == ' ' && !inq
        unless cur.empty?
          tokens << cur
          cur = ""
        end
      else
        cur += ch
      end
    end
    tokens << cur unless cur.empty?
    return nil if inq
    tokens
  end

  def valid_value?(val : String) : Bool
    if val.starts_with?('"')
      val.ends_with?('"') && val.size >= 2
    else
      !val.chars.any? { |c| c == '"' || c == '{' || c == '}' }
    end
  end

  def valid_token?(tok : String) : Bool
    c = tok[0]?
    if c == '#' || c == '.' || c == '@'
      !(SLUG_RE =~ tok[1..]).nil?
    elsif tok.includes?('=')
      key, _, val = tok.partition("=")
      !(SLUG_RE =~ key).nil? && valid_value?(val)
    else
      false
    end
  end

  def unquote(val : String) : String
    if val.size >= 2 && val[0] == '"' && val[-1] == '"'
      val[1...-1]
    else
      val
    end
  end

  class AttrResult
    property id : String?
    property classes : Array(String)
    property assignee : String?
    property attrs : Hash(String, AttrVal)
    property needs : Array(String)?
    property warnings : Array(Warning)
    property malformed : Bool

    def initialize
      @id = nil
      @classes = [] of String
      @assignee = nil
      @attrs = {} of String => AttrVal
      @needs = nil
      @warnings = [] of Warning
      @malformed = false
    end
  end

  def parse_attributes(block : String, line : Int32) : AttrResult
    result = AttrResult.new
    inner = block[1...-1]
    tokens = tokenize_block(inner)
    if tokens.nil? || tokens.empty? || tokens.any? { |t| !valid_token?(t) }
      result.malformed = true
      result.warnings << Warning.new("malformed-attributes", line, MALFORMED_MSG)
      return result
    end
    tokens.each do |tok|
      case tok[0]
      when '#'
        if result.id.nil?
          result.id = tok[1..]
        else
          result.warnings << Warning.new("multiple-ids", line,
            "multiple ids; first (##{result.id}) wins")
        end
      when '.'
        result.classes << tok[1..]
      when '@'
        if result.assignee.nil?
          result.assignee = tok[1..]
        else
          result.warnings << Warning.new("multiple-assignees", line,
            "multiple assignees; first (@#{result.assignee}) wins")
        end
      else
        key, _, val = tok.partition("=")
        if key == "needs"
          needs = val.split(",").map { |v| unquote(v) }
          result.needs = needs
          result.attrs["needs"] = needs
        else
          result.attrs[key] = unquote(val)
        end
      end
    end
    result
  end

  # --- states ----------------------------------------------------------------

  def classify_state(mark : String, text : String) : {String, String}
    return {"open", text} if mark == " "
    if text.starts_with?("~~") && text.ends_with?("~~") && text.size >= 4 &&
       !text[2...-2].includes?("~~")
      return {"cancelled", text[2...-2]}
    end
    {"done", text}
  end

  # --- item construction -----------------------------------------------------

  def build_item(marker : String, mark : String, rawtext : String, line : Int32,
                 section : String?, depth : Int32, raw_line : String) : {Item, Array(Warning)}
    text = rawtext.strip
    body, block = find_trailing_block(text)
    id_ = nil
    classes = [] of String
    assignee = nil
    attrs = {} of String => AttrVal
    needs = [] of String
    warnings = [] of Warning
    malformed = false
    if block
      parsed = parse_attributes(block, line)
      warnings = parsed.warnings
      if parsed.malformed
        malformed = true
        body = text
      else
        id_ = parsed.id
        classes = parsed.classes
        assignee = parsed.assignee
        attrs = parsed.attrs
        needs = parsed.needs || [] of String
      end
    end
    state, model_text = classify_state(mark, body)
    item = Item.new(text: model_text, state: state, depth: depth)
    item.id = id_
    item.assignee = assignee
    item.classes = classes
    item.attrs = attrs
    item.section = section
    item.line = line
    item.needs = needs
    item.raw = raw_line
    item.marker = marker
    item.mark = mark
    item.malformed = malformed
    item.gate = classes.includes?("gate")
    item.optional = classes.includes?("optional")
    item.terminal = (state == "done" || state == "cancelled")
    {item, warnings}
  end

  class StackEntry
    property indent : Int32
    property is_task : Bool
    property item : Item?

    def initialize(@indent, @is_task, @item)
    end
  end

  def parse_items(logical : Array(String), fm_end : Int32) : {Array(Item), Array(Item), Array(Warning)}
    top = [] of Item
    all_items = [] of Item
    warnings = [] of Warning
    section = nil
    stack = [] of StackEntry
    ((fm_end + 1)...logical.size).each do |idx|
      line = logical[idx]
      lineno = idx + 1
      if hm = HEADING_RE.match(line)
        section = hm[2]
        next
      end
      if tm = TASK_RE.match(line)
        indent = expand_tabs(tm[1]).size
        while !stack.empty? && stack[-1].indent >= indent
          stack.pop
        end
        depth = stack.size
        item, w = build_item(tm[2], tm[3], tm[4], lineno, section, depth, line)
        warnings.concat(w)
        all_items << item
        parent = stack.empty? ? nil : stack[-1]
        if parent && parent.is_task && (pi = parent.item)
          pi.children << item
        else
          top << item
        end
        stack << StackEntry.new(indent, true, item)
        next
      end
      if lm = LIST_RE.match(line)
        indent = expand_tabs(lm[1]).size
        while !stack.empty? && stack[-1].indent >= indent
          stack.pop
        end
        stack << StackEntry.new(indent, false, nil)
        next
      end
    end
    {top, all_items, warnings}
  end

  # --- document load ---------------------------------------------------------

  def load_document(path : String) : Doc
    bom, lines = read_raw(path)
    doc = Doc.new
    doc.bom = bom
    doc.lines = lines
    doc.logical = logical_of(lines)
    fm = parse_frontmatter(doc.logical)
    if fm.nil?
      doc.err = "not-mdc"
      return doc
    end
    frontmatter, mdc_is_string, started_line, fm_end = fm
    doc.frontmatter = frontmatter
    doc.started_line = started_line
    doc.fm_end = fm_end
    if !frontmatter.has_key?("mdc") || !mdc_is_string
      doc.err = "not-mdc"
      return doc
    end
    if frontmatter["mdc"] != "0.1"
      doc.err = "unsupported-version"
      return doc
    end
    top, all_items, warnings = parse_items(doc.logical, fm_end)
    doc.top = top
    doc.all_items = all_items
    doc.warnings = warnings
    doc
  end

  def id_map_of(all_items : Array(Item)) : Hash(String, Item)
    m = {} of String => Item
    all_items.each do |it|
      if (iid = it.id) && !m.has_key?(iid)
        m[iid] = it
      end
    end
    m
  end

  # --- derived semantics -----------------------------------------------------

  def find_cycle_members(all_items : Array(Item), id_map : Hash(String, Item)) : Set(String)
    graph = {} of String => Array(String)
    all_items.each do |it|
      if (iid = it.id) && !graph.has_key?(iid)
        graph[iid] = it.needs.select { |t| !t.includes?('#') && id_map.has_key?(t) }
      end
    end
    members = Set(String).new

    reaches_self = ->(start : String) do
      seen = Set(String).new
      stack = graph.fetch(start, [] of String).dup
      until stack.empty?
        n = stack.pop
        return true if n == start
        next if seen.includes?(n)
        seen << n
        stack.concat(graph.fetch(n, [] of String))
      end
      false
    end

    graph.each_key do |node|
      members << node if reaches_self.call(node)
    end
    members
  end

  def compute_derived(top : Array(Item), all_items : Array(Item))
    id_map = id_map_of(all_items)
    cycle_members = find_cycle_members(all_items, id_map)
    gates = all_items.select { |g| g.gate && !g.terminal }.sort_by!(&.line)

    gate_key = ->(g : Item) { g.id || "<line #{g.line}>" }

    own_blocked_by = ->(it : Item) do
      acc = [] of String
      it.needs.each do |t|
        next if t.includes?('#')
        if !id_map.has_key?(t)
          acc << t
        elsif !id_map[t].terminal
          acc << t
        end
      end
      acc
    end

    gated_by = ->(it : Item) do
      return [] of String if it.optional
      gates.select { |g| g.line < it.line }.map { |g| gate_key.call(g) }
    end

    progress = ->(it : Item) do
      return nil if it.children.empty?
      done = 0
      total = 0
      stack = it.children.dup
      until stack.empty?
        c = stack.pop
        if c.state != "cancelled"
          total += 1
          done += 1 if c.state == "done"
        end
        stack.concat(c.children)
      end
      {done: done, total: total}
    end

    resolve = uninitialized Item, Array(String) -> Nil
    resolve = ->(it : Item, parent_blocked_by : Array(String)) do
      own = own_blocked_by.call(it)
      combined = own.dup
      parent_blocked_by.each { |x| combined << x unless combined.includes?(x) }
      in_cycle = (iid = it.id) ? (cycle_members.includes?(iid) && !it.terminal) : false
      blocked = !combined.empty? || in_cycle
      gb = gated_by.call(it)
      actionable = it.state == "open" && !blocked && gb.empty? &&
                   it.children.all?(&.terminal)
      it.computed = Computed.new(blocked, combined, gb, actionable, progress.call(it))
      it.children.each { |c| resolve.call(c, combined) }
      nil
    end

    top.each { |it| resolve.call(it, [] of String) }
  end

  # --- model output ----------------------------------------------------------

  def emit_attrs(j : JSON::Builder, attrs : Hash(String, AttrVal))
    j.object do
      attrs.each do |k, v|
        j.field k do
          case v
          in Array(String)
            j.array { v.each { |x| j.string x } }
          in String
            j.string v
          end
        end
      end
    end
  end

  def emit_computed(j : JSON::Builder, c : Computed)
    j.object do
      j.field("blocked") { j.bool c.blocked }
      j.field("blockedBy") { j.array { c.blocked_by.each { |x| j.string x } } }
      j.field("gatedBy") { j.array { c.gated_by.each { |x| j.string x } } }
      j.field("actionable") { j.bool c.actionable }
      j.field "progress" do
        if p = c.progress
          j.object do
            j.field("done") { j.number p[:done] }
            j.field("total") { j.number p[:total] }
          end
        else
          j.null
        end
      end
    end
  end

  def emit_item(j : JSON::Builder, it : Item)
    j.object do
      j.field("id") { (v = it.id) ? j.string(v) : j.null }
      j.field("text") { j.string it.text }
      j.field("state") { j.string it.state }
      j.field("assignee") { (v = it.assignee) ? j.string(v) : j.null }
      j.field("classes") { j.array { it.classes.each { |c| j.string c } } }
      j.field("attrs") { emit_attrs(j, it.attrs) }
      j.field("section") { (v = it.section) ? j.string(v) : j.null }
      j.field("children") { j.array { it.children.each { |c| emit_item(j, c) } } }
      j.field "computed" do
        if c = it.computed
          emit_computed(j, c)
        else
          j.null
        end
      end
    end
  end

  # --- canonical serialization -----------------------------------------------

  def quote_value(val : String) : String
    if val.empty? || val.chars.any? { |c| c == ' ' || c == '\t' || c == '{' || c == '}' }
      "\"" + val + "\""
    else
      val
    end
  end

  def canonical_block(it : Item) : String
    parts = [] of String
    if iid = it.id
      parts << "#" + iid
    end
    it.classes.sort.each { |c| parts << "." + c }
    if a = it.assignee
      parts << "@" + a
    end
    it.attrs.keys.sort.each do |key|
      v = it.attrs[key]
      val = v.is_a?(Array) ? v.join(",") : v.as(String)
      parts << key + "=" + quote_value(val)
    end
    parts.empty? ? "" : "{" + parts.join(" ") + "}"
  end

  def canonical_line(it : Item) : String
    indent = "  " * it.depth
    mark = it.state == "open" ? " " : "x"
    ctext = it.state == "cancelled" ? "~~" + it.text + "~~" : it.text
    block = canonical_block(it)
    line = "#{indent}- [#{mark}] #{ctext}"
    line += " " + block unless block.empty?
    line
  end

  # --- slug generation (ID-4) ------------------------------------------------

  def gen_slug(text : String) : String
    words = text.downcase.split.first(3)
    slug = words.join("-")
    slug = slug.gsub(/[^a-z0-9-]/, "")
    slug = slug.gsub(/-+/, "-").strip('-')
    slug.empty? ? "item" : slug
  end

  def unique_id(base : String, used : Set(String)) : String
    return base unless used.includes?(base)
    n = 2
    while used.includes?("#{base}-#{n}")
      n += 1
    end
    "#{base}-#{n}"
  end

  # --- parse / lint output ---------------------------------------------------

  def emit_parse_model(doc : Doc) : String
    compute_derived(doc.top, doc.all_items)
    fm = doc.frontmatter
    JSON.build do |j|
      j.object do
        j.field("mdc") { j.string fm["mdc"] }
        j.field("kind") { j.string fm.fetch("kind", "list") }
        j.field "title" do
          if t = fm["title"]?
            j.string t
          else
            j.null
          end
        end
        j.field "frontmatter" do
          j.object do
            fm.each { |k, v| j.field(k) { j.string v } }
          end
        end
        j.field("items") { j.array { doc.top.each { |it| emit_item(j, it) } } }
        j.field "warnings" do
          j.array do
            doc.warnings.each do |w|
              j.object do
                j.field("rule") { j.string w.rule }
                j.field "line" do
                  (l = w.line) ? j.number(l) : j.null
                end
                j.field("message") { j.string w.message }
              end
            end
          end
        end
      end
    end
  end

  def lint_document(path : String) : Array(Finding)
    doc = load_document(path)
    return [] of Finding if doc.err
    frontmatter = doc.frontmatter
    compute_derived(doc.top, doc.all_items)
    id_map = id_map_of(doc.all_items)
    cycle_members = find_cycle_members(doc.all_items, id_map)

    findings = [] of Finding

    if frontmatter.has_key?("started") && !DATE_RE.matches?(frontmatter["started"])
      findings << Finding.new("invalid-date", "error", doc.started_line, nil,
        "invalid date \"#{frontmatter["started"]}\" for started; expected YYYY-MM-DD")
    end

    if frontmatter["kind"]? == "run" && frontmatter.has_key?("template")
      tmpl = frontmatter["template"]
      if !tmpl.includes?('@')
        findings << Finding.new("unpinned-template", "warning", nil, nil,
          "run pins template \"#{tmpl}\" without an @version; it may drift if the template changes")
      end
    end

    seen_ids = Set(String).new
    doc.all_items.each do |it|
      line = it.line
      iid = it.id
      if it.malformed
        findings << Finding.new("malformed-attributes", "error", line, nil, MALFORMED_MSG)
        next
      end
      line_sigil_warnings(it).each do |w|
        findings << Finding.new(w.rule, "error", line, iid, w.message)
      end
      if iid
        if seen_ids.includes?(iid)
          findings << Finding.new("duplicate-id", "error", line, iid, "duplicate id \"#{iid}\"")
        else
          seen_ids << iid
        end
      end
      it.needs.each do |t|
        if t.includes?('#')
          findings << Finding.new("unresolved-cross-file-ref", "warning", line, iid,
            "needs references cross-file target \"#{t}\"; v0 tooling does not resolve it")
        elsif !id_map.has_key?(t)
          findings << Finding.new("dangling-needs", "error", line, iid,
            "needs references unknown id \"#{t}\"")
        end
      end
      if iid && cycle_members.includes?(iid)
        findings << Finding.new("needs-cycle", "error", line, iid, "item is in a needs cycle")
      end
      {"due", "done"}.each do |dk|
        if (v = it.attrs[dk]?) && v.is_a?(String) && !DATE_RE.matches?(v)
          findings << Finding.new("invalid-date", "error", line, iid,
            "invalid date \"#{v}\" for #{dk}; expected YYYY-MM-DD")
        end
      end
      if (rv = it.attrs["repeat"]?) && rv.is_a?(String) && !REPEAT_RE.matches?(rv)
        findings << Finding.new("invalid-repeat", "error", line, iid,
          "invalid repeat \"#{rv}\"; expected (done|due)+<n><d|w|m>")
      end
      it.attrs.each_key do |key|
        if !RESERVED_KEYS.includes?(key) && !key.starts_with?("x-")
          findings << Finding.new("unknown-key", "warning", line, iid,
            "unknown key \"#{key}\"; extension keys must use the x- prefix")
        end
      end
      if it.state == "cancelled" && !it.attrs.has_key?("reason")
        findings << Finding.new("cancelled-without-reason", "warning", line, iid,
          "cancelled item has no reason=")
      end
      if canonical_line(it) != it.raw
        findings << Finding.new("non-canonical-state", "warning", line, iid,
          "not in canonical form; fmt would rewrite this line")
      end
    end

    # Stable sort by (line, rule), ties keep insertion order.
    indexed = findings.each_with_index.to_a
    indexed.sort! do |a, b|
      fa, ia = a
      fb, ib = b
      la = fa.line || -1
      lb = fb.line || -1
      cmp = la <=> lb
      cmp = fa.rule <=> fb.rule if cmp == 0
      cmp = ia <=> ib if cmp == 0
      cmp
    end
    indexed.map { |f, _| f }
  end

  def line_sigil_warnings(it : Item) : Array(Warning)
    found = [] of Warning
    tm = TASK_RE.match(it.raw)
    return found if tm.nil?
    _, block = find_trailing_block(tm[4].strip)
    return found if block.nil?
    parse_attributes(block, it.line).warnings.each do |w|
      if w.rule == "multiple-ids" || w.rule == "multiple-assignees"
        found << w
      end
    end
    found
  end

  def emit_findings(findings : Array(Finding)) : String
    JSON.build do |j|
      j.array do
        findings.each do |f|
          j.object do
            j.field("rule") { j.string f.rule }
            j.field("severity") { j.string f.severity }
            j.field("id") { (v = f.id) ? j.string(v) : j.null }
            j.field("message") { j.string f.message }
          end
        end
      end
    end
  end

  # --- fmt -------------------------------------------------------------------

  def do_fmt(path : String, assign_ids : Bool) : Int32
    doc = load_document(path)
    if e = doc.err
      STDERR.puts e
      return 1
    end
    if assign_ids
      used = Set(String).new
      doc.all_items.each { |it| (iid = it.id) && used.add(iid) }
      doc.all_items.each do |it|
        if it.id.nil? && !it.malformed
          new = unique_id(gen_slug(it.text), used)
          it.id = new
          used.add(new)
        end
      end
    end
    doc.all_items.each do |it|
      doc.lines[it.line - 1].content = canonical_line(it) unless it.malformed
    end
    File.write(path, rebuild(doc.bom, doc.lines))
    0
  end

  # --- mutations -------------------------------------------------------------

  def do_mutate(verb : String, path : String, item_id : String, flags : Hash(String, String)) : Int32
    doc = load_document(path)
    if e = doc.err
      STDERR.puts e
      return 1
    end
    it = id_map_of(doc.all_items)[item_id]?
    if it.nil?
      STDERR.puts "unknown id: #{item_id}"
      return 2
    end

    strip_soft = -> { it.classes = it.classes.reject { |c| SOFT_CLASSES.includes?(c) } }

    case verb
    when "check"
      return 2 if it.state != "open"
      it.state = "done"
      strip_soft.call
      it.attrs["done"] = flags["date"]? || today
      it.terminal = true
    when "uncheck"
      return 2 if it.state != "done"
      it.state = "open"
      it.attrs.delete("done")
      it.terminal = false
    when "cancel"
      return 2 if it.state == "cancelled"
      reason = flags["reason"]?
      if reason.nil?
        STDERR.puts "cancel requires --reason"
        return 1
      end
      it.state = "cancelled"
      strip_soft.call
      it.attrs["reason"] = reason
      it.terminal = true
    when "claim"
      handle = flags["as"]?
      if handle.nil?
        STDERR.puts "claim requires --as"
        return 1
      end
      return 2 unless it.assignee.nil?
      it.assignee = handle
    when "unclaim"
      return 2 if it.assignee.nil?
      frm = flags["from"]?
      return 2 if frm && it.assignee != frm
      it.assignee = nil
    when "start"
      return 2 if it.state != "open" || it.classes.includes?("doing")
      it.classes << "doing"
    when "unstart"
      return 2 unless it.classes.includes?("doing")
      it.classes = it.classes.reject { |c| c == "doing" }
    else
      STDERR.puts "unknown verb: #{verb}"
      return 1
    end

    new_line = canonical_line(it)
    doc.lines[it.line - 1].content = new_line
    File.write(path, rebuild(doc.bom, doc.lines))
    puts new_line
    0
  end

  # --- edit ------------------------------------------------------------------

  def do_edit(path : String, item_id : String, flags : Hash(String, String)) : Int32
    field_flags = {"text", "needs", "add-needs", "rm-needs", "add-class", "rm-class", "due"}
    present = field_flags.any? { |f| flags.has_key?(f) }
    if !present
      STDERR.puts "edit requires at least one field flag"
      return 1
    end
    if flags.has_key?("needs") && (flags.has_key?("add-needs") || flags.has_key?("rm-needs"))
      STDERR.puts "edit: --needs conflicts with --add-needs/--rm-needs"
      return 1
    end
    {"add-class", "rm-class"}.each do |ck|
      if (v = flags[ck]?) && SOFT_CLASSES.includes?(v)
        STDERR.puts "edit cannot change soft classes"
        return 1
      end
    end
    if (due = flags["due"]?) && !DATE_RE.matches?(due)
      STDERR.puts "edit: bad --due date"
      return 1
    end

    doc = load_document(path)
    if e = doc.err
      STDERR.puts e
      return 1
    end
    it = id_map_of(doc.all_items)[item_id]?
    if it.nil?
      STDERR.puts "unknown id: #{item_id}"
      return 2
    end

    if t = flags["text"]?
      it.text = t
    end
    if n = flags["needs"]?
      vals = n.split(",").reject(&.empty?)
      if !vals.empty?
        it.attrs["needs"] = vals
      else
        it.attrs.delete("needs")
      end
    end
    if an = flags["add-needs"]?
      cur = (it.attrs["needs"]?.as?(Array(String)) || [] of String).dup
      an.split(",").each do |v|
        cur << v if !v.empty? && !cur.includes?(v)
      end
      it.attrs["needs"] = cur
    end
    if rn = flags["rm-needs"]?
      rm = rn.split(",")
      cur = (it.attrs["needs"]?.as?(Array(String)) || [] of String).reject { |v| rm.includes?(v) }
      if !cur.empty?
        it.attrs["needs"] = cur
      else
        it.attrs.delete("needs")
      end
    end
    if (ac = flags["add-class"]?) && !it.classes.includes?(ac)
      it.classes << ac
    end
    if rc = flags["rm-class"]?
      it.classes = it.classes.reject { |c| c == rc }
    end
    if due = flags["due"]?
      it.attrs["due"] = due
    end

    new_line = canonical_line(it)
    doc.lines[it.line - 1].content = new_line
    File.write(path, rebuild(doc.bom, doc.lines))
    puts new_line
    0
  end

  # --- add -------------------------------------------------------------------

  def do_add(path : String, text : String, flags : Hash(String, String)) : Int32
    if text.empty?
      STDERR.puts "add requires non-empty text"
      return 1
    end
    if flags.has_key?("after") && flags.has_key?("section")
      STDERR.puts "add: --after and --section are mutually exclusive"
      return 1
    end
    if (idf = flags["id"]?) && !SLUG_RE.matches?(idf)
      STDERR.puts "add: malformed --id slug"
      return 1
    end
    if (due = flags["due"]?) && !DATE_RE.matches?(due)
      STDERR.puts "add: bad --due date"
      return 1
    end

    doc = load_document(path)
    if e = doc.err
      STDERR.puts e
      return 1
    end
    lines = doc.lines
    all_items = doc.all_items
    used = Set(String).new
    all_items.each { |it| (iid = it.id) && used.add(iid) }

    new_id = ""
    if idf = flags["id"]?
      if used.includes?(idf)
        STDERR.puts "add: id collision #{idf}"
        return 2
      end
      new_id = idf
    else
      new_id = unique_id(gen_slug(text), used)
    end

    depth = 0
    insert_at = nil
    if af = flags["after"]?
      target = id_map_of(all_items)[af]?
      if target.nil?
        STDERR.puts "add: unknown --after id #{af}"
        return 2
      end
      depth = target.depth
      l = target.line - 1
      tind = indent_of(lines[l].content)
      j = l + 1
      while j < lines.size && !lines[j].content.strip.empty? && indent_of(lines[j].content) > tind
        j += 1
      end
      insert_at = j
    elsif sec = flags["section"]?
      hidx = nil
      logical_of(lines).each_with_index do |content, idx|
        hm = HEADING_RE.match(content)
        if hm && hm[2] == sec
          hidx = idx
          break
        end
      end
      if hidx.nil?
        STDERR.puts "add: unknown --section #{sec}"
        return 2
      end
      j = hidx + 1
      last = hidx
      while j < lines.size
        break if HEADING_RE.matches?(lines[j].content)
        last = j if !lines[j].content.strip.empty?
        j += 1
      end
      insert_at = last + 1
    end

    attrs = {} of String => AttrVal
    needs = flags.has_key?("needs") ? flags["needs"].split(",").reject(&.empty?) : [] of String
    attrs["needs"] = needs unless needs.empty?
    if due = flags["due"]?
      attrs["due"] = due
    end
    classes = flags.has_key?("class") ? flags["class"].split(",").reject(&.empty?) : [] of String

    new_item = Item.new(text: text, state: "open", depth: depth)
    new_item.id = new_id
    new_item.classes = classes
    new_item.assignee = flags["as"]?
    new_item.attrs = attrs
    new_line = canonical_line(new_item)
    nl = newline_of(lines)

    if insert_at.nil?
      if !lines.empty? && lines[-1].ending == ""
        lines[-1].ending = nl
        lines << Line.new(new_line, "")
      else
        lines << Line.new(new_line, nl)
      end
    else
      lines.insert(insert_at, Line.new(new_line, nl))
    end

    File.write(path, rebuild(doc.bom, lines))
    puts new_line
    0
  end

  # --- note ------------------------------------------------------------------

  def do_note(path : String, item_id : String, message : String, flags : Hash(String, String)) : Int32
    if message.empty? || message.includes?('\n')
      STDERR.puts "note requires a non-empty single-line message"
      return 1
    end
    doc = load_document(path)
    if e = doc.err
      STDERR.puts e
      return 1
    end
    lines = doc.lines
    it = id_map_of(doc.all_items)[item_id]?
    if it.nil?
      STDERR.puts "unknown id: #{item_id}"
      return 2
    end

    depth = it.depth
    prefix = "  " * (depth + 1)
    author = flags["as"]?
    date = flags["date"]? || today
    note_line = prefix + "- note" + (author ? " @#{author}" : "") + " #{date}: #{message}"

    l = it.line - 1
    item_indent = indent_of(lines[l].content)
    insert_at = l + 1
    j = l + 1
    while j < lines.size
      c = lines[j].content
      break if c.strip.empty? || indent_of(c) <= item_indent
      insert_at = j + 1 if c.lstrip(' ').starts_with?("- note")
      j += 1
    end

    nl = newline_of(lines)
    if insert_at >= lines.size && !lines.empty? && lines[-1].ending == ""
      lines[-1].ending = nl
      lines << Line.new(note_line, "")
    else
      lines.insert(insert_at, Line.new(note_line, nl))
    end

    File.write(path, rebuild(doc.bom, lines))
    puts note_line
    0
  end

  # --- cut -------------------------------------------------------------------

  def do_cut(template_path : String, flags : Hash(String, String)) : Int32
    out_path = flags["out"]?
    if out_path.nil?
      STDERR.puts "cut requires --out"
      return 1
    end
    ref = flags["template-ref"]?
    if ref.nil?
      STDERR.puts "cut requires --template-ref"
      return 1
    end
    doc = load_document(template_path)
    if e = doc.err
      STDERR.puts e
      return 1
    end
    frontmatter = doc.frontmatter
    if frontmatter["kind"]? != "template"
      STDERR.puts "cut: source is not a kind: template document"
      return 1
    end
    if File.exists?(out_path)
      STDERR.puts "cut: #{out_path} already exists"
      return 2
    end

    nl = newline_of(doc.lines)
    title = flags["title"]? || frontmatter["title"]?
    fm_lines = ["---", "mdc: \"0.1\"", "kind: run", "template: #{ref}"]
    if title
      fm_lines << "title: #{title}"
    end
    if m = frontmatter["mode"]?
      fm_lines << "mode: #{m}"
    end
    fm_lines << "started: #{flags["date"]? || today}"
    handled = Set{"mdc", "kind", "title", "template", "mode", "started"}
    frontmatter.each do |k, v|
      fm_lines << "#{k}: #{v}" unless handled.includes?(k)
    end
    fm_lines << "---"

    out_lines = fm_lines.map { |c| Line.new(c, nl) }

    reset_by_line = {} of Int32 => String
    doc.all_items.each do |it|
      next if it.malformed
      r = Item.new(text: it.text, state: "open", depth: it.depth)
      r.id = it.id
      r.assignee = nil
      r.attrs = {} of String => AttrVal
      it.attrs.each do |k, v|
        r.attrs[k] = v unless k == "done" || k == "due" || k == "reason"
      end
      r.classes = it.classes.reject { |c| SOFT_CLASSES.includes?(c) }
      reset_by_line[it.line] = canonical_line(r)
    end

    fm_end = doc.fm_end.not_nil!
    ((fm_end + 1)...doc.lines.size).each do |idx|
      line = doc.lines[idx]
      lineno = idx + 1
      content = reset_by_line[lineno]? || line.content
      out_lines << Line.new(content, line.ending)
    end

    File.write(out_path, rebuild(doc.bom, out_lines))
    0
  end

  # --- CLI -------------------------------------------------------------------

  def parse_flags(args : Array(String), boolean_flags = Set(String).new) : {Array(String), Hash(String, String)}
    pos = [] of String
    flags = {} of String => String
    i = 0
    while i < args.size
      a = args[i]
      if a.starts_with?("--")
        name = a[2..]
        if boolean_flags.includes?(name)
          flags[name] = "true"
          i += 1
        else
          flags[name] = i + 1 < args.size ? args[i + 1] : ""
          i += 2
        end
      else
        pos << a
        i += 1
      end
    end
    {pos, flags}
  end

  def run(argv : Array(String)) : Int32
    if argv.empty?
      STDERR.puts "usage: mdc <verb> <file> [args]"
      return 1
    end
    verb = argv[0]
    rest = argv[1..]

    begin
      if verb == "parse" || verb == "lint"
        file_arg = rest.find { |a| !a.starts_with?("-") }
        if file_arg.nil?
          STDERR.puts "usage: mdc <verb> <file> --json"
          return 1
        end
        if verb == "parse"
          doc = load_document(file_arg)
          if e = doc.err
            puts %({"error":"#{e}"})
            return 1
          end
          puts emit_parse_model(doc)
          return 0
        end
        puts emit_findings(lint_document(file_arg))
        return 0
      end

      if verb == "fmt"
        pos, flags = parse_flags(rest, Set{"assign-ids"})
        if pos.empty?
          STDERR.puts "usage: mdc fmt [--assign-ids] <file>"
          return 1
        end
        return do_fmt(pos[0], flags.has_key?("assign-ids"))
      end

      if {"check", "uncheck", "cancel", "claim", "unclaim", "start", "unstart"}.includes?(verb)
        pos, flags = parse_flags(rest)
        if pos.size < 2
          STDERR.puts "usage: mdc #{verb} <file> <id> [flags]"
          return 1
        end
        return do_mutate(verb, pos[0], pos[1], flags)
      end

      if verb == "edit"
        pos, flags = parse_flags(rest)
        if pos.size < 2
          STDERR.puts "usage: mdc edit <file> <id> [flags]"
          return 1
        end
        return do_edit(pos[0], pos[1], flags)
      end

      if verb == "add"
        pos, flags = parse_flags(rest)
        if pos.size < 2
          STDERR.puts "usage: mdc add <file> \"<text>\" [flags]"
          return 1
        end
        return do_add(pos[0], pos[1], flags)
      end

      if verb == "note"
        pos, flags = parse_flags(rest)
        if pos.size < 3
          STDERR.puts "usage: mdc note <file> <id> \"<text>\" [flags]"
          return 1
        end
        return do_note(pos[0], pos[1], pos[2], flags)
      end

      if verb == "cut"
        pos, flags = parse_flags(rest)
        if pos.empty?
          STDERR.puts "usage: mdc cut <template> --out <file> --template-ref <ref>"
          return 1
        end
        return do_cut(pos[0], flags)
      end
    rescue ex : File::NotFoundError
      STDERR.puts "cannot read file: #{ex.message}"
      return 1
    end

    STDERR.puts "unknown verb: #{verb}"
    1
  end
end

exit(Mdc.run(ARGV))
