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
| Service staff dashboard (extends base) | `src/app/authenticated/dashboards/dashboard-service/dashboard-service.component.ts`, `.html`, `.scss` |
| Main / agent dashboard (does **not** extend base) | `src/app/authenticated/dashboards/dashboard-main/dashboard-main.component.ts`, `.html`, `.scss` |
| Maintenance grid (does **not** extend base) | `src/app/authenticated/maintenance/maintenance-list/maintenance-list.component.ts`, `.html`, `.scss` |
| Project rules for agents | `.cursor/rules/*.mdc` |
| Editor defaults | `.editorconfig` |

---

## Mixed models and `MixedMappingService` (contract)

- **Types** live in **`mixed-models.ts`**. **Cross-domain mapping** (property + maintenance + reservation shapes, maintenance list rows, service-dashboard schedule rows, etc.) lives in **`MixedMappingService`**, with **`MappingService`**, **`FormatterService`**, and **`UtilityService`** used where appropriate—not reimplemented in components.

**After mapping, trust the rows:**

1. **`propertyId` is always set** on these list objects (from the property or reservation side). Do not treat it as nullable in consumer logic.
2. **Assignee-style user ids on the row are already normalized** at map time. Consumers should compare/filter on those fields as stored (`null` = unassigned), not re-normalize repeatedly.
3. **Dates**: use **ordinals** for windowing/sorting/comparison and **display fields** for UI where the mapper provides them; avoid re-parsing the same values all over the stack.
4. **Maintenance** may be missing as **input** for a property; that does not mean the **output** row lacks **`propertyId`**.
5. **Legitimate null/edge handling** remains at real boundaries: raw API payloads before mapping, caller/session filters (e.g. a `userId` passed into recompute), unmigrated code paths.

---

## `PropertyMaintenanceBase` and who inherits it

- **`PropertyMaintenanceBase`** is an **`@Directive()`** base class: shared loads (offices, active reservations, property + maintenance → mixed lists), **`recomputeDashboardData`**, fifteen-day ordinal windowing, derived slices (offline/online, arrivals/departures, cleanings path), today/tomorrow counts. Subclasses own a concrete **`itemsToLoad$`** initial `Set`; base loaders **`removeLoadItemFromSet`** in **`finalize`** for their keys. Override **`onAfterRecomputeDashboardData`** for UI-specific follow-up after recompute.

- **`DashboardServiceComponent`** is currently the **only** `extends PropertyMaintenanceBase` usage (verify with repo search). It passes services through **`super(...)`**, adds **`UserService`**, overrides **`ngOnInit`** / **`ngOnDestroy`** (child work first, then **`super`**), and supplies **`itemsToLoad$`** keys such as **`currentUser`** plus the base keys.

- **`DashboardMainComponent`** and **`MaintenanceListComponent`** are **separate** features: they **do not** extend **`PropertyMaintenanceBase`** today. They still use **`mixed-models`** / **`MixedMappingService`** where their screens need joined data—**read those components** for exact flows.

If another screen needs the **same** reservation + property + maintenance pipeline as the service dashboard, **extend the base or move shared logic into it** instead of copying loaders.

---

## Coding preferences

Angular/UI conventions, tabs/shells, RxJS style, regions, formatter/mapping ownership, debug layout bands, etc. are defined in **`.cursor/rules/*.mdc`** (always applied in this workspace). **`.editorconfig`** covers basic formatting. **Read those**; this file does not restate every rule.

---

## Where this file lives

**`RentAll.Ui/current-projects.md`** (e.g. `c:\Source\RentAll\RentAll.Ui\current-projects.md`).
