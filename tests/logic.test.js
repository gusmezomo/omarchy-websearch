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

if (failed) { console.log(failed + " failed"); process.exit(1) }
console.log("all passed")
