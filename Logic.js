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
  return { sites: sites, browser: browser, defaultSite: defaultSite }
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

// Result rows shown under the input.
// Row: { kind: "open" | "search" | "tag", url, site (keyword), label, query }
function buildRows(config, tag, text) {
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
