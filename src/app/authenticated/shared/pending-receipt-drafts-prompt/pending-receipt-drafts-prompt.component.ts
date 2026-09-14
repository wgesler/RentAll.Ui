import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
import { MaterialModule } from '../../../material.module';

@Component({
  standalone: true,
  selector: 'app-pending-receipt-drafts-prompt',
  imports: [MaterialModule],
  templateUrl: './pending-receipt-drafts-prompt.component.html',
  styleUrl: './pending-receipt-drafts-prompt.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PendingReceiptDraftsPromptComponent {
  @Output() confirmed = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();
}
