import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { CheckTabDetailsComponent } from '../check-tab-details/check-tab-details.component';
import { CheckTabPreviewComponent } from '../check-tab-preview/check-tab-preview.component';
import { CheckTabHistoryComponent } from '../check-tab-history/check-tab-history.component';
import { CheckTabNotesComponent } from '../check-tab-notes/check-tab-notes.component';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { OutstandingCheckService } from '../services/outstanding-check.service';
import { AgencyService } from '../../agency/services/agency.service';
import { finalize, take } from 'rxjs';
import { OutstandingCheckResponse } from '../models/outstanding-check.model';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AgencyResponse } from '../../agency/models/agency.model';

@Component({
  selector: 'app-outstanding-check',
  standalone: true,
  imports: [CommonModule, MaterialModule, CheckTabDetailsComponent, CheckTabPreviewComponent, CheckTabHistoryComponent, CheckTabNotesComponent],
  templateUrl: './outstanding-check.component.html',
  styleUrl: './outstanding-check.component.scss'
})

export class OutstandingCheckComponent implements OnInit {
  isServiceError: boolean = false;
  itemsToLoad: string[] = [];
  outstandingCheckId: string = '';
  outstandingCheck: OutstandingCheckResponse;
  agency: AgencyResponse;

  constructor(
    public route: ActivatedRoute,
    public router: Router,
    public toastr: ToastrService,
    public outstandingCheckService: OutstandingCheckService,
    public agencyService: AgencyService) {
    this.itemsToLoad.push('agency');
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('checkid')) {
        this.outstandingCheckId = paramMap.get('checkid');
        this.getOutstandingCheck();
      }
    });
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.OutstandingCheckList);
  }

  getOutstandingCheck(): void {
    this.outstandingCheckService.getOutstandingCheckByGuid(this.outstandingCheckId).pipe(take(1), finalize(() => { this.getAgency(this.outstandingCheck.agencyId) })).subscribe({
      next: (response: OutstandingCheckResponse) => {
        this.outstandingCheck = response;
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Check', CommonMessage.ServiceError);
        }
      }
    });
  }

  getAgency(agencyId: string): void {
    this.agencyService.getAgencyByGuid(agencyId).pipe(take(1), finalize(() => { this.removeLoadItem('agency') })).subscribe({
      next: (response: AgencyResponse) => {
        this.agency = response;
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Agencies', CommonMessage.ServiceError);
        }
      }
    });
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}
