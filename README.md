# Web Search — plugin para o Omarchy

Um launcher compacto para pesquisar na web ou abrir uma URL, aberto por um atalho de teclado. Inspirado na barra de pesquisa do Zen Browser, mas menor, e com as cores do tema ativo do Omarchy.

```
╭──────────────────────────────────────────╮
│ 🔍  ( YouTube )  lofi beats              │
│ ──────────────────────────────────────── │
│ ▶  lofi beats — Search with YouTube      │
╰──────────────────────────────────────────╯
```

## Recursos

- **Keywords de site:** digite `yt` e aperte Espaço ou Tab, e aparece uma etiqueta "YouTube". O que você digitar depois é pesquisado no YouTube.
- **Abrir URL direto:** `https://...`, `github.com/foo`, `localhost:5173` ou `192.168.0.1:8080` + Enter abrem o endereço.
- **Navegador à sua escolha:** abre no navegador que você definir (Zen, Firefox, Chromium...), sem depender do padrão do sistema. Também dá para escolher um navegador por site.
- **Sites configuráveis:** adicione, altere ou remova sites num arquivo JSON, que recarrega sozinho ao salvar.
- **Segue o tema do Omarchy:** fundo, texto, borda e escurecimento da tela vêm do tema ativo e mudam junto com ele.
- **Sem rede:** o plugin não acessa a internet. Só o navegador acessa, quando você abre algo.
- **Traduzido:** inglês e português (Brasil), seguindo o idioma escolhido no Omarchy.

## Requisitos

- Omarchy com o shell em Quickshell (`omarchy-shell`), a versão que tem plugins em `~/.config/omarchy/plugins/`.
- Uma Nerd Font para os ícones. O Omarchy já vem com a JetBrainsMono Nerd Font.
- Opcional: `notify-send`, para o aviso quando o navegador configurado não é encontrado.

## Instalação

### 1. Colocar o plugin na pasta de plugins

O nome da pasta precisa ser igual ao `id` do `manifest.json` (`gusmezomo.websearch`).

```sh
git clone <url-do-repositorio> ~/.config/omarchy/plugins/gusmezomo.websearch
```

Para desenvolver em outra pasta, use um link simbólico:

```sh
ln -s ~/Work/WebSearch/gusmezomo.websearch ~/.config/omarchy/plugins/gusmezomo.websearch
```

### 2. Ativar no shell

Adicione o plugin à lista `plugins` em `~/.config/omarchy/shell.json`:

```json
{
  "plugins": [
    { "id": "gusmezomo.websearch" }
  ]
}
```

Se já houver outros plugins na lista, só acrescente a linha. Depois reinicie o shell uma vez:

```sh
omarchy restart shell
```

### 3. Criar o atalho de teclado

Adicione em `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + CTRL + G", "Web search", "omarchy-shell shell toggle gusmezomo.websearch")
```

Depois confira se a config carregou sem erros:

```sh
hyprctl reload && hyprctl configerrors
```

