// Run: node tests/logic.test.js
const fs = require("fs")
const path = require("path")
const vm = require("vm")
const assert = require("assert")

const dir = path.join(__dirname, "..")
const src = fs.readFileSync(path.join(dir, "Logic.js"), "utf8").replace(/^\.pragma library/m, "")
const L = {}
vm.createContext(L)
vm.runInContext(src, L)
const defaults = fs.readFileSync(path.join(dir, "sites.json"), "utf8")

let failed = 0
function test(name, fn) {
  try { fn(); console.log("ok   " + name) } catch (e) { failed++; console.log("FAIL " + name + "\n     " + e.message) }
}
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b)

test("urlFor detects URLs", () => {
  eq(L.urlFor("https://example.com/x?y=1"), "https://example.com/x?y=1")
  eq(L.urlFor("github.com/foo"), "https://github.com/foo")
  eq(L.urlFor("localhost:5173"), "http://localhost:5173")
  eq(L.urlFor("localhost"), "http://localhost")
  eq(L.urlFor("192.168.0.1:8080/admin"), "http://192.168.0.1:8080/admin")
  eq(L.urlFor("  sub.example.co.uk  "), "https://sub.example.co.uk")
})

test("urlFor rejects searches and unsafe schemes", () => {
  eq(L.urlFor("como fazer pão"), "")
  eq(L.urlFor("hello"), "")
  eq(L.urlFor("javascript:alert(1)"), "")
  eq(L.urlFor("chrome://settings"), "")
  eq(L.urlFor("1.5"), "")
  eq(L.urlFor(""), "")
})

test("default sites load", () => {
  const c = L.buildConfig(defaults, "")
  eq(Object.keys(c.sites).sort(), ["g", "gh", "red", "tr", "x", "yt"])
  eq(c.defaultSite, "g")
  eq(c.browser, [])
  eq(c.sites.tr.home, "https://translate.google.com")
  eq(c.sites.yt.home, "https://www.youtube.com")
})

test("user config overrides, adds and removes sites", () => {
  const user = JSON.stringify({
    browser: ["zen-browser"],
    sites: {
      red: null,
      yt: { browser: ["chromium"] },
      ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
      bad: { name: "No placeholder", url: "https://x.com/" },
      "no space": { name: "X", url: "https://x.com/?q=%s" },
      evil: { name: "Evil", url: "javascript:%s" }
    }
  })
  const c = L.buildConfig(defaults, user)
  eq(Object.keys(c.sites).sort(), ["ddg", "g", "gh", "tr", "x", "yt"])
  eq(c.browser, ["zen-browser"])
  eq(c.sites.yt.browser, ["chromium"])
  eq(c.sites.yt.name, "YouTube")
})

test("broken user JSON falls back to defaults", () => {
  const c = L.buildConfig(defaults, "{ not json")
  eq(c.defaultSite, "g")
  eq(Object.keys(c.sites).length, 6)
})

test("searchUrl encodes the query", () => {
  const c = L.buildConfig(defaults, "")
  eq(L.searchUrl(c.sites.g, "a b&c"), "https://www.google.com/search?q=a%20b%26c")
  eq(L.searchUrl(c.sites.yt, ""), "https://www.youtube.com")
})

test("keywordFor is exact", () => {
  const c = L.buildConfig(defaults, "")
  eq(L.keywordFor(c.sites, "yt"), "yt")
  eq(L.keywordFor(c.sites, "yt "), "")
  eq(L.keywordFor(c.sites, "YT"), "")
  eq(L.keywordFor(c.sites, "y"), "")
  eq(L.keywordFor(c.sites, "constructor"), "")
})

test("rows", () => {
  const c = L.buildConfig(defaults, "")
  eq(L.buildRows(c, "", "").map(r => r.kind), ["search"])
  eq(L.buildRows(c, "", "github.com/foo").map(r => r.kind), ["open", "search"])
  eq(L.buildRows(c, "", "yt").map(r => r.kind + ":" + r.site), ["search:g", "tag:yt"])
  eq(L.buildRows(c, "", "g").map(r => r.kind), ["search"])
  const tagged = L.buildRows(c, "yt", "github.com")
  eq(tagged.length, 1)
  eq(tagged[0].url, "https://www.youtube.com/results?search_query=github.com")
})

test("openCommand keeps the URL as its own argument", () => {
  const c = L.buildConfig(defaults, JSON.stringify({ browser: ["zen-browser"], sites: { yt: { browser: ["chromium", "--new-window"] } } }))
  const url = "https://x.com/?q=$(rm -rf ~)"
  const cmd = L.openCommand(c, "g", url)
  eq(cmd.slice(0, 2), ["sh", "-c"])
  eq(cmd.slice(3), ["websearch", "zen-browser", url])
  eq(L.openCommand(c, "yt", url).slice(4), ["chromium", "--new-window", url])
  eq(L.openCommand(L.buildConfig(defaults, ""), "g", url), ["xdg-open", url])
})

const DAY = 86400000
const NOW = Date.UTC(2026, 10, 12, 12)

