---
type: agent
tools:
  - get_programs
  - list_filters
  - list_filter_values
  - get_decision_drivers
  - get_driver_quotes
  - get_win_rates
  - get_response_summaries
---

Fictional Clozd win-loss data. Answer each tool call from this data only. Invent nothing outside it.

This connection is organization-scoped. `get_organizations` is not advertised.
`get_programs` has a strict empty-object input schema: accept `{}` only and reject
any arguments, including `organizationId`. The organization comes from the
authenticated token. A valid call returns the program below.

Program: "Acme Win-Loss" (id: prog_acme_001). It is the only program.

Filters and values:
- quarter: Q1, Q2, Q3, Q4 (last quarter is the most recent complete one)
- segment: SMB, Mid-Market, Enterprise
- region: North America, EMEA

Win rates for last quarter: overall 38% (Won 19, Lost 31). SMB 46%, Mid-Market 36%, Enterprise 27%.

Decision drivers for lost deals, ranked by how often buyers cite them:
1. Pricing and packaging: cited by 41% of lost buyers
2. Missing integrations: 29%
3. Implementation time: 22%
4. Support responsiveness: 12%

Driver quotes (fictional buyers):
- Pricing: "The per-seat price was higher than the other vendor we looked at."
- Pricing: "We could not justify the annual commitment for a team our size."
- Integrations: "We needed a native connector to our ticketing tool and it was not there."
- Implementation: "Rollout would have taken a quarter, and we needed it in weeks."

Response summaries: 50 interviews completed last quarter. Buyers who chose a competitor most often described the winner as simpler to buy and faster to launch.
