import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, filter, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';

@Component({
  selector: 'app-general-ledger',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
  templateUrl: './general-ledger.component.html',
  styleUrls: ['./general-ledger.component.scss']
})
export class GeneralLedgerComponent implements OnInit, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  
  selectedOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  showInactive: boolean = false;
  showOfficeDropdown: boolean = true;

  constructor(
    private officeService: OfficeService,
    private mappingService: MappingService
  ) {}

  //#region General-Ledger
  ngOnInit(): void {
    this.loadOffices();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.selectedOfficeId = this.officeId;
      }
    });
  }

  onAdd(): void {
  }
  //#endregion

  //#region Form Response methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.selectedOfficeId = newOfficeId;
        }
      }
    }
  }
   
  onOfficeChange(): void {
    this.officeIdChange.emit(this.selectedOfficeId);
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: (allOffices: OfficeResponse[]) => {
          this.offices = allOffices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          
          if (this.officeId !== null && this.officeId !== undefined) {
            this.selectedOfficeId = this.officeId;
          }
          
          if (this.offices.length === 1 && (this.officeId === null || this.officeId === undefined)) {
            this.selectedOfficeId = this.offices[0].officeId;
            this.showOfficeDropdown = false;
          } else {
            this.showOfficeDropdown = true;
          }
        },
        error: () => {
          this.offices = [];
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
