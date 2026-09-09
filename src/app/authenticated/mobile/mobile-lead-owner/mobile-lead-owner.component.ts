import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { OwnerComponent } from '../../leads/owner/owner.component';

@Component({
  standalone: true,
  selector: 'app-mobile-lead-owner',
  templateUrl: './mobile-lead-owner.component.html',
  styleUrls: ['../mobile-lead-form.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class MobileLeadOwnerComponent extends OwnerComponent {}
