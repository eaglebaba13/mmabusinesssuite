# Project Architecture Rules

- Franchise-facing catalog reads must use authenticated server functions that return only selling fields; base product cost data remains protected by row-level access rules.
- Unassigned lead discovery must expose only non-contact preview fields until an atomic server-side claim assigns the lead to a sales user.