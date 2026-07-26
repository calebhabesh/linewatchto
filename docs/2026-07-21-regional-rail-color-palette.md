# Regional Rail Color Palette (July 2026 Metrolinx Specification)

Sampling source: Inkscape Eyedropper on official Metrolinx July 2026 Regional Transit Diagram.

## Color Tokens

| Corridor Code | Corridor Name | Eyedropper HEX (8-bit) | Clean HEX (6-bit) | CSS Variable Name |
| :---: | :--- | :---: | :---: | :--- |
| **`UP`** | Union Pearson Express | `#4084cdff` | `#4084cd` | `--color-line-up: #4084cd;` |
| **`BR`** | Barrie Line | `#155ba0ff` | `#155ba0` | `--color-line-br: #155ba0;` |
| **`KI`** | Kitchener Line | `#138336ff` | `#138336` | `--color-line-ki: #138336;` |
| **`LE`** | Lakeshore East Line | `#ee2722ff` | `#ee2722` | `--color-line-le: #ee2722;` |
| **`LW`** | Lakeshore West Line | `#8b0a31ff` | `#8b0a31` | `--color-line-lw: #8b0a31;` |
| **`MI`** | Milton Line | `#f47216ff` | `#f47216` | `--color-line-mi: #f47216;` |
| **`RH`** | Richmond Hill Line | `#27adeaff` | `#27adea` | `--color-line-rh: #27adea;` |
| **`ST`** | Stouffville Line | `#774111ff` | `#774111` | `--color-line-st: #774111;` |

## CSS Variable Integration

```css
:root {
  /* Regional Rail / Metrolinx Official 2026 Palette */
  --line-up: #4084cd;
  --line-br: #155ba0;
  --line-ki: #138336;
  --line-le: #ee2722;
  --line-lw: #8b0a31;
  --line-mi: #f47216;
  --line-rh: #27adea;
  --line-st: #774111;
}
```
