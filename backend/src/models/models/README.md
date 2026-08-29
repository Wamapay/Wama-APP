# Models

The single source of truth for data models is the Prisma schema at
`prisma/schema.prisma`. Prisma generates a fully-typed client from it
(`@prisma/client`), so there is no need to hand-write ORM model classes.

This folder holds model-adjacent code that isn't part of the schema
itself:

- `user.mapper.js` (Backend Stage 2) — `toPublicUser` / `toPublicAgent`.
  Every place that sends a User or Agent back to the client goes through
  these so `passwordHash` (and any future sensitive column) can never
  leak, even by accident.
- `course.mapper.js` (Backend Stage 3) — `toCourseListItem` /
  `toCourseDetail` / `toPublicCategory` / `toPublicOrder` / `toAdminOrder`
  / `toPublicReview`. Converts Prisma `Decimal` price fields to plain
  numbers and keeps relation objects trimmed to what the client actually
  needs.

Do not put database queries here — those belong in `src/services/`.
