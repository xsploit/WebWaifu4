# CDN Assets

This folder contains large static assets that will be deployed to the CDN.

## How it works

1. **Add your assets here** (images, audio, videos, etc.)
2. **Deploy the stream overlay** with the normal project build/deploy path.
3. **cdn-assets will be uploaded to the CDN** versioning is also handled for you

## Usage in Code

```typescript
const response = await fetch('/cdn-assets/hero-image.png');
const imageBlob = await response.blob();

// Use in React:
<img src={imageBlob} alt="Hero" />
```

**Note:** This project serves these assets as normal static files from the overlay host.

## Important Notes

- **DO** commit assets to this folder
- Use `public/` folder for small essential assets (<100KB)
- Use `public/cdn-assets` folder for large assets (>100KB)
