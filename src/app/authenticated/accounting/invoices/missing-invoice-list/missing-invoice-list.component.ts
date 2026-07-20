import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MaterialModule } from '../../../../material.module';

@Component({
  selector: 'app-missing-invoice-list',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './missing-invoice-list.component.html',
  styleUrl: './missing-invoice-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MissingInvoiceListComponent {
  @Input() officeId: number | null = null;
  @Input() organizationId: string | null = null;
  @Input() invoiceSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
}
