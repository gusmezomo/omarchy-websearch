.pragma library

// Pure helpers for the web search launcher. No QML dependencies, so this file
// can be tested with plain node (see tests/logic.test.js).

var KEYWORD_RE = /^[a-z0-9]{1,12}$/i
var MAX_NAME = 40
var MAX_URL = 2048

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function validCommand(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > 16) return false
  for (var i = 0; i < v.length; i++) {
    if (typeof v[i] !== "string" || v[i].length === 0 || v[i].length > 512) return false
  }
  return true
}

function validHttpUrl(s) {
  return typeof s === "string" && s.length <= MAX_URL && /^https?:\/\/[^\s]+$/i.test(s)
}

function originOf(url) {
  var m = /^(https?:\/\/[^\/?#]+)/i.exec(url)
  return m ? m[1] : ""
}

// Validate and normalize one site entry. Returns null when unusable.
function normalizeSite(keyword, raw) {
  if (!KEYWORD_RE.test(keyword) || !isPlainObject(raw)) return null
  var name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_NAME) : ""
  var url = raw.url
  if (!name || !validHttpUrl(url) || url.indexOf("%s") === -1) return null
  var home = validHttpUrl(raw.home) ? raw.home : originOf(url)
  var icon = typeof raw.icon === "string" ? raw.icon.slice(0, 8) : ""
  var color = typeof raw.color === "string" && /^#[0-9a-f]{3,8}$/i.test(raw.color) ? raw.color : ""
  var site = { keyword: keyword, name: name, url: url, home: home, icon: icon, color: color }
  if (validCommand(raw.browser)) site.browser = raw.browser.slice()
  return site
}

// Merge default sites with user overrides. A user entry replaces fields of the
// default with the same keyword; `null` removes a default site.
function mergeSites(defaults, overrides) {
  var merged = {}
  var k
  if (isPlainObject(defaults)) for (k in defaults) merged[k] = defaults[k]
  if (isPlainObject(overrides)) {
    for (k in overrides) {
      if (overrides[k] === null) { delete merged[k]; continue }
      if (!isPlainObject(overrides[k])) continue
      var base = isPlainObject(merged[k]) ? merged[k] : {}
      var entry = {}
      var f
      for (f in base) entry[f] = base[f]
      for (f in overrides[k]) entry[f] = overrides[k][f]
      merged[k] = entry
    }
  }
  var out = {}
  for (k in merged) {
    var site = normalizeSite(k, merged[k])
    if (site) out[k] = site
  }
  return out
}

// Build the effective config from the bundled defaults and the user file.
function buildConfig(defaultsJson, userJson) {
  var defaults = parseJson(defaultsJson) || {}
  var user = parseJson(userJson) || {}
  var sites = mergeSites(defaults.sites, user.sites)
  var browser = validCommand(user.browser) ? user.browser.slice()
    : (validCommand(defaults.browser) ? defaults.browser.slice() : [])
  var defaultSite = typeof user.defaultSite === "string" && sites[user.defaultSite] ? user.defaultSite
    : (typeof defaults.defaultSite === "string" && sites[defaults.defaultSite] ? defaults.defaultSite : "")
  if (!defaultSite) {
    for (var k in sites) { defaultSite = k; break }
  }
  return { sites: sites, browser: browser, defaultSite: defaultSite, history: historySettings(user.history) }
}

var HISTORY_DEFAULTS = { enabled: true, days: 30, max: 300 }

function historySettings(raw) {
  var h = { enabled: HISTORY_DEFAULTS.enabled, days: HISTORY_DEFAULTS.days, max: HISTORY_DEFAULTS.max }
  if (!isPlainObject(raw)) return h
  if (typeof raw.enabled === "boolean") h.enabled = raw.enabled
  if (typeof raw.days === "number" && isFinite(raw.days) && raw.days > 0) h.days = Math.min(raw.days, 3650)
  if (typeof raw.max === "number" && isFinite(raw.max) && raw.max >= 1) h.max = Math.min(Math.floor(raw.max), 5000)
  return h
}

function parseJson(text) {
  if (typeof text !== "string" || !text.trim()) return null
  try {
    var v = JSON.parse(text)
    return isPlainObject(v) ? v : null
  } catch (e) {
    return null
  }
}

// Returns a normalized URL to open, or "" when the text is not a URL.
function urlFor(text) {
  var s = String(text || "").trim()
  if (!s || /\s/.test(s) || s.length > MAX_URL) return ""
  if (/^(https?|ftp|file):\/\//i.test(s)) return s
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return ""
  if (/^localhost(:\d{1,5})?([\/?#]\S*)?$/i.test(s)) return "http://" + s
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?([\/?#]\S*)?$/.test(s)) return "http://" + s
  if (/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d{1,5})?([\/?#]\S*)?$/i.test(s)) return "https://" + s
  return ""
}

function searchUrl(site, query) {
  var q = String(query || "").trim()
  if (!site) return ""
  if (!q) return site.home
  return site.url.split("%s").join(encodeURIComponent(q))
}

// True when the typed text is exactly a keyword and can become a tag.
function keywordFor(sites, text) {
  var s = String(text || "")
  return Object.prototype.hasOwnProperty.call(sites, s) ? s : ""
}

// Result rows shown under the input: the main rows, then history suggestions.
// Row: { kind: "open" | "search" | "tag" | "history", url, site (keyword), query }
function buildRows(config, tag, text, history, now) {
  var rows = mainRows(config, tag, text)
  if (history && history.length) rows = rows.concat(suggestions(history, config, tag, text, now, 5))
  return rows
}

function mainRows(config, tag, text) {
  var sites = config.sites
  var q = String(text || "").trim()
  var rows = []
  if (tag && sites[tag]) {
    rows.push({ kind: "search", site: tag, query: q, url: searchUrl(sites[tag], q) })
    return rows
  }
  var def = sites[config.defaultSite]
  var url = urlFor(q)
  if (url) rows.push({ kind: "open", site: "", query: q, url: url })
  if (def) rows.push({ kind: "search", site: config.defaultSite, query: q, url: q ? searchUrl(def, q) : "" })
  var kw = keywordFor(sites, String(text || ""))
  if (kw && kw !== config.defaultSite) rows.push({ kind: "tag", site: kw, query: "", url: "" })
  return rows
}

// ---------------------------------------------------------------------------
// History: what was opened through the launcher, stored locally as a JSON
// array of { kind: "search" | "open", site, query, url, count, last }.

var MAX_QUERY = 500
var DAY_MS = 86400000

function validOpenUrl(s) {
  return typeof s === "string" && s.length <= MAX_URL && /^(https?|ftp|file):\/\/\S+$/i.test(s)
}

function normalizeEntry(raw) {
  if (!isPlainObject(raw)) return null
  var kind = raw.kind === "search" || raw.kind === "open" ? raw.kind : ""
  if (!kind || !validOpenUrl(raw.url)) return null
  var query = typeof raw.query === "string" ? raw.query.trim().slice(0, MAX_QUERY) : ""
  var site = typeof raw.site === "string" && KEYWORD_RE.test(raw.site) ? raw.site : ""
  if (kind === "search" && (!query || !site)) return null
  var count = typeof raw.count === "number" && isFinite(raw.count) ? Math.max(1, Math.min(Math.floor(raw.count), 1000000)) : 1
  var last = typeof raw.last === "number" && isFinite(raw.last) && raw.last > 0 ? raw.last : 0
  if (!last) return null
  return { kind: kind, site: kind === "search" ? site : "", query: query, url: raw.url, count: count, last: last }
}

function entryKey(e) {
  return e.kind === "open" ? "open|" + e.url : "search|" + e.site + "|" + e.query.toLowerCase()
}

function parseHistory(text) {
  if (typeof text !== "string" || !text.trim()) return []
  var raw
  try { raw = JSON.parse(text) } catch (e) { return [] }
  if (!Array.isArray(raw)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < raw.length && i < 10000; i++) {
    var e = normalizeEntry(raw[i])
    if (!e) continue
    var key = entryKey(e)
    if (seen[key]) continue
    seen[key] = true
    out.push(e)
  }
  return out
}

// Drop entries older than `days`, keep the newest `max`, newest first.
function pruneHistory(history, now, settings) {
  var cutoff = now - settings.days * DAY_MS
  var out = history.filter(function(e) { return e.last >= cutoff })
  out.sort(function(a, b) { return b.last - a.last })
  return out.slice(0, settings.max)
}

// History entry for an activated row, or null when it shouldn't be kept.
function entryForRow(row, now) {
  if (!row || !row.url) return null
  var kind = row.kind === "history" ? row.historyKind : row.kind
  if (kind === "search") {
    if (!row.query) return null
    return normalizeEntry({ kind: "search", site: row.site, query: row.query, url: row.url, count: 1, last: now })
  }
  if (kind === "open") {
    return normalizeEntry({ kind: "open", site: "", query: displayUrl(row.url), url: row.url, count: 1, last: now })
  }
  return null
}

// Add or bump an entry, then prune.
function recordEntry(history, entry, now, settings) {
  if (!entry) return history
  var key = entryKey(entry)
  var out = []
  var count = 0
  for (var i = 0; i < history.length; i++) {
    if (entryKey(history[i]) === key) count = history[i].count
    else out.push(history[i])
  }
  var e = { kind: entry.kind, site: entry.site, query: entry.query, url: entry.url, count: count + 1, last: now }
  out.unshift(e)
  return pruneHistory(out, now, settings)
}

function removeEntry(history, key) {
  return history.filter(function(e) { return entryKey(e) !== key })
}

function displayUrl(url) {
  return String(url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "")
}

// Up to `limit` history rows matching the typed text. Nothing for an empty
// field. With a tag, only that site's searches. Prefix matches rank first,
// then entries used often and recently.
function suggestions(history, config, tag, text, now, limit) {
  var q = String(text || "").trim().toLowerCase()
  if (!q || !config.history || !config.history.enabled) return []
  var typedUrl = urlFor(q)
  var mainSite = tag || config.defaultSite
  var scored = []
  for (var i = 0; i < history.length; i++) {
    var e = history[i]
    if (tag && (e.kind !== "search" || e.site !== tag)) continue
    if (e.kind === "search" && !config.sites[e.site]) continue
    var hay = (e.kind === "search" ? e.query : displayUrl(e.url)).toLowerCase()
    var at = hay.indexOf(q)
    if (at === -1) continue
    // Already offered by the main row.
    if (e.kind === "search" && e.site === mainSite && hay === q) continue
    if (e.kind === "open" && typedUrl && displayUrl(typedUrl).toLowerCase() === hay) continue
    var ageDays = Math.max(0, (now - e.last) / DAY_MS)
    var score = Math.log(1 + e.count) + 2 / (1 + ageDays)
    if (at === 0) score += 100
    scored.push({ e: e, score: score })
  }
  scored.sort(function(a, b) { return b.score - a.score || b.e.last - a.e.last })
  var rows = []
  for (var j = 0; j < scored.length && rows.length < (limit || 5); j++) {
    var h = scored[j].e
    rows.push({ kind: "history", historyKind: h.kind, site: h.site, query: h.query, url: h.url, key: entryKey(h) })
  }
  return rows
}

// Command used to open a URL: the site's browser, else the global one, else
// xdg-open. A missing browser binary falls back to xdg-open at run time.
// The URL is always a separate argv element, never shell-interpolated.
function openCommand(config, siteKeyword, url) {
  var site = siteKeyword ? config.sites[siteKeyword] : null
  var browser = site && site.browser ? site.browser : config.browser
  if (!browser || browser.length === 0) return ["xdg-open", url]
  var script = 'if command -v "$1" >/dev/null 2>&1; then exec "$@"; fi; '
    + 'notify-send "Web Search" "Browser not found: $1 (using the default browser)" 2>/dev/null; '
    + 'for a; do u="$a"; done; exec xdg-open "$u"'
  return ["sh", "-c", script, "websearch"].concat(browser, [url])
}
