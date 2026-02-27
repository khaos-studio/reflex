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

## Escapement Settings
- **context-path**: ../reflex-ctx

