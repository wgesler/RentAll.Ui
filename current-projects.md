# Current projects

Handoff notes for **RentAll.Ui**. If you are a new agent: **read the files listed below**—this page only states intent and contracts; it is not a substitute for the source.

---

## Read these files first

Open the actual code (and templates/styles where relevant). Do not infer behavior only from this document.

| Topic | Paths |
|--------|--------|
| Mixed types | `src/app/authenticated/shared/models/mixed-models.ts` |
| Cross-domain mapping | `src/app/services/mixed-mapping.service.ts` |
| Shared dashboard data pipeline | `src/app/authenticated/shared/base-classes/property-maintenance.base.ts` |
| Staff dashboard (extends base) | `src/app/authenticated/dashboards/dashboard-staff/dashboard-staff.component.ts`, `.html`, `.scss` |
| Company dashboard shell (title bar + tabs) | `src/app/authenticated/dashboards/dashboard-shell/dashboard-shell.component.ts`, `.html`, `.scss` |
| Company dashboard data (extends base) | `src/app/authenticated/dashboards/dashboard-company-data/dashboard-company-data.component.ts` |
| Project rules for agents | `.cursor/rules/*.mdc` |
| Editor defaults | `.editorconfig` |

---

## Mixed models and `MixedMappingService` (contract)

- **Types** live in **`mixed-models.ts`**. **Cross-domain mapping** (property + maintenance + reservation shapes, maintenance list rows, staff-dashboard schedule rows, etc.) lives in **`MixedMappingService`**, with **`MappingService`**, **`FormatterService`**, and **`UtilityService`** used where appropriate—not reimplemented in components.

**After mapping, trust the rows:**

1. **`propertyId` is always set** on these list objects (from the property or reservation side). Do not treat it as nullable in consumer logic.
2. **Assignee-style user ids on the row are already normalized** at map time. Consumers should compare/filter on those fields as stored (`null` = unassigned), not re-normalize repeatedly.
3. **Dates**: use **ordinals** for windowing/sorting/comparison and **display fields** for UI where the mapper provides them; avoid re-parsing the same values all over the stack.
4. **Maintenance** may be missing as **input** for a property; that does not mean the **output** row lacks **`propertyId`**.
5. **Legitimate null/edge handling** remains at real boundaries: raw API payloads before mapping, caller/session filters (e.g. a `userId` passed into recompute), unmigrated code paths.

---

## `PropertyMaintenanceBase` and who inherits it

- **`PropertyMaintenanceBase`** is an **`@Directive()`** base class: shared loads (offices, active reservations, property + maintenance → mixed lists), **`recomputeDashboardData`**, fifteen-day ordinal windowing, derived slices (offline/online, arrivals/departures, cleanings path), today/tomorrow counts. Subclasses own a concrete **`itemsToLoad$`** initial `Set`; base loaders **`removeLoadItemFromSet`** in **`finalize`** for their keys. Override **`onAfterRecomputeDashboardData`** for UI-specific follow-up after recompute.

- **`DashboardCompanyDataComponent`** and **`DashboardStaffComponent`** (and related) extend **`PropertyMaintenanceBase`** (verify with repo search). The company dashboard data component loads/recomputes/publishes; panel components display from `DashboardCompanyDataService`.

- **`DashboardShellComponent`** owns the company dashboard title bar and tabs; it reads KPIs from `DashboardCompanyDataService`.

If another screen needs the **same** reservation + property + maintenance pipeline, **extend the base or move shared logic into it** instead of copying loaders.

---

## Coding preferences

Angular/UI conventions, tabs/shells, RxJS style, regions, formatter/mapping ownership, debug layout bands, etc. are defined in **`.cursor/rules/*.mdc`** (always applied in this workspace). **`.editorconfig`** covers basic formatting. **Read those**; this file does not restate every rule.

---

## Where this file lives

**`RentAll.Ui/current-projects.md`** (e.g. `c:\Source\RentAll\RentAll.Ui\current-projects.md`).
