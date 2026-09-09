import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { PartnerComponent } from '../../leads/partner/partner.component';

@Component({
  standalone: true,
  selector: 'app-mobile-lead-partner',
  templateUrl: './mobile-lead-partner.component.html',
  styleUrls: ['../mobile-lead-form.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class MobileLeadPartnerComponent extends PartnerComponent {}