test("history settings default to 30 days and can be changed", () => {
  eq(L.buildConfig(defaults, "").history, { enabled: true, days: 30, max: 300 })
  eq(L.buildConfig(defaults, JSON.stringify({ history: { enabled: false, days: 7, max: 50 } })).history, { enabled: false, days: 7, max: 50 })
  eq(L.buildConfig(defaults, JSON.stringify({ history: { days: -1, max: "x" } })).history, { enabled: true, days: 30, max: 300 })
})

test("parseHistory drops invalid and duplicate entries", () => {
  const raw = JSON.stringify([
    { kind: "search", site: "yt", query: "lofi", url: "https://www.youtube.com/results?search_query=lofi", count: 2, last: NOW },
    { kind: "search", site: "yt", query: "LOFI", url: "https://www.youtube.com/results?search_query=LOFI", count: 1, last: NOW },
    { kind: "open", url: "javascript:alert(1)", last: NOW },
    { kind: "search", site: "yt", query: "", url: "https://www.youtube.com", last: NOW },
    { kind: "evil", url: "https://x.com", last: NOW },
    "junk"
  ])
  const h = L.parseHistory(raw)
  eq(h.length, 1)
  eq(h[0].query, "lofi")
  eq(L.parseHistory("{ not json"), [])
  eq(L.parseHistory("{}"), [])
})

test("recordEntry bumps repeats and prunes by age and size", () => {
  const s = { enabled: true, days: 30, max: 2 }
  let h = []
  const row = { kind: "search", site: "yt", query: "lofi", url: "https://www.youtube.com/results?search_query=lofi" }
  h = L.recordEntry(h, L.entryForRow(row, NOW - 2 * DAY), NOW - 2 * DAY, s)
  h = L.recordEntry(h, L.entryForRow(row, NOW), NOW, s)
  eq(h.length, 1)
  eq(h[0].count, 2)
  h = L.recordEntry(h, L.entryForRow({ kind: "open", url: "https://github.com/foo" }, NOW), NOW, s)
  h = L.recordEntry(h, L.entryForRow({ kind: "open", url: "https://example.com/" }, NOW), NOW, s)
  eq(h.length, 2)
  eq(h[0].query, "example.com")
  const old = [{ kind: "open", site: "", query: "a.com", url: "https://a.com", count: 1, last: NOW - 31 * DAY }]
  eq(L.pruneHistory(old, NOW, { days: 30, max: 300 }), [])
})

test("entryForRow skips empty searches, tags and home pages", () => {
  eq(L.entryForRow({ kind: "search", site: "yt", query: "", url: "https://www.youtube.com" }, NOW), null)
  eq(L.entryForRow({ kind: "tag", site: "yt", query: "", url: "" }, NOW), null)
  eq(L.entryForRow({ kind: "history", historyKind: "search", site: "g", query: "a", url: "https://www.google.com/search?q=a" }, NOW).kind, "search")
})

test("suggestions: nothing for an empty field, matches while typing", () => {
  const c = L.buildConfig(defaults, "")
  const h = [
    { kind: "search", site: "yt", query: "lofi beats", url: "https://www.youtube.com/results?search_query=lofi%20beats", count: 1, last: NOW },
    { kind: "search", site: "g", query: "best lofi albums", url: "https://www.google.com/search?q=best%20lofi%20albums", count: 9, last: NOW - DAY },
    { kind: "open", site: "", query: "github.com/quickshell-mirror", url: "https://github.com/quickshell-mirror", count: 1, last: NOW },
    { kind: "search", site: "gone", query: "lofi radio", url: "https://gone.example/?q=lofi", count: 1, last: NOW }
  ]
  eq(L.suggestions(h, c, "", "", NOW, 5), [])
  eq(L.suggestions(h, c, "", "   ", NOW, 5), [])
  // Prefix match first, then contains; removed sites are skipped.
  eq(L.suggestions(h, c, "", "lofi", NOW, 5).map(r => r.query), ["lofi beats", "best lofi albums"])
  eq(L.suggestions(h, c, "", "git", NOW, 5).map(r => r.historyKind), ["open"])
  // A tag limits suggestions to that site.
  eq(L.suggestions(h, c, "yt", "lofi", NOW, 5).map(r => r.query), ["lofi beats"])
  eq(L.suggestions(h, c, "gh", "lofi", NOW, 5), [])
  // Disabled history suggests nothing.
  const off = L.buildConfig(defaults, JSON.stringify({ history: { enabled: false } }))
  eq(L.suggestions(h, off, "", "lofi", NOW, 5), [])
})

test("suggestions skip what the main row already offers", () => {
  const c = L.buildConfig(defaults, "")
  const h = [
    { kind: "search", site: "g", query: "lofi", url: "https://www.google.com/search?q=lofi", count: 1, last: NOW },
    { kind: "open", site: "", query: "github.com/foo", url: "https://github.com/foo", count: 1, last: NOW }
  ]
  eq(L.suggestions(h, c, "", "LOFI", NOW, 5), [])
  eq(L.suggestions(h, c, "", "github.com/foo", NOW, 5), [])
  eq(L.buildRows(c, "", "github.com/f", h, NOW).map(r => r.kind), ["open", "search", "history"])
  eq(L.buildRows(c, "", "", h, NOW).map(r => r.kind), ["search"])
})

if (failed) { console.log(failed + " failed"); process.exit(1) }
console.log("all passed")
