import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MaterialModule } from '../../../../material.module';

@Component({
  selector: 'app-pre-billing-report',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './pre-billing-report.component.html',
  styleUrl: './pre-billing-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreBillingReportComponent {
  @Input() officeId: number | null = null;
  @Input() organizationId: string | null = null;
  @Input() invoiceSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
}
