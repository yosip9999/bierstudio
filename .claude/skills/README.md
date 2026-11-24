# Design-Skills (Stil-Referenz: RonDesignLab)

Fünf Skills für Claude Code, ausgewählt für den Stil von RonDesignLab (RDL): saubere
Health-, Fintech- und Smart-Home-App-UIs, weiche Verläufe, 3D-Produktrenderings sowie
Hero-Animationen, die beim Scrollen ablaufen (z. B. „Vessel – Website Hero Scroll Animation“
oder „Smart Nora – Sleep Tracking Animation“).

| Skill | Quelle | Wofür |
|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Klare ästhetische Richtung, Typografie, kein generischer „KI-Look“ |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) | Design entwerfen, kritisieren, polieren, animieren (`/impeccable polish`, `critique`, `delight` …) |
| `motion-framer` | [freshtechbro/claudedesignskills](https://github.com/freshtechbro/claudedesignskills) (MIT) | Micro-Interactions, Hover/Tap, Layout- und Seitenübergänge in React |
| `gsap-scrolltrigger` | freshtechbro/claudedesignskills (MIT) | Scroll-Storytelling, Pinning, Parallax, Hero-Sequenzen |
| `react-three-fiber` | freshtechbro/claudedesignskills (MIT) | Echte 3D-Objekte und -Szenen statt statischer Renderings |

## Nutzung

- **In diesem Repo:** Die Skills liegen unter `.claude/skills/` und werden automatisch geladen.
- **In allen künftigen Projekten (lokal):** Kopiere die Skills einmal in dein User-Verzeichnis:
  ```bash
  mkdir -p ~/.claude/skills && cp -r .claude/skills/* ~/.claude/skills/
  ```
- Beispiel-Prompt: *„Bau eine Landingpage für eine Schlaf-Tracking-App im RDL-Stil: helle
  Pastellverläufe, 3D-Gerät im Hero, das sich beim Scrollen dreht, sanfte Micro-Interactions.“*

## Hinweis zur Sicherheit

`impeccable` bringt ein Launcher-Skript mit (`scripts/impeccable`), das bei Bedarf ein
plattformspezifisches Programm herunterlädt und gegen `engine-checksums.txt` prüft. Die
reinen Anleitungen funktionieren auch ohne dieses Programm.
