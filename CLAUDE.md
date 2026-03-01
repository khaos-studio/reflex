# Reflex

## Onboarding

At the start of each session, read `docs/DESIGN.md` to understand the architecture and type system before doing any work.

## Repository Structure

This is a multi-language repository. TypeScript and Go implementations live in their respective directories, sharing the formal specification in `docs/`.

```
reflex/
├── typescript/   ← TypeScript implementation (@corpus-relica/reflex)
├── go/           ← Go implementation
├── docs/         ← Shared specification (DESIGN.md, ROADMAP)
├── README.md     ← Umbrella README
└── LICENSE
```

## Versioning & Tags

TypeScript and Go are versioned independently. Tags use the format `{language}/v{major}.{minor}.{patch}`:

- TypeScript: `typescript/v0.5.0`
- Go: `go/v0.2.1`

Always use annotated tags with the milestone name as the message:

```bash
git tag -a typescript/v0.5.0 -m "M9: Persistence (TypeScript)"
```

## Escapement Settings
- **context-path**: ../reflex-ctx

