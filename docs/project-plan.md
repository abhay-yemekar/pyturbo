# PyTurbo — Project Plan

> A free, open-source, browser-based Python IDE that looks and feels **exactly** like Borland Turbo C++ 3.0 (1992).
> Planning document, prepared 26 Oct 2026. Nothing has been built yet.

---

## 0. Summary

| Item | Decision |
|---|---|
| **Name** | **PyTurbo** (see §2) |
| **Address** | `https://pyturbo.pages.dev` (unused as of 26 Oct 2026, **not reserved yet**) |
| **What it is** | A static website. Python runs **inside the visitor's browser** (Pyodide / WebAssembly). No server. |
| **Look** | Pixel-faithful copy of the Turbo C++ 3.0 IDE (80×25 VGA text mode, Borland colours, menus, windows, dialogs, F-keys) |
| **Cost** | $0 to build, host and run, for any number of users |
| **Licence** | MIT for our code; third-party parts keep their own licences (§14) |
| **Stack** | TypeScript + Vite, own Turbo-Vision-style UI engine drawing to a canvas, Lezer Python tokenizer, Pyodide 314 (Python 3.14) in a Web Worker, Cloudflare Pages (§4) |
| **Workflow** | GitHub Flow: issue → branch → PR → CI + preview deploy → squash merge → auto deploy (§8) |

---

## 1. Goals, non-goals, constraints

**Goals**
1. Look and behave like the real Turbo C++ 3.0 IDE, close enough that former Turbo C++ users feel at home instantly.
2. Feature parity with popular online Python compilers (Programiz, OnlineGDB, OneCompiler, NextLeap, Newton School playground):
   - editor
   - Run
   - live `input()`
   - Stop
   - error messages
   - save, open and download
   - share link
   - libraries
3. A real Turbo-style debugger (Trace F7, Step F8, breakpoints, Watch window). None of the reference sites look like this.
4. Works offline after the first visit. Fast. Works on desktop, with a usable mode on phones.

**Non-goals (for now)**
- Running code on a server.
- User accounts and cloud storage.
- Languages other than Python.
- Real-time collaboration.

**Hard constraints set by the owner**
- Completely free: no paid service, no card on file.
- Open source.
- The Turbo look must be exact, not "inspired by".
- No implementation starts without the owner's explicit go-ahead.

---

## 2. Name: PyTurbo vs TurboPy

| Check (26 Oct 2026) | PyTurbo | TurboPy |
|---|---|---|
| `*.pages.dev` | ✅ unused | ✅ unused |
| GitHub account/org name | ❌ org `pyturbo` exists (empty since 2015) → repo lives at `github.com/<you>/pyturbo` | ✅ free |
| PyPI | taken by an unrelated 2018 package | taken by turboPy, a computational-physics framework |
| Reads as | "a Python product" (PyCharm, PyScript, Pygame, Pyodide pattern) | "Turbo + language", like Turbo Pascal / Turbo C / Turbo Basic |
| Trademark risk | Lower: follows Python naming, not Borland's | Higher: copies Borland's "Turbo &lt;language&gt;" product-name pattern |
| Searchability | Crowded with unrelated "pyturbo" repos (turbo codes, NASA turbomachinery) | Clashes with turboPy physics framework |

**Recommendation: PyTurbo.**
- It tells people it's a Python tool first and keeps more distance from Borland's product names.
- It's already the owner's choice.
- Not legal advice. Add "Not affiliated with Borland or Embarcadero" to the About box and README.

**To do now (owner, about 5 minutes, free):**
- [ ] Reserve `pyturbo.pages.dev` by creating an empty Cloudflare Pages project named `pyturbo`.
- [ ] Create the GitHub repo `pyturbo`, under the personal account or a new org (e.g. `pyturbo-ide`). The org `pyturbo` itself is taken.

### 2.1 GitHub repository identity

| Field | Value |
|---|---|
| **Repository name** | `pyturbo` |
| **URL** | `github.com/<your-account>/pyturbo` (or `github.com/pyturbo-ide/pyturbo` if you create an org) |
| **Description** (GitHub "About", ≤350 chars) | `PyTurbo: a free, open-source Python IDE in your browser that looks and feels exactly like Borland Turbo C++ 3.0. Blue screen, F-keys, Turbo-style debugger. Runs Python 3.14 locally via Pyodide (WebAssembly), with no install and no server.` |
| **Short tagline** (README, social) | `Code Python like it's 1992.` |
| **Website** | `https://pyturbo.pages.dev` |
| **Topics** | `python` `ide` `online-compiler` `python-ide` `turbo-cpp` `turbo-vision` `retro` `dos` `pyodide` `webassembly` `education` `typescript` `browser` |
| **Licence** | MIT |
| **Social preview image** | 1280×640 screenshot of PyTurbo's own blue screen (never a Borland screenshot) |

---

## 3. Reference: the real Turbo C++ 3.0 look

**Source:** studied first-hand on 26 Oct 2026 by running the original `TC.EXE` (Turbo C++ 3.0, © 1990–1992 Borland) inside DOSBox in the browser (turboc.pages.dev). I opened every menu and the Colors dialog, compiled, ran, debugged, and opened the About and Open dialogs. Items marked *(verify)* get a final check in Phase 0 against the Turbo Vision source (§3.10).

### 3.1 Screen, font and palette
- **Text mode 80 columns × 25 rows.** Character cell **9×16 px** → 720×400 native. TC also supports 43/50-line modes.
- **Font:** IBM VGA 9×16 (code page 437). Box-drawing characters `C0h–DFh` repeat their 8th pixel column into the 9th, so lines join seamlessly.
- **Colours:** the 16-colour VGA palette, which is the only palette used:

| # | Name | Hex | # | Name | Hex |
|---|---|---|---|---|---|
| 0 | Black | `#000000` | 8 | Dark grey | `#555555` |
| 1 | Blue | `#0000AA` | 9 | Light blue | `#5555FF` |
| 2 | Green | `#00AA00` | A | Light green | `#55FF55` |
| 3 | Cyan | `#00AAAA` | B | Light cyan | `#55FFFF` |
| 4 | Red | `#AA0000` | C | Light red | `#FF5555` |
| 5 | Magenta | `#AA00AA` | D | Light magenta | `#FF55FF` |
| 6 | Brown | `#AA5500` | E | Yellow | `#FFFF55` |
| 7 | Light grey | `#AAAAAA` | F | White | `#FFFFFF` |

Each screen cell is `(character, attribute)`, where attribute = `background << 4 | foreground`, as in VGA text memory.

### 3.2 Screen layout (80×25)

