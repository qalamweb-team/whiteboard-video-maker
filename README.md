# Whiteboard Video Maker

Turn a set of images into a hand-drawn whiteboard video: each image is sketched line by line, filled in and coloured, timed to an optional voiceover, and exported as a video file from your browser.

Inspired by https://elrebh.net

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create, rename and delete your own video projects, which reopen exactly as you left them.
- Add JPG or PNG images as scenes, then reorder them, remove them and set how long each one lasts.
- Attach an MP3, WAV or M4A voiceover and let the scenes stretch to fit it.
- Pick quality, frame shape, colour reveal, drawing hand, speeds, frame rate, line detail and end hold.
- Arrange scenes on a timeline by dragging, and preview the drawing with the voiceover.
- Export an MP4 or WebM video with the voiceover inside, with no watermark.

Left out: the site's other video and audio tools, its prompt library, the Arabic interface, and accounts and sign-in, which your Gateway handles.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test` for unit tests; `checks/` holds the release suites (behavior, authorization, persistence) that run against a packaged release.
- Deploy: `pnpm run deploy` (your Cloudflare account needs R2 enabled once).

There are no secrets or settings to fill in. The app uses one D1 database for projects and one R2 bucket for images and voiceovers.

## Limitations

- Export records in real time, so a one-minute video takes about a minute; keep the tab in front while it runs.
- The file is MP4 where the browser can record it and WebM elsewhere.
- Uploads are limited to 20 MB per image and 80 MB per voiceover.
- Every project is private to the member who made it; members can't share projects.
