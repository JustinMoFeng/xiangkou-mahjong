Audio assets bundled in this project:

## Xiangkou Mahjong BGM

- File: `mahjong-bgm.mp3`
- Track: `Kokushi Musou loop`
- Source: TNO/T-STUDIO royalty-free casino / mahjong music page
- URL: https://tnosite.com/en/casino-music-5/
- Download URL: https://tnosite.com/wp-content/uploads/2026/03/Kokushi_Musou_loop.mp3

The source page states that the music is available for commercial use. Review
the site's current terms before publishing outside personal/testing builds.

## Casual game BGM playlist

The casual games (`麻将连连看`, `麻将羊羊消`, `线阵清场`) use a shared playlist of
six real background music tracks. The files are normalized and transcoded to
lightweight MP3 for web playback.

All six tracks are by Kevin MacLeod (incompetech.com), licensed under Creative
Commons Attribution 4.0. Please keep attribution visible in release notes or
credits if this project is published.

- `casual/bgm/carefree.mp3`
  - Track: `Carefree`
  - Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037
  - Download: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3
- `casual/bgm/wallpaper.mp3`
  - Track: `Wallpaper`
  - Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400034
  - Download: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3
- `casual/bgm/local-forecast-elevator.mp3`
  - Track: `Local Forecast - Elevator`
  - Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300012
  - Download: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Local%20Forecast%20-%20Elevator.mp3
- `casual/bgm/lobby-time.mp3`
  - Track: `Lobby Time`
  - Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600049
  - Download: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Lobby%20Time.mp3
- `casual/bgm/amazing-plan.mp3`
  - Track: `Amazing Plan`
  - Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100737
  - Download: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Amazing%20Plan.mp3
- `casual/bgm/bossa-antigua.mp3`
  - Track: `Bossa Antigua`
  - Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100475
  - Download: https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bossa%20Antigua.mp3

Attribution text recommended by the source:

```text
Music by Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/
```

## Casual game sound effects

Sound effects for the casual games are taken from Kenney audio packs and
transcoded to lightweight MP3. Kenney assets are Creative Commons CC0.

- Source: https://kenney.nl/assets/interface-sounds
- Source: https://kenney.nl/assets/casino-audio
- Source: https://kenney.nl/assets/digital-audio
- Source: https://kenney.nl/assets/impact-sounds
- License: https://creativecommons.org/publicdomain/zero/1.0/

Files under `casual/sfx/` are mapped per game so each game has a distinct feel:

- `link-*`: card/chip/table sounds for `麻将连连看`.
- `yang-*`: pluck/glass/UI sounds for `麻将羊羊消`.
- `parking-*`: digital/metal/phase sounds for `线阵清场`.
