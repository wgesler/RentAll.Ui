import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { PropertyWelcomeLetterComponent } from '../../properties/property-welcome/property-welcome-letter.component';
import { withMobileEmailCreateRoute } from './mobile-property-letter-email';

@Component({
  standalone: true,
  selector: 'app-mobile-property-welcome-letter',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mobile-property-welcome-letter.component.html',
  styleUrl: './mobile-property-letter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobilePropertyWelcomeLetterComponent extends PropertyWelcomeLetterComponent implements OnInit {
  @Input() override propertyId: string = '';
  private mobileRouter = inject(Router);

  override ngOnInit(): void {
    this.hideOfficePropertyReservation = true;
    this.showReservationOnly = true;
    super.ngOnInit();
  }

  override async onEmail(): Promise<void> {
    await withMobileEmailCreateRoute(this.mobileRouter, () => super.onEmail());
  }
}
