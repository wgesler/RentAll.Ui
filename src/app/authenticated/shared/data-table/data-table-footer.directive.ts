import { Directive } from '@angular/core';

/**
 * Marks projected content for app-data-table so it renders directly below the table
 * and above the paginator.
 */
@Directive({
  selector: '[dataTableFooter]',
  standalone: true,
})
export class DataTableFooterDirective {}
