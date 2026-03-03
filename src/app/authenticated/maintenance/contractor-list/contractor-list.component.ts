import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ContractorDisplayList, ContractorResponse } from '../models/contractor.model';
import { ContractorService } from '../services/contractor.service';

@Component({
  selector: 'app-contractor-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './contractor-list.component.html',
  styleUrl: './contractor-list.component.scss'
})

export class ContractorListComponent implements OnInit {
  @Input() propertyId: string | null = null;
  @Output() deleteContractorEvent = new EventEmitter<string>();

  contractors: ContractorResponse[] = [];
  allContractors: ContractorDisplayList[] = [];
  contractorsDisplay: ContractorDisplayList[] = [];
  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;

  contractorDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    contractorCode: { displayAs: 'Code', wrap: false, maxWidth: '20ch' },
    name: { displayAs: 'Name', wrap: false, maxWidth: '25ch' },
    phone: { displayAs: 'Phone', wrap: false, maxWidth: '25ch' },
    ratingStars: { displayAs: 'Rating', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, maxWidth: '20ch', alignment: 'left' }
  };

  constructor(
    private contractorService: ContractorService,
    private router: Router,
    private mappingService: MappingService
  ) {}

  //#region Contractor-List
  ngOnInit(): void {
    this.getContractors();
  }

  getContractors(): void {
    this.isServiceError = false;
    this.isLoading = true;
    this.contractorService.getContractors().pipe(take(1),finalize(() => { this.isLoading = false; })).subscribe({
      next: (contractors: ContractorResponse[]) => {
        this.contractors = contractors || [];
        this.allContractors = this.mappingService.mapContractors(this.contractors);
        this.applyFilters();
      },
      error: () => {
        this.contractors = [];
        this.allContractors = [];
        this.contractorsDisplay = [];
        this.isServiceError = true;
      }
    });
  }

  addContractor(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.MaintenanceContractor, ['new']);
    this.router.navigate(['/' + url], { queryParams: { propertyId: this.propertyId } });
  }

  deleteContractor(event: ContractorDisplayList): void {
    this.contractorService.deleteContractor(event.contractorId).pipe(take(1)).subscribe({
      next: () => {
        this.contractors = this.contractors.filter(contractor => contractor.contractorId !== event.contractorId);
        this.allContractors = this.mappingService.mapContractors(this.contractors);
        this.applyFilters();
        this.deleteContractorEvent.emit(event.contractorId);
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  goToContractor(event: ContractorDisplayList): void {
    const url = RouterUrl.replaceTokens(RouterUrl.MaintenanceContractor, [event.contractorId]);
    this.router.navigate(['/' + url], { queryParams: { propertyId: this.propertyId } });
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.contractorsDisplay = this.showInactive
      ? [...this.allContractors]
      : this.allContractors.filter(contractor => contractor.isActive);
  }
  //#endregion
}
