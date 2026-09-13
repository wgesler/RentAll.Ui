import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MaterialModule } from '../../../material.module';

@Component({
  standalone: true,
  selector: 'app-receipt-reading-overlay',
  imports: [MaterialModule],
  templateUrl: './receipt-reading-overlay.component.html',
  styleUrl: './receipt-reading-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptReadingOverlayComponent {
  @Input() label = 'Reading receipt...';
}