```
 ≡  File  Edit  Search  Run  Compile  Debug  Project  Options     Window  Help    row 0  menu bar
╔═[■]═══════════════════════════ NONAME00.PY ═════════════════════════1═[↑]═╗    row 1  edit window
║print("Hello")                                                              ▲
║                                                                            ■
║                                                                            ▒
║                                                                            ▼
╚═*══ 1:1 ══════════════════◄■▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒►─┘
░░░░░░░░░░░░░░░░░░░░░░░ desktop pattern ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 F1 Help  F2 Save  F3 Open  Alt-F9 Compile  F9 Make  F10 Menu                   row 24 status line
```

| Element | Observed in the real IDE |
|---|---|
| **Menu bar** (row 0) | Light-grey background, black text, **red hotkey letter**. Selected title: black on **green**. `Window` and `Help` sit apart on the right. `≡` system menu at far left |
| **Desktop** | `░` (B0h) **blue on light grey** |
| **Status line** (row 24) | Light grey, black text, **red key names**. Contents change with context (§3.7). With a menu item highlighted it shows `F1 Help │ <hint for that item>` |
| **Pull-down menus** | Light-grey box, single-line black frame `┌─┐│└┘`, separators `├─┤`, submenu arrow `►`, hotkey shown right-aligned (`Alt+X`, `Ctrl+F9`). Selected item: black on green with red hotkey letter. Disabled items: dark grey. Selected + disabled: dark grey on green per the source (`0x28`); the emulator showed a darker bar, so check in Phase 0. Geometry from source: every line has a blank column at each side (` ┌──┐ `). The selection bar runs from col 2 to w−3, item text starts at col 3, the hotkey ends at col w−4, `►` sits at w−4. The box drops to row 1 with `┌` under the title's leading space. |
| **Shadows** | A 2-column strip on the right starting 1 row below the top, plus a 1-row strip underneath starting 2 columns in. The characters **underneath stay visible but get attribute `0x08` (dark grey on black)**, not a solid black box. Same for menus, dialogs and windows. In 43/50-line mode the right strip is 1 column wide |

### 3.3 Menu tree: real TC++ 3.0 → PyTurbo

Labels, order, hotkeys and status hints copied from the real IDE. **Bold** = changed meaning for Python. *Italic* = PyTurbo addition.

| Menu | Real TC++ 3.0 items (hotkey) | PyTurbo meaning |
|---|---|---|
| **≡** | Repaint desktop │ GREP, Turbo Assembler, Turbo Debugger, Turbo Profiler | Repaint desktop │ ***Python shell (REPL)***, ***Package manager (pip)…***, ***Python docs*** |
| **File** | New; Open… F3; Save F2; Save as…; Save all │ Change dir…; Print; DOS shell │ Quit Alt+X | Same. ***Download .py***, ***Upload…***, ***Share link…*** go after Save all. **Print** = browser print. **DOS shell** = full-screen Python REPL on the user screen. **Quit** = "exit to DOS" screen with a restart prompt |
| **Edit** | Undo Alt+BkSp; Redo Shift+Alt+BkSp │ Cut Shift+Del; Copy Ctrl+Ins; Paste Shift+Ins; Clear Ctrl+Del; Copy example │ Show clipboard | Identical. Also accept Ctrl+C/X/V/Z (option "CUA keys", on by default) |
| **Search** | Find…; Replace…; Search again Ctrl+L │ Go to line number…; Previous error Alt+F7; Next error Alt+F8; Locate function… | Identical. **Locate function** = jump to a `def`/`class` |
| **Run** | Run Ctrl+F9; Program reset Ctrl+F2; Go to cursor F4; Trace into F7; Step over F8; Arguments… | **Run** = run in Pyodide. **Program reset** = stop and restart Python. **Arguments** sets `sys.argv` |
| **Compile** | Compile Alt+F9; Make F9; Link; Build all │ Information…; Remove messages | **Compile** = syntax check of the active file (`compile()`). **Make** = check all open/project files. **Link** stays disabled. **Information** = Python/Pyodide version, memory, loaded packages |
| **Debug** | Inspect… Alt+F4; Evaluate/modify… Ctrl+F4; Call stack… Ctrl+F3; Watches ►; Toggle breakpoint Ctrl+F8; Breakpoints… | Same names over a Python debugger (§6.6). Watches ► = Add watch Ctrl+F7, Delete, Edit, Remove all |
| **Project** | Open project…; Close project │ Add item…; Delete item; Local options…; Include files… | Multi-file programs (`main.py` + modules). **Include files** = list of `import`s |
| **Options** | Application…; Compiler ►; Transfer…; Make…; Linker ►; Librarian…; Debugger…; Directories… │ Environment ► │ Save… | Keep the structure. Environment ► = Preferences… (25/43/50 lines, **screen fit mode**), Editor… (tab size, auto-indent), Mouse…, Desktop…, Startup…, **Colors…** (full TC colour editor). Linker/Librarian disabled |
| **Window** | Size/Move Ctrl+F5; Zoom F5; Tile; Cascade; Next F6; Close Alt+F3; Close all │ Message; Output; Watch; User screen Alt+F5; Register; Project; Project notes │ List all… Alt+0 | Identical. **Register** = disabled (no CPU registers in Python) |
| **Help** | Contents; Index Shift+F1; Topic search Ctrl+F1; Previous topic Alt+F1; Help on help │ About… | Our own help text in TC help-window style. **Topic search** on a word = Python docs/`help()` for it |

### 3.4 Windows

