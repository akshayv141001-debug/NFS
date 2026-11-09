# Break Format Builder

A static website that reads network break-format screenshots in the browser and writes break structures such as:

    Network Format: 180-8; 60s duration @ 0:15, 0:31, 0:45, 01:15, 01:45, 02:15, 02:31, 02:45

Longer breaks are listed first; center times ascend inside each length. Formats are saved in the visitor's own browser (localStorage) and can be exported or imported as JSON. The Program file tab stamps saved formats onto lines containing `format CODE`.

No server, account, API key or tracking. Screenshots never leave the browser. The OCR engine (Tesseract.js, Apache-2.0) and English language data are bundled in `vendor/tesseract/`, so the site makes no third-party requests.

## Publish it (pick one)

- **Netlify Drop:** open https://app.netlify.com/drop and drag this whole folder onto the page. You get a public URL immediately.
- **GitHub Pages:** put these files at the root of a repository, then Settings > Pages > Deploy from branch > main / root.
- **Cloudflare Pages:** create a project, choose direct upload, upload this folder (no build command, output directory `/`).
- **Any web host:** upload the folder contents; every file is static.

It must be served over http(s). Opening index.html straight from disk will not work because browsers block the OCR worker on file:// pages.

## Run locally

    cd this-folder && python3 -m http.server 8000   # then open http://localhost:8000

## Files

- `index.html`, `style.css`, `app.js` - the app
- `vendor/tesseract/` - OCR engine, worker, WASM core and English data (about 19 MB)
