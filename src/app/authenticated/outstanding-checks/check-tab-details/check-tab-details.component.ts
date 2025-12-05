import { Component, Input, OnInit } from '@angular/core';
import { OutstandingCheckResponse } from '../models/outstanding-check.model';
import { AgencyResponse } from '../../agency/models/agency.model';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { ReplacePipe } from '../../shared/pipes/replace';
import { OutstandingCheckService } from '../services/outstanding-check.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-check-tab-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, ReplacePipe],
  templateUrl: './check-tab-details.component.html',
  styleUrl: './check-tab-details.component.scss'
})

export class CheckTabDetailsComponent implements OnInit {
  @Input() outstandingCheck: OutstandingCheckResponse;
  @Input() agency: AgencyResponse;
  form: FormGroup;
  todayDate: Date = new Date();

  constructor(
    private outstandingCheckService: OutstandingCheckService,
    private toastr: ToastrService) {
    }

  ngOnInit(): void {
    this.buildForm();
  }
  
  buildForm(): void {
    const stringDate = this.outstandingCheck.lastContact || this.outstandingCheck.checkDate;
    // localize dates correctly
    const date = new Date(stringDate.substring(0, stringDate.indexOf('Z')));
    this.form = new FormGroup({
      lastContact: new FormControl(date, [Validators.required])
    });
  }

  save(): void {
    if  (this.form.invalid)
      return;

    const date = new Date(this.form.get('lastContact').value);
    this.outstandingCheckService.updateOustandingCheck(this.outstandingCheck.outstandingCheckId, {lastContact: date}).subscribe({
      next: (result) => {
        if (result) {
          this.form.markAsPristine();
          this.toastr.success('Successfully updated last contact date.');
          return;
        }
        this.toastr.error('Could not update last contact date.');
      },
      error: () => {
        this.toastr.error('Could not update last contact date.');
      }
    });
  }
}