| Window | Real look | Notes |
|---|---|---|
| **Edit** (active) | **Blue** background. **Double-line white** frame `╔═╗║╚╝`. `[■]` close box at cols 2–4 (brackets white, `■` **light green**). Title centred with one space each side, white. Window number at col w−7, then `[↑]` zoom box at w−5…w−3 (`↑` light green; `[↕]` while zoomed) | Bottom frame: indicator at x=2, 14 wide: `*` when modified, then ` line:col ` (e.g. `11:2`). Horizontal scrollbar from x=18 to w−2. Right frame: vertical scrollbar. Bottom-right `─┘` resize grip in light green |
| **Edit** (inactive) | **Single-line light-grey** frame `┌─┐│└┘`. Title light grey. No icons, scrollbars or grip; only the window number | Behind other windows; shadows still apply |
| **Scrollbars** | Page area **`▒` (B1h)** (not `░`, which is only the desktop). Arrows `▲▼◄►` and thumb `■` (FEh). The IDE colours are in §3.5 (Scroll Bar cyan on blue, Thumb/Arrows blue on cyan). If there's nothing to scroll, the whole track is `▓` with no thumb | |
| **Message** | **Cyan** background, blue text. Title `Message`, number `2` | Current message marked `•` on a **green** bar. The referenced source line gets a full-width **cyan bar** in the edit window (message tracking). Status: `F1 Help  Space View source  ←┘ Edit source  F10 Menu` |
| **Watch** | **Cyan** background, entries `a: 10` in blue. Title `Watch`, number `3` | New entry row `•` on green bar. Status: `F1 Help  F7 Trace  F8 Step  ←┘ Edit  Ins Add  Del Delete  F10 Menu` |
| **Output** | **Black** background, light-grey text (from owner's reference screenshot) | Small window showing the user screen |
| **User screen** (Alt+F5) | **Full screen**, black, light grey, blinking `_` cursor. Shows the whole console history; the program's output is appended | Any key returns to the IDE |
| **Compiling** dialog | Grey dialog, title `Compiling`. "Main file", "Compiling: EDITOR → NAME", a Total/File table (Lines compiled, Warnings, Errors), "Available memory", bottom bar **blue** with `Warnings : Press any key` / `Success : Press any key` | Shown by Alt+F9 / F9. PyTurbo: lines checked, warnings (`SyntaxWarning`), errors |

**Important behaviour:** after **Run**, TC switches to the user screen, runs the program, and **returns to the IDE the moment the program ends**. That's why students added `getch()`. PyTurbo copies this. Option *"Pause after run"* (off by default, for authenticity) shows `Press any key…`.

### 3.5 Editor syntax colours

All verified one by one in the real `Options › Environment › Colors › Edit Window` dialog:

| TC item | Default (fg on bg) | PyTurbo Python token |
|---|---|---|
| Normal Text | **yellow** on blue | whitespace / anything unclassified |
| Marked Text (selected block) | blue on light grey | selection (Ctrl+K B / Ctrl+K K or mouse) |
| Comment | **cyan** on blue | `# comment` |
| Reserved | **white** on blue | keywords: `def class if elif else for while return import from as with try except finally raise lambda yield pass break continue in is not and or None True False global nonlocal assert del async await match case type` |
| Identifier | **light green** on blue | names (`print`, `x`, `math`) |
| Symbol | **yellow** on blue | operators and punctuation `()[]{}:,.=+-*/%<>!&|^~@` |
| String | **red** on blue | `'…' "…" '''…''' """…"""`, f-, r-, b-, rb- strings |
| Integer | **light grey** on blue | `10`, `1_000` |
| Float | **brown** on blue | `1.5`, `2e10`, `3j` |
| Octal | **dark grey** on blue | `0o17`, also `0b101` |
| Hex | **black** on blue | `0x1F` (yes, nearly invisible: that's the real default) |
| Character | **magenta** on blue | not used by Python by default (assignable) |
| Preprocessor | **blue on cyan** | `import …` / `from … import …` lines and `@decorator` lines (the `#include` look) |
| Illegal Char | **black on red** | tokenizer errors: stray `$`, `?`, unterminated string |
| CPU Line (execution bar) | **black on cyan**, full width | current line while debugging |
| Break Point Line | **white on red**, full width | breakpoint lines |
| Active Title / Border | white on blue | |
| Inactive Title / Border | light grey on blue | |
| Icons | light green on blue | `■` and `↑` |
| Scroll Bar | cyan on blue | |
| Thumb Tab / Arrows | blue on cyan | |

> The owner's reference screenshots show **yellow identifiers**. Some Turbo C++ packages ship a different `TCCONFIG.TC`. The factory defaults above come from the real Colors dialog. PyTurbo ships the defaults and offers a **"Classic yellow identifiers"** colour preset, plus the full Colors dialog to change anything.

### 3.6 Dialogs and controls (observed)

| Control | Look |
|---|---|
| Dialog box | Light-grey background, **double-line white** frame (`0x7F`), title centred, `[■]` close box only (light-green `■`, `0x7A`), no zoom box or number, shadow |
| Static text | Black on light grey (`0x70`) |
| Label | Black (`0x70`); white when its control is focused (`0x7F`); **hotkey letter yellow** (`0x7E`), e.g. **N**ame, **F**iles, **G**roup |
| Button | **Green** face, black text (`0x20`). Default button text **light cyan** (`0x2B`), focused white (`0x2F`), hotkey yellow (`0x2E`), disabled dark grey on grey (`0x78`). Shadow: `▄` at the right end of row 0, `▀` under the face on row 1. Pressed: face shifts right one column, shadow disappears |
| Check boxes / radio buttons | ` [ ] ` / ` [X] ` and ` ( ) ` / ` (•) ` on **cyan** (`0x30`). Focused item white (`0x3F`), hotkey yellow (`0x3E`) |
| List box | **Cyan** background, black text (`0x30`). Focused selection white on green (`0x2F`). Unfocused selection **yellow on cyan** (`0x3E`). Column divider `│` blue on cyan (`0x31`) |
| Input line | **Blue** background, white text (`0x1F`), selected text white on green (`0x2F`), `◄ ►` light green when the text scrolls. History button `▐↓▌`: sides green on grey (`0x72`), `↓` black on green (`0x20`) |
| Info pane (Open dialog) | Cyan on blue strip (`0x13`) showing path and file date |
| Colour picker | 4×4 foreground grid and 2×4 background grid; the current colour is marked; a sample "Text Text" row |
| About box | Centred lines: product, version, copyright, company. Single green **OK** |

### 3.7 Status line by context (exact strings observed)
- **Editing:** `F1 Help  F2 Save  F3 Open  Alt-F9 Compile  F9 Make  F10 Menu`
- **Menu item highlighted:** `F1 Help │ <hint>`, e.g. *Make and run the current program*, *Create a new file in a new Edit window*, *Search for text*
- **After compile:** `F1 Help  Alt-F8 Next Msg  Alt-F7 Prev Msg  Alt-F9 Compile  F9 Make  F10 Menu`
- **Message window:** `F1 Help  Space View source  ←┘ Edit source  F10 Menu`
- **Debugging / Watch:** `F1 Help  F7 Trace  F8 Step  ←┘ Edit  Ins Add  Del Delete  F10 Menu`
- **Dialog:** `F1 Help │ <hint for focused control>`

### 3.8 Keyboard map and browser conflicts

All TC keys are kept: F1–F10, Alt+F1/F3/F4/F5/F7/F8/F9/X/0, Ctrl+F1–F9, Shift+F1, Alt+letter menus, and the WordStar block keys (Ctrl+K B/K/C/V/Y/H, Ctrl+Q F/A/Y, Ctrl+Y delete line, Ctrl+L search again).

| Problem | Fix |
|---|---|
| Browser takes **Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab** (pages can't intercept) | **"DOS mode"** button: fullscreen + **Keyboard Lock API** (Chrome/Edge), which captures almost all keys. Elsewhere, alternatives: menus, Alt+F3 for close |
| F1, F3, F5, F6, F10, F11, Alt+F (browser help/find/reload/address bar/menu) | `preventDefault()` on keydown. **Phase 0 spike measures which work in Chrome, Edge, Firefox and Safari**, and the table is filled in from that |
| Phones have no F-keys | Touch toolbar: Run · Stop · Save · Menu · Alt+F5 · F7 · F8 |

### 3.9 Behaviours to copy
- **Window numbering:** 1, 2, 3… shown in the frame. **Alt+1…9** jumps to that window. **F6** cycles windows.
- **Zoom (F5):** maximise and restore. **Ctrl+F5:** move/resize with arrows and Shift+arrows.
- **Message tracking:** moving through messages highlights the source line. **Enter** jumps to it.
- **Modified flag** `*` in the bottom frame. **Line:col** updates live.
- **Insert/overwrite:** Ins toggles. Underline cursor in insert mode, block cursor in overwrite.
- **Mouse:** click menus, drag window title to move, drag corner to resize, click scrollbars, double-click messages. The text-mode mouse pointer is an inverted cell; keep it optional (on in DOS mode).
- **Blink and timing:** cursor blinks about 2 Hz (like VGA). Menus open instantly, with no animation anywhere.

### 3.10 Still to verify in Phase 0
- **Done:** the Turbo Vision palette bytes and drawing rules are verified from the source and Borland's manuals (Appendix A).
- Still open:
  - Defaults of the IDE-only colour groups (Output, Message, Watch, Help, Status line). The manuals don't list them; read them from the running IDE's Colors dialog.
  - Selected + disabled menu item colour (source `0x28` vs the darker bar seen in the emulator).
- Pixel-compare our renderer against emulator screenshots for: main screen, every menu, the Colors dialog, Open dialog, Compiling dialog, Message/Watch windows, About.
- Follow Borland's original Turbo Vision 2.0, **not** magiblot's modern changes:
  - no left resize grip
  - shadow is always `0x08`
  - palette entry 126 is `0x38`
  - TC++ 3.0 predates TV 2.0's blue/cyan dialog and help palettes (entries 64–135)

---

## 4. Tech stack (final recommendation)

| Layer | Choice (version as of 26 Oct 2026) | Why this is the best fit | Rejected alternatives |
|---|---|---|---|
| Language | **TypeScript 7** (strict) | Type safety for a large UI engine. TS 7's native compiler is fast | Plain JS: too error-prone at this size |
| Build | **Vite 8** | Fast dev server, outputs plain static files for free hosting, first-class Web Worker and WASM support | Webpack: slower, more config |
| UI framework | **None: our own Turbo-Vision-style engine** (`View`, `Group`, `Window`, `Dialog`, `MenuBar`, `StatusLine`, event dispatch) drawing into an **80×N cell buffer** | Turbo C++ itself is built on Turbo Vision. Copying its model is the only way to get overlapping windows, shadows over anything, and the exact menu/dialog behaviour. React/Svelte think in DOM boxes and fight a character grid | React/Svelte/Vue; compiling the C++ tvision library to WASM (heavy, hard to integrate with the editor and Python) |
| Renderer | **Canvas 2D** + pre-built **VGA 9×16 glyph atlas**, integer scaling, dirty-cell redraw | Pixel-exact glyphs and colours, crisp at any zoom, 60 fps. A hidden DOM mirror and `aria-live` keep it screen-reader friendly | DOM `<span>` grid (slower, sub-pixel blur); xterm.js (built for terminals, not window managers) |
| Font | **Px437 IBM VGA 9x16** (int10h.org, CC BY-SA 4.0) | Faithful VGA font with the 9th-column box-drawing rule | Copying IBM ROM bitmaps (licence unclear) |
| Editor | **Our own editor view inside the engine** (line buffer, WordStar keys, block marking, undo/redo, search) + hidden `<textarea>` for typing, IME, mobile keyboards and clipboard | Lives in the same cell buffer, so shadows, overlapping windows and colours are exactly TC. Real TC also had a simple editor | CodeMirror/Monaco on top of the canvas: can't be darkened by shadows or covered correctly by menus; looks "almost" right |
| Python tokenizer | **@lezer/python 1.1** (MIT) | Accurate incremental Python parser (CodeMirror's), runs before Python loads | Hand-written regex tokenizer (misses triple-quoted/f-strings); Python's `tokenize` (needs Pyodide loaded first) |
| Python runtime | **Pyodide 314.0.7** (Python 3.14.2, MPL-2.0) in a **Web Worker**, from jsDelivr, pinned | Real CPython. 357 built-in packages + micropip for pure-Python PyPI packages | Brython/Skulpt (not real CPython), MicroPython (fewer libraries), server execution (costs money) |
| Live input / Stop | **SharedArrayBuffer + Atomics** (stdin), Pyodide **interrupt buffer** (Stop) | Real blocking `input()` and `KeyboardInterrupt`, like a terminal | `window.prompt()` (ugly, not Turbo) |
| Debugger | **`sys.monitoring`** (PEP 669, Python 3.12+) in the worker + Atomics pause | Low-overhead line events, breakpoints, step over/into, watches | `sys.settrace` (slower), `pdb` (text UI) |
| Storage | **IndexedDB** (`idb-keyval` 6.3) for files and settings, synced into Pyodide's in-memory FS before each run | Persists in the browser; `open('data.txt')` works | localStorage (5 MB cap, strings only) |
| Share links | **lz-string** 1.5 → URL `#fragment` | No backend; the fragment never reaches the server | Gist/pastebin (needs accounts or tokens) |
| Offline | **vite-plugin-pwa** 2.0 (Workbox) service worker caching app + Pyodide files | Second visit loads instantly and works offline | none |
| Lint/format | **Biome 2.6** | One fast tool for lint + format | ESLint + Prettier (two tools, slower) |
| Tests | **Vitest 5** (unit), **Playwright 1.64** (end-to-end + screenshot diffs in Chromium, Firefox, WebKit) | Standard, free, CI-friendly | Jest, Cypress |
| Package manager / runtime | **pnpm 12**, **Node 24 LTS** | Fast, strict installs. 24 is the current LTS line | npm/yarn, Node 22 (maintenance) |
| Hosting | **Cloudflare Pages** (free) + `_headers` for COOP/COEP | Free, no bandwidth cap listed, preview URL per branch, custom headers | GitHub Pages (no custom headers), Vercel Hobby (non-commercial only) |
| CI/CD | **GitHub Actions** (free for public repos) + Cloudflare Pages Git integration | Checks on every PR, auto preview, auto production deploy | |

**Is this the best stack?** For this specific product, yes. The deciding factor is *exact* look:
- A cell-buffer engine copied from Turbo Vision is how the original worked. Everything else (CodeMirror, React) would be "close, but not Turbo".
- The trade-off is that we write our own windowing and editor code. Turbo C++'s editor is simple, so the scope is manageable and it's phased in §11.

---

## 5. Architecture

```
┌──────────────────────────── Browser tab (main thread) ────────────────────────────┐
│  Input layer         hidden <textarea> + pointer events → TV-style key/mouse events │
│        │                                                                            │
│  TV engine           Application ─ Desktop ─ Windows (Edit, Message, Watch, Output) │
│  (TypeScript)        MenuBar · StatusLine · Dialogs · Controls                      │
│        │  draw()     every view writes (char, attr) into its area                   │
│  Cell buffer         cols × rows of {ch, attr}; shadows recolour cells to 0x08       │
│        │  dirty cells                                                               │
│  Renderer            Canvas 2D + VGA glyph atlas · integer scale · cursor blink    │
│  A11y mirror         offscreen DOM text + aria-live for output                       │
│  Storage             IndexedDB (files, settings, desktop layout)                     │
│        ▲  postMessage + SharedArrayBuffers (stdin ring, interrupt, debug control)   │
└────────┼───────────────────────────────────────────────────────────────────────────┘
┌────────┴──────────── Python Worker ────────────┐
│  Pyodide 314 (CPython 3.14 WASM)                 │
│  stdout/stderr → batched messages → User screen │
│  stdin  ← Atomics.wait on stdin buffer          │
│  Stop   ← interrupt buffer → KeyboardInterrupt  │
│  Debug  ← sys.monitoring + Atomics pause        │
│  Packages: auto-load on import, micropip        │
│  Modules: conio, graphics (BGI-style), turtle   │
└─────────────────────────────────────────────────┘
Static hosting: Cloudflare Pages (HTML/JS/CSS/font + _headers)   Pyodide files: jsDelivr (pinned)
```

**Screen fit modes** (Options › Environment › Preferences):
- **Exact:** 80×25, largest integer scale, black side bars. This is the default.
- **Fill:** columns and rows computed from the window size. Turbo Vision handles any size, like TC's 43/50-line modes.
- **Phone:** landscape, Exact or Fill, plus the touch toolbar.

---

## 6. Python runtime details

1. **Boot**
   - The IDE paints immediately while the worker downloads Pyodide in the background (about 6 MB compressed on first visit).
   - The status line shows `Loading Python…`, then `Python 3.14 ready`.
   - Opening a menu or typing never waits for Python.
2. **Run (Ctrl+F9)**
   - Save all, then syntax check (a Compiling dialog appears only if there are errors).
   - Switch to the user screen and run in a **fresh namespace** in the warm interpreter. The interpreter is never reloaded between runs.
   - When the program ends, return to the IDE (§3.4).
3. **Output**
   - stdout/stderr are batched per animation frame, so a 10,000-line print loop never freezes the page.
   - The user screen keeps a scrollback of about 2,000 lines.
   - stderr is shown in light red *(design choice: TC had none; can be turned off)*.
4. **Input**
   - `input()` blocks the worker on a SharedArrayBuffer. The user types on the user screen, and Enter sends the line.
   - **Fallback** when the page isn't cross-origin isolated: a TC-style "Program input" dialog where the user fills stdin before running.
5. **Errors**
   - Tracebacks are parsed into **Message window** entries in Borland format: `Error MAIN.PY 7: NameError: name 'x' is not defined`.
   - Message tracking jumps to the line. Syntax errors come from Alt+F9 as well.
6. **Debugger**
   - F7/F8/F4, Ctrl+F8 breakpoints, Ctrl+F7 watches, Alt+F4 inspect, Ctrl+F4 evaluate, Ctrl+F3 call stack. Uses `sys.monitoring` line events.
   - The worker pauses with `Atomics.wait`, and the CPU line (black on cyan) moves in the editor.
7. **Libraries**
   - `import numpy` auto-loads built-in packages (357 available).
   - Other pure-Python packages install via micropip (≡ › Package manager).
   - Not available in the browser: tensorflow, torch, tkinter, subprocess, multiprocessing, raw sockets, MySQL connectors. A "Run on server" mode is a possible later phase and is outside the $0 scope.
8. **Nostalgia modules (Phase 3):**
   - `conio`: `clrscr()`, `getch()`, `gotoxy()`, `textcolor()`.
   - `graphics`: BGI-style `initgraph`, `line`, `circle`, `setcolor`, `outtextxy`, `closegraph`, drawn on a full-screen 640×480 16-colour canvas.
   - `turtle`: a canvas-backed replacement for the tkinter one.
9. **Limits:**
   - Pure-Python code runs about **3–5× slower** than native (Pyodide's own figure). numpy is near native.
   - No network except CORS-enabled sites.
   - Files live in the browser.

---

## 7. Repository structure

```
pyturbo/
├─ .github/
│  ├─ workflows/ci.yml            lint · typecheck · unit · e2e · build
│  ├─ workflows/release.yml       release-please
│  ├─ ISSUE_TEMPLATE/             bug.yml · feature.yml · fidelity.yml
│  ├─ pull_request_template.md
│  ├─ CODEOWNERS
│  └─ dependabot.yml
├─ public/
│  ├─ _headers                    COOP/COEP, CSP, cache rules
│  ├─ fonts/Px437_IBM_VGA_9x16.*  + LICENSE (CC BY-SA 4.0)
│  └─ icons/                      PWA icons
├─ src/
│  ├─ engine/                     TV engine: cell buffer, views, groups, events, palettes
│  │  ├─ palette.ts               cpAppColor-equivalent tables (from §3 / Appendix A)
│  │  ├─ views/                   Window, Frame, ScrollBar, MenuBar, MenuBox, StatusLine, Dialog, Button, ListBox, InputLine…
│  │  └─ renderer/                canvas renderer, glyph atlas, a11y mirror
│  ├─ editor/                     EditView, buffer, WordStar keymap, undo, search, highlighter (lezer)
│  ├─ ide/                        menus, commands, windows (Message/Watch/Output), dialogs (Open, Colors, About…)
│  ├─ runtime/                    worker.ts (Pyodide), bridge.ts (SAB stdin/interrupt/debug), traceback parser
│  ├─ python/                     conio.py, graphics.py, turtle.py, debugger.py
│  ├─ storage/                    IndexedDB files, settings, desktop layout, share links
│  └─ main.ts
├─ tests/
│  ├─ unit/                       Vitest: engine, editor, tokenizer mapping, traceback parser
│  ├─ golden/                     reference screens (text + attributes) transcribed from real TC
│  └─ e2e/                        Playwright: run, input, stop, debugger, share, offline
├─ docs/                          design notes, fidelity checklist, screenshots (our own, not Borland's)
├─ biome.json · tsconfig.json · vite.config.ts · package.json
├─ README.md · LICENSE (MIT) · NOTICE (third-party credits) · CONTRIBUTING.md
└─ CODE_OF_CONDUCT.md · SECURITY.md · CHANGELOG.md (generated)
```

---

## 8. GitHub workflow (commit · push · PR)

**Model: GitHub Flow with short-lived branches.**
- `main` is always deployable and deploys to production automatically.
- Every change goes through a pull request.

### 8.1 One-time repository setup
- [ ] Public repo `pyturbo`, default branch `main`, MIT licence, README, `.gitignore` (Node).
- [ ] **Ruleset on `main`:**
  - require a pull request
  - require status checks `ci / lint`, `ci / typecheck`, `ci / unit`, `ci / e2e`, `ci / build`
  - require conversation resolution
  - require linear history
  - block force pushes and deletion
- [ ] Merge settings: **squash merge only**, "default to PR title", **auto-delete head branches**.
- [ ] Solo maintainer: set required approvals to 0 (GitHub doesn't let you approve your own PR) but keep required checks. Raise to 1 when contributors join.
- [ ] Security (free on public repos): secret scanning + push protection, Dependabot alerts, CodeQL (JavaScript/TypeScript).
- [ ] Labels:
  - `type:feat` `type:bug` `type:chore` `type:docs` `type:fidelity`
  - `area:engine` `area:editor` `area:runtime` `area:ide` `area:infra`
  - `prio:high` `prio:low`
  - `good first issue`
- [ ] Milestones = phases (§11). GitHub Projects board: Backlog → Ready → In progress → In review → Done.
- [ ] Connect Cloudflare Pages to the repo (§9) so every PR gets a preview URL.

### 8.2 Daily loop
1. **Issue first.** Every piece of work has an issue with acceptance criteria (use the templates).
2. **Branch from fresh `main`**, named `<issue#>-<short-slug>`, e.g. `42-message-window`.
   ```bash
   git switch main
   ```
   ```bash
   git pull --ff-only
   ```
   ```bash
   git switch -c 42-message-window
   ```
3. **Small commits** using **Conventional Commits**:
   - `feat(ide): add Message window with message tracking`
   - `fix(runtime): flush stdout before input() prompt`
   - `docs: describe palette tables`
   - Types: `feat` `fix` `perf` `refactor` `test` `docs` `build` `ci` `chore`; scope = area. Breaking change: `feat!:` plus a `BREAKING CHANGE:` footer.
4. **Local checks run automatically** via **lefthook** (pre-commit: Biome format and lint on staged files; commit-msg: commitlint).
5. **Push early, open a draft PR**:
   ```bash
   git push -u origin 42-message-window
   ```
   - PR title in Conventional Commit form; it becomes the squash-commit message.
   - The body uses the template: what/why, screenshots (before/after, and the TC reference for UI work), test notes, `Closes #42`.
6. **CI + preview:** GitHub Actions runs the checks, and Cloudflare comments a preview URL (`<hash>.pyturbo.pages.dev`). Test on the preview, including on a phone.
7. **Review:** self-review the diff (a review checklist lives in the PR template), resolve all threads, mark ready.
8. **Squash merge**, branch auto-deleted, production deploys from `main` in about a minute.
9. **Releases:**
   - **release-please** keeps a "Release vX.Y.Z" PR open, updated from commit types.
   - Merging it tags the release, writes `CHANGELOG.md` and creates a GitHub Release.
   - SemVer: `0.x` until Phase 4, `1.0.0` at public launch.

### 8.3 Rules of thumb
- One issue → one branch → one PR. Keep PRs under about 400 changed lines where possible.
- Never commit directly to `main`. Never force-push shared branches; force-pushing your own PR branch after a rebase is fine.
- Keep branches current with `git rebase origin/main` (linear history), or GitHub's "Update branch" button.
- UI changes must include a **fidelity screenshot** next to the real TC reference.
- Dependabot PRs (weekly, grouped minor/patch) merge after CI passes. Major upgrades get their own issue.
- Never commit secrets. Nothing in this project needs any (no API keys).

### 8.4 CI pipeline (`.github/workflows/ci.yml`)
```
on: pull_request, push to main
jobs (Node 24, pnpm cache):
  lint       biome ci .
  typecheck  tsc --noEmit
  unit       vitest run --coverage
  e2e        playwright test (chromium, firefox, webkit) against vite preview with COOP/COEP headers
  build      vite build → upload dist as artifact
```
Free: GitHub Actions minutes are unlimited for public repositories.

---

## 9. Deployment (Cloudflare Pages, free)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Connect to Git** → pick `pyturbo`.
2. Project name **`pyturbo`** (gives `pyturbo.pages.dev`). Build command `pnpm build`, output `dist`, env `NODE_VERSION=24`.
3. Production branch `main`; every other branch/PR gets a preview URL automatically.
4. `public/_headers`:
   ```
   /*
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
     X-Content-Type-Options: nosniff
     Referrer-Policy: no-referrer
     Permissions-Policy: camera=(), microphone=(), geolocation=()
   /assets/*
     Cache-Control: public, max-age=31536000, immutable
   ```
   - A Content-Security-Policy gets added in Phase 0, once we confirm what Pyodide needs (`'wasm-unsafe-eval'`, possibly `'unsafe-eval'`, plus jsDelivr and PyPI for micropip).
   - jsDelivr already sends `Cross-Origin-Resource-Policy: cross-origin`, so Pyodide loads fine under COEP (checked 26 Oct 2026).
5. Limits (free plan): 500 builds/month, 20,000 files, 25 MiB per file. Pyodide core comes from jsDelivr, so we're far inside these limits.
6. Optional later: custom domain (about $10–15/year, the only possible cost) and Cloudflare Web Analytics (free, cookieless).

---

## 10. Testing and quality

| Layer | What | Tool |
|---|---|---|
| Engine | Views draw correct cells, event routing, shadows recolour to `0x08`, focus, modal dialogs | Vitest |
| **Golden screens** | Reference screens transcribed from real TC (menus, dialogs, windows) as text + attribute grids. The engine output must match **cell for cell** | Vitest snapshot |
| Editor | WordStar keys, block ops, undo/redo, search/replace, auto-indent, tokenizer → TC colour mapping | Vitest |
| Runtime | `print`, `input()` in loops, infinite loop + Stop, huge output, exceptions, syntax errors, unicode, numpy, matplotlib, micropip, recursion limit, `sys.argv` | Playwright |
| Visual | Screenshot diff vs approved baselines at 1×/2×/3× scale | Playwright `toHaveScreenshot` |
| Browsers | Chrome, Edge, Firefox, Safari (macOS + iOS), Android Chrome | Playwright + manual on previews |
| Performance budgets | IDE first paint < 1 s on 4G; Python ready < 5 s first visit, < 1.5 s repeat; Run start < 50 ms when warm; 60 fps while typing | Lighthouse + Playwright traces |
| Accessibility | Keyboard-only use, screen-reader mirror, "Modern high-contrast" colour preset | axe + manual |

---

## 11. Roadmap

Rough durations assume one developer working part-time.

### Phase 0: Foundations and spikes (≈1 week)
- [ ] Repo, licence, CI skeleton, lefthook, Biome, Cloudflare Pages preview working with COOP/COEP.
- [ ] Spike: glyph atlas from Px437 9×16 → canvas renderer, integer scaling, pixel-compare against an emulator screenshot.
- [ ] Spike: Pyodide in worker + SharedArrayBuffer `input()` + interrupt, deployed on the preview URL.
- [ ] Spike: keyboard capture matrix (§3.8) in 4 browsers + Keyboard Lock in fullscreen.
- [ ] Finalise palette tables (Appendix A) and golden-screen format.
- **Exit:** a static page shows a pixel-exact TC menu bar, desktop and status line; Python prints and reads input on the preview URL.

### Phase 1: Turbo shell + Run (MVP, ≈4 weeks)
- [ ] Engine: views, groups, windows, frames, scrollbars, shadows, menus, status line, dialogs, buttons, list box, input line, mouse.
- [ ] All 11 menus with real labels, hotkeys and status hints (unimplemented items disabled).
- [ ] Edit window: typing, cursor, scrolling, insert/overwrite, auto-indent, block mark, clipboard, undo/redo, syntax colours (§3.5), `*` flag, line:col.
- [ ] Run Ctrl+F9 → user screen → return; Alt+F5; live `input()`; Program reset Ctrl+F2 / Stop.
- [ ] Message window from tracebacks + message tracking; Alt+F9 Compile with the Compiling dialog.
- [ ] File: New/Open/Save/Save as/Save all via IndexedDB; Download .py; Upload; Open a File dialog clone.
- [ ] Share link; About box.
- **Exit:** a student can write, run, debug errors in, save and share a program with input, all in the Turbo look. Golden screens pass.

### Phase 2: Feature parity (≈3 weeks)
- [ ] Multiple windows, F6/Alt+n, Tile/Cascade, Zoom F5, Size/Move Ctrl+F5, Window › List all.
- [ ] Search: Find, Replace, Search again, Go to line, Locate function.
- [ ] Packages: auto-load on import, ≡ › Package manager (micropip), matplotlib plots in a TC-style window.
- [ ] Options › Environment › Colors (full dialog), Editor, Preferences (25/43/50 lines, fit mode, video mode Color / B&W-LCD / Monochrome). Settings persist.
- [ ] Output window; Help window with our own help content; Program arguments.
- **Exit:** everything the reference sites offer, except their server-only libraries.

### Phase 3: Debugger and nostalgia (≈3 weeks)
- [ ] F7 Trace / F8 Step / F4 Go to cursor, CPU line, Ctrl+F8 breakpoints, Watch window (Ctrl+F7), Inspect, Evaluate/modify, Call stack.
- [ ] `conio`, `graphics` (BGI-style full-screen graphics mode), `turtle`.
- [ ] Project menu: multi-file programs.

### Phase 4: Polish, mobile, offline (≈2 weeks)
- [ ] PWA/offline, DOS mode (fullscreen + Keyboard Lock), touch toolbar, phone layout.
- [ ] Accessibility pass, performance budgets, cross-browser fixes.
- [ ] README with GIFs, docs, contributing guide.

### Phase 5: Launch (≈1 week)
- [ ] `v1.0.0` release, announcement posts, feedback issue templates, Cloudflare Web Analytics.

---

## 12. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| COOP/COEP headers block a third-party resource | `input()`/Stop break | Load only from same origin + jsDelivr (CORP ok); test on every preview; fallback stdin dialog |
| Browser shortcuts can't be captured | Some TC keys unusable | DOS mode with Keyboard Lock; alternative keys; menus always work |
| Own editor takes longer than planned | Delays MVP | Keep TC's simple feature set; WordStar keys first; no autocomplete in v1 |
| iPhone memory limits with Pyodide | Crashes on old iPhones | Lazy-load packages; warn on low memory; test on real devices |
| Trademark complaint | Forced rename | Name is PyTurbo (not "Turbo Python"); no Borland logos/text; disclaimer; all screens recreated by us |
| Font licence | Takedown | Use int10h font under CC BY-SA 4.0 with credit in NOTICE and About |
| Scope creep (debugger, graphics) | Never ships | Phases with exit criteria; MVP first |
| Solo maintainer burnout | Stalls | Small PRs, automation (CI, release-please, Dependabot), `good first issue` labels |

---

## 13. Cost sheet

| Item | Service | Cost |
|---|---|---|
| Code hosting, issues, CI | GitHub (public repo, Actions) | $0 |
| Website hosting + previews | Cloudflare Pages free plan | $0 |
| Python runtime files | jsDelivr CDN | $0 |
| Python execution | Visitor's own browser | $0 |
| Analytics (optional) | Cloudflare Web Analytics | $0 |
| Custom domain (optional) | any registrar | ~$10–15/year |
| **Total** | | **$0** (domain optional) |

---

## 14. Legal and credits
- Our code: **MIT**.
- **Pyodide**: MPL-2.0, used unmodified from the CDN.
- **@lezer/python**, **lz-string**, **idb-keyval**: MIT.
- **Px437 IBM VGA font**: © VileR, int10h.org, **CC BY-SA 4.0**. Credit in NOTICE and About.
- No Borland/Embarcadero code, binaries, logos, help text or screenshots are shipped. All screens are recreated from scratch. Reference screenshots stay out of the repo.
- About box: "PyTurbo is an independent project, not affiliated with Borland or Embarcadero. Turbo C++ is a trademark of its owner."

---

## 15. Open decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Default screen mode | **Exact 80×25** with side bars; Fill mode in Options |
| 2 | Default identifier colour | **Factory light green** (real default) with a "Classic yellow" preset |
| 3 | Phone experience | **Exact look + touch toolbar** (landscape) |
| 4 | Pause after run | **Off** (authentic), option to turn on |
| 5 | GitHub owner | Personal account now; move to an org (`pyturbo-ide`) if contributors join |
| 6 | Server mode for extra libraries | **Not in scope**; revisit after v1.0 |

---

## Appendix A: Turbo Vision palette (verified from source)

Each attribute byte = `background << 4 | foreground` (VGA colours in §3.1).
- Entries 1–63 are identical in Turbo Vision 1.0 (the TC++ 3.0 era) and 2.0, except 15/23/31/62/63, which are `00` (reserved) in 1.0.
- `src/engine/palette.ts` encodes this table. The IDE's own editor colours (§3.5) sit on top of it.

**Raw `cpAppColor` (entries 1–63):**
```
 1-15 : 71 70 78 74 20 28 24 17 1F 1A 31 31 1E 71 1F
16-31 : 37 3F 3A 13 13 3E 21 3F 70 7F 7A 13 13 70 7F 7E
32-47 : 70 7F 7A 13 13 70 70 7F 7E 20 2B 2F 78 2E 70 30
48-63 : 3F 3E 1F 2F 1A 20 72 31 31 30 2F 3E 31 13 38 00
```

| Idx | Role | Byte | Colours |
|---|---|---|---|
| 1 | Desktop `░` | 71 | blue on light grey |
| 2 / 3 / 4 | Menu & status: normal / disabled / hotkey | 70 / 78 / 74 | black, dark grey, red on light grey |
| 5 / 6 / 7 | Selected: normal / disabled / hotkey | 20 / 28 / 24 | black, dark grey, red on green |
| 8–14 | **Blue window**: frame passive, frame active, icons, scrollbar page, scrollbar controls, text, selected text | 17 1F 1A 31 31 1E 71 | light grey/white/light green on blue; blue on cyan; yellow on blue; blue on light grey |
| 16–22 | **Cyan window** (Message, Watch): same roles | 37 3F 3A 13 13 3E 21 | light grey/white/light green on cyan; cyan on blue; yellow on cyan; blue on green |
| 24–30 | **Gray window**: same roles | 70 7F 7A 13 13 70 7F | black/white/light green on light grey; cyan on blue; black on grey; white on grey |
| 32–34 | Dialog frame passive / active / icon | 70 7F 7A | black / white / light green on light grey |
| 35–36 | Dialog scrollbar page / controls | 13 13 | cyan on blue |
| 37 | Static text | 70 | black on light grey |
| 38–40 | Label normal / selected / hotkey | 70 7F 7E | black / white / yellow on light grey |
| 41–45 | Button normal / default / focused / disabled / hotkey | 20 2B 2F 78 2E | black, light cyan, white on green; dark grey on grey; yellow on green |
| 46 | Button shadow | 70 | black on light grey (`▄ ▀`) |
| 47–49 | Cluster normal / selected / hotkey | 30 3F 3E | black, white, yellow on cyan |
| 50–52 | Input line normal / selected / arrows | 1F 2F 1A | white on blue; white on green; light green on blue |
| 53–54 | History arrow / sides | 20 72 | black on green; green on light grey |
| 55–56 | History list scrollbar | 31 31 | blue on cyan |
| 57–60 | List viewer normal / focused / selected / divider | 30 2F 3E 31 | black on cyan; white on green; yellow on cyan; blue on cyan |
| 61 | Info pane | 13 | cyan on blue |

**View → palette mapping:**
- Frame: passive 1, active 2, icons 3.
- Scrollbar: page 4, arrows/thumb 5.
- Editor: text 6, selection 7.
- Button: 10–15.
- Label: 7–9.
- Cluster: 16–18.
- Input line: 19–21.
- History: 22–23.
- List viewer: 26–29.
- Info pane: 30.

All indexes are relative to the owning dialog's palette (gray dialog: app index = 31 + k).

## Appendix B: Editor keys (Turbo C++ 3.0 "Alternate" command set, from the 1992 User's Guide)

| Group | Keys |
|---|---|
| Movement | arrows (also ^S ^D ^E ^X), Ctrl+←/→ word (^A ^F), ^W/^Z scroll, PgUp/PgDn (^R ^C), Home/End (^QS ^QD), Ctrl+Home/End window top/bottom (^QE ^QX), Ctrl+PgUp/PgDn file top/bottom (^QR ^QC), ^QP previous position |
| Delete/insert | Del (^G), Bksp (^H), ^Y line, ^QY to end of line, ^T word, ^N insert line, Ins (^V) insert/overwrite |
| Blocks | ^KB begin, ^KK end, ^KT word, ^KL line, ^KH hide, ^KC copy, ^KV move, ^KY delete, ^KI/^KU indent/unindent, ^KR read file, ^KW write block, ^KP print, ^QB/^QK go to block begin/end, Shift+movement extends selection |
| Bookmarks | ^K0–^K9 set, ^Q0–^Q9 jump |
| Search | ^QF find, ^QA replace, ^L search again, ^Q[ / ^Q] matching bracket |
| Toggles | ^OI auto-indent, ^OT tab mode, ^OU unindent, ^OF optimal fill, ^OR cursor through tabs |
| File | ^KS save, ^KD exit to menu |
| Clipboard | Ctrl+Ins copy, Shift+Del cut, Shift+Ins paste, Ctrl+Del clear, Alt+Bksp undo, Alt+Shift+Bksp redo |

Video modes in Options › Environment › Preferences: **Color**, **Black & White / LCD**, **Monochrome**. In monochrome, shadows are off and `»` `«` mark the focused control. PyTurbo adds these as colour presets in Phase 2.

## Appendix C: Sources
- Real Turbo C++ 3.0 running in DOSBox (js-dos): https://turboc.pages.dev (observed 26 Oct 2026)
- Turbo Vision 2.0 modern port: https://github.com/magiblot/tvision (palette in `include/tvision/app.h`; drawing in `source/tvision/*.cpp`)
- Borland's original TV 2.0 import: https://github.com/magiblot/tvision/blob/222c5042bd/include/tvision/app.h
- Turbo Vision 1.0 palette (Turbo Pascal 6 APP.PAS): https://github.com/davidly/dos_compilers/blob/master/Borland%20Turbo%20Pascal%20v6/TVISION/APP.PAS
- Turbo C++ 3.0 User's Guide (1992): https://archive.org/details/bitsavers_borlandturide1992_32222686
- Borland C++ 3.1 User's Guide (1992): https://archive.org/details/bitsavers_borlandborn3.1UsersGuide1992_9890437
- Pyodide: https://pyodide.org · package list from `pyodide-lock.json` (314.0.7)
- Pyodide speed figures: https://pyodide.org/en/314.0.5/_sources/project/roadmap.md
- Pyodide interrupts: https://pyodide.org/en/stable/usage/keyboard-interrupts.html
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages headers: https://developers.cloudflare.com/pages/configuration/headers/
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Vercel fair use (Hobby = non-commercial): https://vercel.com/docs/limits/fair-use-guidelines
- int10h font licence: https://int10h.org/oldschool-pc-fonts/readme/
- Lezer Python grammar: https://github.com/lezer-parser/python
