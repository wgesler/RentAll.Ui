import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { AgencyResponse, AgencyListDisplay } from '../models/agency.model';
import { AgencyService } from '../services/agency.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-agency-list',
  templateUrl: './agency-list.component.html',
  styleUrls: ['./agency-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class AgencyListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;

  agenciesDisplayedColumns: ColumnSet = {
    'name': { displayAs: 'Name' },
    'state': { displayAs: 'State' },
    'regId': { displayAs: 'RegId' },
    'branch': { displayAs: 'Branch' },
    'parentCompany': { displayAs: 'Parent Company' }
  };
  agenciesDisplay: AgencyListDisplay[] = [];

  constructor(
    public agencyService: AgencyService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('agencies');
  }

  ngOnInit(): void {
    this.getAgencies();
  }

  goToAgency(event: AgencyListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Agency, [event.agencyId]));
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  private getAgencies(): void {
    this.agencyService.getAgencies().pipe(take(1), finalize(() => { this.removeLoadItem('agencies') })).subscribe({
      next: (response: AgencyResponse[]) => {
        this.agenciesDisplay = this.mappingService.mapAgencies(response);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Agencies', CommonMessage.ServiceError);
        }
      }
    });
  }
}
