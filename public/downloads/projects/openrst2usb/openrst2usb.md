---
title: OpenRCT2 Universal USB Launcher
summary: A portable, cross-platform launcher and installer helper for OpenRCT2 on Windows, macOS and Linux.
logo-image: "https://cdn2.steamgriddb.com/file/sgdb-cdn/hero/09cbfd9f23cee542c8c04d42c443f6ea.webp"
header-image: "https://cdn2.steamgriddb.com/file/sgdb-cdn/hero/09cbfd9f23cee542c8c04d42c443f6ea.webp"
author: SurGamingOnInsulin
categories: [Games, Tools]
featured: true
links:
  source: https://github.com/surgamingoninsulin/OpenRCT2_Universal_Auto_UBS_Launchers
  issues: https://github.com/surgamingoninsulin/OpenRCT2_Universal_Auto_UBS_Launchers/issues
gallery: []
versions:
  - version: 1.0.0
    file: https://github.com/surgamingoninsulin/OpenRCT2_Universal_Auto_UBS_Launchers/releases
    date: 2026-09-22
    changelog: Initial release.
---

## What it does

OpenRCT2 Universal USB Launcher creates a portable helper suite for users who want their OpenRCT2 setup to live on a USB drive.

It does **not** include OpenRCT2, RollerCoaster Tycoon game files, ISO files or torrent files. You must provide your own legally obtained game files.

The generated suite can help with:

- Windows portable OpenRCT2 installation and updates from GitHub releases.
- A dynamic Windows USB launcher using `usb_scanner.vbs`.
- Linux AppImage installation and updates.
- macOS `.app` installation and updates.
- Portable saves, plugins, configuration and data folders.
- Windows log files and archived logs.

## Requirements

The generator uses Python. On Windows, install Python and check that the `py` launcher works:

```text
py --version
```

On Linux or macOS, use:

```text
python3 --version
```

## Quick start

### Windows

1. Download or clone this repository.
2. Install Python if needed.
3. Run `[Generate] OpenRCT2 Portable Suite.bat`, or run `py generate.py`.
4. Copy `OpenRCT2_Portable_Suite/` to your USB drive.
5. Run `Windows/[Install - UPDATE] OpenRCT2.bat` from the USB drive.
6. Start the game with `openrct2.exe --user-data-path=./data`.

### Linux

```bash
python3 generate.py
chmod +x Linux/install_update_openrct2.sh
./Linux/install_update_openrct2.sh
chmod +x OpenRCT2.AppImage
./OpenRCT2.AppImage --user-data-path="./data"
```

### macOS

```bash
python3 generate.py
chmod +x macOS/install_update_openrct2.sh
./macOS/install_update_openrct2.sh
```

## USB layout

The generated portable drive is designed around this structure:

```text
OpenRCT2_USB/
|- data/
|  |- rct1/          optional: your legal RCT1 files
|  |- rct2/          required: your legal RCT2 files
|  |- save/
|  |- plugin/
|  `- config.ini
|- logs/
|  |- latest.log
|  `- archive/
|- openrct2.exe
|- OpenRCT2.AppImage
|- OpenRCT2.app/
|- Windows/
|- Linux/
`- macOS/
```

Recommended USB label: `OpenRCT2_USB`.

The Windows launcher also accepts `OpenRCT2 USB` and can fall back to finding a ready drive that contains `openrct2.exe`.



<div align="center">
  <h1>DOWNLOAD 1 and 2 here:</h1>
  
  <h1>RollerCoaster Tycoon 1 Deluxe</h1>
  <table style="width: 100%; max-width: 800px; table-layout: fixed; border-collapse: collapse;">
    <tr>
      <th style="width: 33.33%;">image</th>
      <th> Name</th>
      <th style="width: 33.33%;">ISO Link</th>
      <th style="width: 33.33%;">TORRENT Link</th>
    </tr>
    <tr>
      <td align="center"><img src="https://dn710201.ca.archive.org/0/items/roller-coaster-tycoon-deluxe/Box1.jpg" width="200" height="auto"></td>
      <td> RollerCoaster Tycoon 1</td>
      <td align="center"><a href="https://archive.org/download/roller-coaster-tycoon-deluxe/RollerCoaster%20Tycoon%20Deluxe.iso/">ISO</a></td>
      <td align="center"><a href="https://archive.org/download/roller-coaster-tycoon-deluxe/roller-coaster-tycoon-deluxe_archive.torrent/">TORRENT</a></td>
    </tr>
  </table>

  <br><br>

  <h1>RollerCoaster Tycoon 2 Deluxe</h1>
  <table style="width: 100%; max-width: 800px; table-layout: fixed; border-collapse: collapse;">
    <tr>
      <th style="width: 33.33%;">image</th>
      <th style="width: 33.33%;">ISO Link</th>
      <th style="width: 33.33%;">TORRENT Link</th>
    </tr>
    <tr>
      <td align="center"><img src="https://dn720200.ca.archive.org/0/items/roller-coaster-tycoon-2-triple-thrill-pack/Box1.jpg" width="200" height="auto"></td>
      <td align="center"><a href="https://archive.org/download/roller-coaster-tycoon-2-triple-thrill-pack/RollerCoaster%20Tycoon%202%20Triple%20Thrill%20Pack.iso">ISO</a></td>
      <td align="center"><a href="https://archive.org/download/roller-coaster-tycoon-2-triple-thrill-pack/roller-coaster-tycoon-2-triple-thrill-pack_archive.torrent">TORRENT</a></td>
    </tr>
  </table>  
  
</div>

<br>
<br>


## License

This project is released under the MIT License.
