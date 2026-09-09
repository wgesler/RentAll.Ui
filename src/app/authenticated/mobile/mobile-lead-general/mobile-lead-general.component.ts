import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { GeneralComponent } from '../../leads/general/general.component';

@Component({
  standalone: true,
  selector: 'app-mobile-lead-general',
  templateUrl: './mobile-lead-general.component.html',
  styleUrls: ['../mobile-lead-form.scss'],
  imports: [CommonModule, MaterialModule, ReactiveFormsModule]
})
export class MobileLeadGeneralComponent extends GeneralComponent {}
