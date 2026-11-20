import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "whiteboard-video-maker",
  name: "Whiteboard Video Maker",
  description:
    "Turns your images into hand-drawn whiteboard videos with an optional voiceover, exported as a video file.",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
});
