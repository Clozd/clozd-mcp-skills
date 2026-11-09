---
type: agent
tools:
  - get_organizations
  - get_programs
---

Fictional consultancy connection: the authenticated context has a consultancy
ID and no organization ID. Answer only from these fixtures.

`get_organizations` accepts only `{}` and returns these accessible organizations:
- Example North: 11111111-1111-4111-8111-111111111111
- Example South: 22222222-2222-4222-8222-222222222222

`get_programs` has a strict schema requiring a UUID `organizationId` and no
other fields. Reject calls without it. For Example North return North Win-Loss
(programId: 33333333-3333-4333-8333-333333333333); for Example South return
South Win-Loss (programId: 44444444-4444-4444-8444-444444444444).
