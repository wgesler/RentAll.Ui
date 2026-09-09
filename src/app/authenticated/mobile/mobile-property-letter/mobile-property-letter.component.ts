import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MobilePropertyDepartureLetterComponent } from './mobile-property-departure-letter.component';
import { MobilePropertyWelcomeLetterComponent } from './mobile-property-welcome-letter.component';

@Component({
  standalone: true,
  selector: 'app-mobile-property-letter',
  imports: [MobilePropertyWelcomeLetterComponent, MobilePropertyDepartureLetterComponent],
  templateUrl: './mobile-property-letter.component.html',
  styleUrl: './mobile-property-letter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobilePropertyLetterComponent {
  @Input() propertyId = '';
  @Input() letterPath = 'welcome-letter';
}
