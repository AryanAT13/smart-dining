# Menu image sources

Drop one image per menu item in this directory, named by its slug:

```
paneer-tikka.jpg
chicken-tikka.jpg
butter-chicken.webp
…
```

Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`.

Then run:

```bash
pnpm menu:upload-images               # dry-run by default? no — uploads
pnpm menu:upload-images --dry-run     # see what would happen
pnpm menu:upload-images --sync-db     # also rewrite menu_items.image_url
pnpm menu:upload-images --only paneer-tikka --sync-db
```

The script:

- transcodes to WebP, max 1024px wide, q=80
- re-encodes at a lower quality if the output exceeds 100 KB (per spec §4.2)
- uploads to R2 under `menu/<slug>.webp`
- when `--sync-db` is passed, overwrites `menu_items.image_url` with the
  public R2 URL so the UI picks up the new asset

Images are NOT committed to git — only the slugs and metadata live in
`menu.json`. Drop sources here on a deploy machine (or use a one-time CI
job) and run the script to publish.