Veja a seção [Trocar o atalho](#trocar-o-atalho) para usar outra combinação.

### 4. Escolher o navegador (opcional)

Crie `~/.config/omarchy/websearch.json`:

```json
{
  "browser": ["zen-browser"]
}
```

Sem esse arquivo, o plugin abre no navegador padrão do sistema (`xdg-open`).

## Como usar

| Ação | Tecla |
|---|---|
| Abrir / fechar | o seu atalho (ex.: `SUPER + CTRL + G`) |
| Ativar a etiqueta de um site | digite a keyword exata + `Espaço` ou `Tab` |
| Remover a etiqueta | `Backspace` com o campo vazio |
| Navegar pela lista | `↑` / `↓` |
| Abrir o item selecionado | `Enter` ou clique |
| Fechar | `Esc` ou clique fora da caixa |

**Detalhes do comportamento:**
- **Keyword exata:** a etiqueta só aparece com a keyword exata. `yt` vira etiqueta, mas `YT` e `yt2` não. Com o texto igual a uma keyword, a lista mostra a dica "Use YouTube [Tab]".
- **Sem etiqueta:** a pesquisa vai para o site padrão (Google).
- **Com etiqueta:** o texto é sempre pesquisado no site da etiqueta, mesmo que pareça uma URL.
- **Etiqueta com campo vazio:** Enter abre a página inicial do site.
- **Texto que parece URL:** o primeiro item da lista abre o endereço e o segundo pesquisa o texto. Use `↓` + Enter para pesquisar em vez de abrir.
- **Depois de abrir algo:** a caixa fecha sozinha.

### Sites incluídos

| Keyword | Site |
|---|---|
| `g` | Google (padrão) |
| `yt` | YouTube |
| `gh` | GitHub |
| `red` | Reddit |
| `tr` | Google Tradutor (traduz para português) |
| `x` | X (Twitter) |

## Configuração

Toda a configuração pessoal fica em **`~/.config/omarchy/websearch.json`**. O arquivo é opcional, e o plugin o recarrega ao salvar, sem precisar reiniciar o shell.

Os sites padrão ficam em `sites.json`, dentro do plugin. Não edite esse arquivo: as mudanças se perdem quando você atualiza o plugin. Use o seu `websearch.json`, que só precisa listar o que você quer mudar.

Exemplo completo:

```json
{
  "browser": ["zen-browser"],
  "defaultSite": "g",
  "sites": {
    "ddg": {
      "name": "DuckDuckGo",
      "url": "https://duckduckgo.com/?q=%s",
      "color": "#DE5833"
    },
    "yt": { "browser": ["chromium"] },
    "red": null
  }
}
```

### `browser`: qual navegador usar

É o comando que abre o navegador, escrito como **lista** (cada argumento num item). O plugin acrescenta a URL no final.

```json
"browser": ["zen-browser"]
"browser": ["firefox"]
"browser": ["chromium"]
"browser": ["zen-browser", "--private-window"]
"browser": ["firefox", "-P", "Trabalho"]
"browser": ["chromium", "--profile-directory=Profile 1"]
```

- **Vazio ou ausente:** usa o navegador padrão do sistema (`xdg-open`).
- **Comando não encontrado:** abre no navegador padrão e mostra uma notificação.
- **Navegador já aberto:** normalmente a URL abre numa aba nova da janela existente.
- **Como descobrir o comando:** veja a linha `Exec=` do arquivo `.desktop` do navegador, por exemplo em `/usr/share/applications/zen.desktop`, ou rode `which zen-browser`.

O comando é executado diretamente, sem passar por um shell. Por isso o texto digitado nunca é interpretado como comando.

### `defaultSite`: site usado sem etiqueta

É a keyword do site usado quando não há etiqueta. O padrão é `"g"` (Google).

```json
"defaultSite": "ddg"
```

### `sites`: adicionar, alterar e remover sites

Cada chave é a **keyword** do site: letras e números, até 12 caracteres, diferenciando maiúsculas de minúsculas.

**Adicionar um site:** informe pelo menos `name` e `url`.

```json
"sites": {
  "wiki": {
    "name": "Wikipédia",
    "url": "https://pt.wikipedia.org/w/index.php?search=%s"
  }
}
```

**Alterar um site existente:** informe só os campos que mudam. O resto vem do padrão.

```json
"sites": {
  "tr": { "url": "https://translate.google.com/?sl=auto&tl=en&text=%s&op=translate" }
}
```

**Remover um site padrão:** use `null`.

```json
"sites": {
  "red": null
}
```

**Trocar a keyword de um site:** remova a antiga e crie a nova.

```json
"sites": {
  "yt": null,
  "y": { "name": "YouTube", "url": "https://www.youtube.com/results?search_query=%s" }
}
```

#### Campos de um site

| Campo | Obrigatório | Descrição |
|---|---|---|
| `name` | sim | Nome mostrado na etiqueta e na lista (até 40 caracteres). |
| `url` | sim | URL de pesquisa, com `%s` onde entra o texto pesquisado. Precisa começar com `https://` ou `http://`. |
| `home` | não | Página aberta com a etiqueta e o campo vazio. O padrão é o domínio da `url`. |
| `icon` | não | Ícone Nerd Font (veja abaixo). Sem ícone, aparece uma lupa. |
| `color` | não | Cor do ícone em hexadecimal (`#RRGGBB`). Sem cor, usa a cor do texto do tema. |
| `browser` | não | Navegador só para este site, no mesmo formato do `browser` global. |

**Como descobrir a URL de pesquisa de um site:** pesquise qualquer palavra no site, copie a URL da barra de endereço e troque a palavra por `%s`.

Sites com `url` inválida, sem `%s` ou com keyword inválida são ignorados. Se o JSON tiver erro de sintaxe, o plugin usa só os sites padrão até você corrigir.

#### Ícones

O campo `icon` aceita um caractere de uma Nerd Font. Procure o ícone em <https://www.nerdfonts.com/cheat-sheet> e cole o caractere direto no JSON:

```json
"icon": "󰇥"
```

Os ícones da família Material Design (`nf-md-*`) costumam ter a aparência mais uniforme.

### Trocar o atalho

Edite a linha do `o.bind` em `~/.config/hypr/bindings.lua`, por exemplo:

```lua
o.bind("SUPER + ALT + SPACE", "Web search", "omarchy-shell shell toggle gusmezomo.websearch")
```

- **Atalho já usado:** se a combinação já for de uma função padrão do Omarchy, libere-a antes com `hl.unbind("SUPER + ALT + SPACE")`, numa linha acima.
- **Ver atalhos em uso:** `omarchy menu keybindings --print`.
- **Aplicar:** `hyprctl reload && hyprctl configerrors`.

O comando `omarchy-shell shell toggle gusmezomo.websearch` também funciona fora do atalho, num script ou no terminal.

### Aparência

A caixa usa as cores dos menus do tema ativo (`[menu]` no tema do Omarchy): fundo, texto, borda e escurecimento da tela. Para mudar as cores, personalize o tema (veja `omarchy theme --help`). Não há cores fixas no plugin.

A caixa abre no monitor que estiver em foco.

## Solução de problemas

**O atalho não faz nada.**
- Confira se o plugin está na lista `plugins` do `~/.config/omarchy/shell.json`.
- Rode `omarchy-shell shell toggle gusmezomo.websearch` no terminal para descartar problema no atalho.
- Rode `hyprctl configerrors` para ver erros na config do Hyprland.

**Mudei o `.qml` e nada mudou.** O shell às vezes mantém a versão antiga em cache. Rode `omarchy restart shell`.

**Ver erros do plugin:**

```sh
journalctl --user -b --no-pager | grep -i websearch
```

**Abre no navegador errado.** Confira o `browser` no `websearch.json` e se o comando existe (`which <comando>`). Se aparecer a notificação "Browser not found", o comando não foi encontrado.

**Um site que adicionei não aparece.** Confira se a `url` começa com `https://` e tem `%s`, e se a keyword tem só letras e números.

## Desenvolvimento

```
gusmezomo.websearch/
├── manifest.json        # manifesto do plugin (tipo overlay)
├── WebSearch.qml        # interface: caixa, etiqueta, lista, teclado
├── Logic.js             # detecção de URL/keyword, config, comando de abrir
├── sites.json           # sites padrão
├── i18n/                # traduções (en, pt-BR)
└── tests/logic.test.js  # testes da lógica
```

A lógica em `Logic.js` não depende de QML. Os testes rodam com Node:

```sh
node tests/logic.test.js
```

Para adicionar um idioma, crie `i18n/<código>.json` com as mesmas chaves do `en.json`. Os códigos aceitos são os do Omarchy (`$OMARCHY_PATH/default/i18n/locales.json`).

## Próximos passos

- Histórico das pesquisas recentes.
- Sugestões enquanto digita.
