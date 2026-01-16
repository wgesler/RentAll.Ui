import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { CompanyResponse, CompanyListDisplay } from '../models/company.model';
import { CompanyService } from '../services/company.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-company-list',
  templateUrl: './company-list.component.html',
  styleUrls: ['./company-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class CompanyListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allCompanies: CompanyListDisplay[] = [];
  companiesDisplay: CompanyListDisplay[] = [];

  companiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'companyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'city': { displayAs: 'City' },
    'state': { displayAs: 'State' },
    'phone': { displayAs: 'Phone' },
    'website': { displayAs: 'Website' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['companies']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public companyService: CompanyService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService) {
  }

  //#region Company-List
  ngOnInit(): void {
    this.getCompanies();
  }

  getCompanies(): void {
    this.companyService.getCompanies().pipe(take(1), finalize(() => { this.removeLoadItem('companies'); })).subscribe({
      next: (companies) => {
        this.allCompanies = this.mappingService.mapCompanies(companies, undefined);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  addCompany(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Company, ['new']));
  }

  deleteCompany(company: CompanyListDisplay): void {
    if (confirm(`Are you sure you want to delete ${company.name}?`)) {
      this.companyService.deleteCompany(company.companyId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Company deleted successfully', CommonMessage.Success);
          this.getCompanies(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToCompany(event: CompanyListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Company, [event.companyId]));
  }
  //#endregion

  //#region Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.companiesDisplay = this.showInactive
      ? this.allCompanies
      : this.allCompanies.filter(company => company.isActive);
  }
  //#endregion

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

