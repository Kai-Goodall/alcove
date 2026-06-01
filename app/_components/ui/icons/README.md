# Icons

UI icons are vendored locally — there is no icon package or license key to
install.

- **Source of truth:** the SVG files in [`svg/`](./svg). Each file is a plain
  `<svg>` using `currentColor`, so icons inherit the surrounding text color.
- **Generated module:** [`index.tsx`](./index.tsx) is produced from those SVGs
  by [`scripts/build-icons.mjs`](../../../../scripts/build-icons.mjs). Do not
  edit it by hand.

## Adding or changing an icon

1. Add/replace a file in `svg/` using a kebab-case name. The name becomes the
   exported component: `arrow-up-fill-18.svg` → `IconArrowUpFill18`.
2. Use `fill="currentColor"` so the icon follows text color (use
   `fill-opacity` for a secondary/duotone tone).
3. Regenerate:

   ```bash
   npm run build:icons
   ```

Consume icons through the shared wrapper:

```tsx
import { Icon } from "@/_components/ui/icon";
import { IconPlusFill18 } from "@/_components/ui/icons";

<Icon glyph={IconPlusFill18} size={14} />
```

## Attribution / licensing

The icons currently in `svg/` were derived from the
[Nucleo](https://nucleoapp.com/) library. If you redistribute this repo, make
sure your icon licensing permits it, or replace the SVGs in `svg/` with your own
(or a freely-licensed set such as [Lucide](https://lucide.dev/)) and rerun
`npm run build:icons`.
