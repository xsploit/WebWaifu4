# Static Local Assets

Files in this folder are served directly by Vite in development and by `serve-dist.mjs` after a local build.

Use this folder for large runtime assets that must be available through stable browser URLs, such as backgrounds, Piper voice files, and other overlay media.

Examples:

- `/cdn-assets/backgrounds/hikari-bedroom.png`
- `/cdn-assets/piper/en_US-riko_2399-medium.onnx`

This local-only fork does not upload these files to a remote CDN.
