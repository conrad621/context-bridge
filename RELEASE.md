# Release

## Prerequisites

- Node.js `>=20`
- npm account with publish access to the package name
- Clean working tree

## Preflight

```bash
npm install
npm test
npm run pack:dry
npm run publish:dry
```

Review the dry-run output. The package should contain only:

- `dist/src/**`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `LICENSE`
- `package.json`

## Version

The unscoped public `context-bridge` package name is already owned by another npm package. This project publishes as `@mmmjk/context-bridge` while keeping the CLI binary name `context-bridge`.

For patch releases:

```bash
npm version patch
```

Use `minor` or `major` when public CLI behavior changes incompatibly.

## Publish

```bash
npm publish --access public
```

## Smoke Check

After publish:

```bash
npm view @mmmjk/context-bridge version
npm install -g @mmmjk/context-bridge
context-bridge --help
ctxb --help
```

## Notes

- `prepack` runs `npm run build`, so `dist/src/**` is regenerated before packing.
- Do not publish local runtime state such as `.omx/`, `.omc/`, `.idea/`, `data/`, or generated `.tgz` files.
