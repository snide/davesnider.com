# Claude Code Instructions

## Code Quality Checks

Always run these checks before considering code complete (matches CI):

```bash
pnpm format-check       # Prettier on all files
pnpm tsc                # TypeScript check
pnpm check              # Svelte type checking
pnpm lint               # ESLint
```

Fix formatting issues with:

```bash
pnpm prettier --write .
```

## Database Migrations

**Never create or generate Drizzle migrations directly.** Always prompt the user to run:

```bash
pnpm db:generate
```

The user will handle migration generation and review. You may edit the schema in `src/db/schema.ts`, but migrations must be user-generated.

## CSS Naming Convention

Use strict BEM (Block Element Modifier) naming:

```
.componentName__elementName--modifierName
```

Examples:

- `.filePage` - block
- `.filePage__title` - element
- `.filePage__title--large` - modifier
- `.colorBand` - block
- `.colorBand__color` - element

Rules:

- Block names use camelCase
- Elements use double underscore `__`
- Modifiers use double hyphen `--`
- Never nest BEM selectors beyond one level

## Skill and Doc Freshness

- **SK-1 (MUST)**: Project skills live in `.claude/skills/*/SKILL.md`. When a
  change alters a pattern documented in a skill (see each skill's "Anchor
  files" list), update that SKILL.md in the same PR and bump its
  "last verified" date.
- **SK-2 (MUST)**: If a skill contradicts the code, the code wins — fix the
  skill as part of the current change rather than working around it.
