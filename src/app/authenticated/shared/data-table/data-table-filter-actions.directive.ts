import { Directive } from '@angular/core';

/**
 * Marks projected content for app-data-table so it renders inside the purple filter band
 * (alongside the filter field), not as an absolutely positioned sibling.
 */
@Directive({
  selector: '[dataTableFilterActions]',
  standalone: true,
})
export class DataTableFilterActionsDirective {}
