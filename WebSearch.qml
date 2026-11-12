import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Logic.js" as Logic

Item {
  id: root

  property var shell: null
  property var manifest: null

  property bool opened: false
  property string tag: ""
  property int selectedIndex: 0
  property var rows: []
  property var config: ({ sites: {}, browser: [], defaultSite: "" })

  property string defaultsText: ""
  property string userText: ""
  property var history: []
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/+$/, "")
  readonly property string userConfigPath: Quickshell.env("HOME") + "/.config/omarchy/websearch.json"
  // Searches and links opened through the launcher. Local only.
  readonly property string historyDir: (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/omarchy-websearch"
  readonly property string historyPath: historyDir + "/history.json"

  // Theme: shares the [menu] surface tokens, like the other Omarchy overlays.
  readonly property color background: Commons.Color.menu.background
  readonly property color foreground: Commons.Color.menu.text
  readonly property color scrim: Commons.Color.menu.scrim
  readonly property color selectedBackground: Util.alpha(foreground, 0.12)
  readonly property color subtle: Util.alpha(foreground, 0.55)
  readonly property var borderSpec: Border.surfaceSpec("menu", "border", Util.alpha(foreground, 0.14), Math.max(1, Style.space(1)))
  readonly property string fontFamily: Style.font.menuFamily

  readonly property int cardWidth: Math.min(Style.space(440), panel.width - Style.gapsOut * 4)
  readonly property int cardRadius: Math.max(Style.cornerRadius, Style.space(12))
  readonly property int rowRadius: Math.max(Style.cornerRadius - Style.space(4), Style.space(8))
  readonly property int pad: Style.space(8)
  readonly property int inputHeight: Style.space(40)
  readonly property int rowHeight: Style.space(36)

  Commons.Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function open(payloadJson) {
    root.tag = ""
    input.text = ""
    root.rebuild()
    root.opened = true
    Qt.callLater(function() { input.forceActiveFocus() })
  }

  function close() {
    root.opened = false
  }

  function dismiss() {
    root.opened = false
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide((root.manifest && root.manifest.id) || "gusmezomo.websearch")
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  function reloadConfig() {
    root.config = Logic.buildConfig(root.defaultsText, root.userText)
    if (root.tag && !root.config.sites[root.tag]) root.tag = ""
    root.rebuild()
  }

  function rebuild() {
    var history = root.config.history && root.config.history.enabled ? root.history : []
    root.rows = Logic.buildRows(root.config, root.tag, input.text, history, Date.now())
    root.selectedIndex = 0
  }

  function loadHistory(text) {
    var now = Date.now()
    root.history = Logic.pruneHistory(Logic.parseHistory(text), now, root.config.history || { days: 30, max: 300 })
    if (root.opened) root.rebuild()
  }

  function saveHistory() {
    historyFile.setText(JSON.stringify(root.history, null, 2) + "\n")
  }

  function recordRow(row) {
    if (!root.config.history || !root.config.history.enabled) return
    var now = Date.now()
    var entry = Logic.entryForRow(row, now)
    if (!entry) return
    root.history = Logic.recordEntry(root.history, entry, now, root.config.history)
    root.saveHistory()
  }

  // Shift+Delete on a history suggestion forgets it.
  function forgetSelected() {
    var row = root.rows[root.selectedIndex]
    if (!row || row.kind !== "history") return false
    var keep = root.selectedIndex
    root.history = Logic.removeEntry(root.history, row.key)
    root.saveHistory()
    root.rows = Logic.buildRows(root.config, root.tag, input.text, root.history, Date.now())
    root.selectedIndex = Math.min(keep, Math.max(0, root.rows.length - 1))
    return true
  }

  function setTag(keyword) {
    if (!root.config.sites[keyword]) return
    root.tag = keyword
    input.text = ""
    root.rebuild()
  }

  function clearTag() {
    root.tag = ""
    root.rebuild()
  }

  function move(delta) {
    if (root.rows.length === 0) return
    root.selectedIndex = (root.selectedIndex + delta + root.rows.length) % root.rows.length
  }

  function activate(index) {
    var row = root.rows[index]
    if (!row) return
    if (row.kind === "tag") { root.setTag(row.site); return }
    if (!row.url) return
    var cmd = Logic.openCommand(root.config, row.site, row.url)
    root.recordRow(row)
    root.dismiss()
    Quickshell.execDetached(cmd)
  }

  function siteOf(keyword) {
    return keyword ? root.config.sites[keyword] : null
  }

  function rowIcon(row) {
    if (row.kind === "open" || row.historyKind === "open") return "\u{f059f}"
    var site = root.siteOf(row.site)
    return site && site.icon ? site.icon : "\u{f0349}"
  }

  function rowIconColor(row) {
    var site = row.kind === "open" || row.historyKind === "open" ? null : root.siteOf(row.site)
    return site && site.color ? site.color : root.foreground
  }

  function rowPrimary(row) {
    var site = root.siteOf(row.site)
    var name = site ? site.name : ""
    if (row.kind === "tag") return strings.t("useTag").arg(name)
    if (row.kind === "history") return row.historyKind === "open" ? Logic.displayUrl(row.url) : row.query
    if (row.query) return row.query
    return strings.t("searchWith").arg(name)
  }

  function rowSecondary(row) {
    var site = root.siteOf(row.site)
    if (row.kind === "tag") return ""
    if (row.kind === "history") return row.historyKind === "search" && site ? "— " + site.name : ""
    if (row.kind === "open") return "— " + strings.t("open")
    if (row.query) return "— " + strings.t("searchWith").arg(site ? site.name : "")
    return ""
  }

  FileView {
    path: root.pluginDir + "/sites.json"
    watchChanges: true
    printErrors: false
    onLoaded: { root.defaultsText = text(); root.reloadConfig() }
    onFileChanged: reload()
  }

  FileView {
    path: root.userConfigPath
    watchChanges: true
    printErrors: false
    onLoaded: { root.userText = text(); root.reloadConfig() }
    onLoadFailed: { root.userText = ""; root.reloadConfig() }
    onFileChanged: reload()
  }

  FileView {
    id: historyFile
    path: root.historyPath
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onLoaded: root.loadHistory(text())
    onLoadFailed: root.loadHistory("")
    onFileChanged: reload()
  }

  // The history folder is private to the user.
  Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", "-m", "700", root.historyDir])

  OverlayWindow {
    id: panel
    shown: root.opened
    WlrLayershell.namespace: "gusmezomo-websearch"

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: contentTopInset + content.implicitHeight + contentBottomInset
      x: Math.round((parent.width - width) / 2)
      y: Math.round(parent.height * 0.28)
      radius: root.cardRadius
      color: root.background
      borderSpec: root.borderSpec
      padding: root.pad

      MouseArea { anchors.fill: parent; onClicked: input.forceActiveFocus() }

      Column {
        id: content
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: root.pad

        // Search row: magnifier, site tag, text field.
        Item {
          width: parent.width
          height: root.inputHeight

          Text {
            id: lens
            textFormat: Text.PlainText
            anchors.left: parent.left
            anchors.leftMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            text: "\u{f0349}"
            color: root.subtle
            font.family: root.fontFamily
            font.pixelSize: Style.font.subtitle
          }

          Rectangle {
            id: tagChip
            visible: !!root.tag
            anchors.left: lens.right
            anchors.leftMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            height: Style.space(24)
            width: visible ? tagLabel.implicitWidth + Style.space(16) : 0
            radius: height / 2
            color: Util.alpha(root.foreground, 0.16)

            Text {
              id: tagLabel
              textFormat: Text.PlainText
              anchors.centerIn: parent
              text: root.tag && root.config.sites[root.tag] ? root.config.sites[root.tag].name : ""
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
          }

          TextInput {
            id: input
            anchors.left: tagChip.visible ? tagChip.right : lens.right
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.rightMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            color: root.foreground
            selectionColor: Util.alpha(root.foreground, 0.3)
            selectedTextColor: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
            clip: true
            focus: true
            selectByMouse: true

            onTextChanged: root.rebuild()

            Text {
              textFormat: Text.PlainText
              anchors.fill: parent
              verticalAlignment: Text.AlignVCenter
              visible: input.text.length === 0
              text: strings.t("placeholder")
              color: root.subtle
              font: input.font
              elide: Text.ElideRight
            }

            Keys.priority: Keys.BeforeItem
            Keys.onPressed: function(event) {
              var plain = !(event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier))
              if (event.key === Qt.Key_Escape) {
                root.dismiss()
                event.accepted = true
              } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                root.activate(root.selectedIndex)
                event.accepted = true
              } else if (event.key === Qt.Key_Up) {
                root.move(-1)
                event.accepted = true
              } else if (event.key === Qt.Key_Down) {
                root.move(1)
                event.accepted = true
              } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
                // Tab never moves focus out of the field.
                if (!root.tag) {
                  var kw = Logic.keywordFor(root.config.sites, input.text)
                  if (kw) root.setTag(kw)
                }
                event.accepted = true
              } else if (event.key === Qt.Key_Space && plain && !root.tag
                         && Logic.keywordFor(root.config.sites, input.text)) {
                root.setTag(input.text)
                event.accepted = true
              } else if (event.key === Qt.Key_Delete && (event.modifiers & Qt.ShiftModifier)) {
                // Forget the selected history suggestion; otherwise do nothing.
                root.forgetSelected()
                event.accepted = true
              } else if (event.key === Qt.Key_Backspace && input.text.length === 0 && root.tag) {
                root.clearTag()
                event.accepted = true
              }
            }
          }
        }

        Rectangle {
          width: parent.width
          height: Math.max(1, Style.space(1))
          color: Util.alpha(root.foreground, 0.1)
        }

        // Results.
        Column {
          width: parent.width
          spacing: Style.space(2)

          Repeater {
            model: root.rows

            delegate: Rectangle {
              id: rowItem
              required property var modelData
              required property int index
              readonly property bool selected: index === root.selectedIndex

              width: parent ? parent.width : 0
              height: root.rowHeight
              radius: root.rowRadius
              color: selected ? root.selectedBackground : "transparent"

              Text {
                id: rowIconText
                textFormat: Text.PlainText
                anchors.left: parent.left
                anchors.leftMargin: Style.space(10)
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(18)
                horizontalAlignment: Text.AlignHCenter
                text: root.rowIcon(rowItem.modelData)
                color: root.rowIconColor(rowItem.modelData)
                font.family: root.fontFamily
                font.pixelSize: Style.font.title
              }

              Row {
                anchors.left: rowIconText.right
                anchors.leftMargin: Style.space(12)
                anchors.right: parent.right
                anchors.rightMargin: Style.space(10)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(6)

                Text {
                  id: primaryText
                  textFormat: Text.PlainText
                  text: root.rowPrimary(rowItem.modelData)
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.subtitle
                  elide: Text.ElideRight
                  width: Math.min(implicitWidth, parent.width - secondaryText.implicitWidth - parent.spacing)
                }

                Text {
                  id: secondaryText
                  textFormat: Text.PlainText
                  text: root.rowSecondary(rowItem.modelData)
                  visible: text.length > 0
                  color: root.subtle
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.subtitle
                }
              }

              Rectangle {
                visible: rowItem.modelData.kind === "tag"
                anchors.right: parent.right
                anchors.rightMargin: Style.space(10)
                anchors.verticalCenter: parent.verticalCenter
                height: Style.space(20)
                width: tabLabel.implicitWidth + Style.space(12)
                radius: Style.space(5)
                color: "transparent"
                border.width: 1
                border.color: Util.alpha(root.foreground, 0.25)

                Text {
                  id: tabLabel
                  textFormat: Text.PlainText
                  anchors.centerIn: parent
                  text: "Tab"
                  color: root.subtle
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }

              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onContainsMouseChanged: if (containsMouse) root.selectedIndex = rowItem.index
                onClicked: root.activate(rowItem.index)
              }
            }
          }
        }
      }
    }
  }
}
