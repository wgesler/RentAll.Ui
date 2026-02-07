import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';
import { filter, take, Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { ActivatedRoute } from '@angular/router';

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
    private mappingService: MappingService,
    private route: ActivatedRoute
  ) {}

  //#region General-Ledger
  ngOnInit(): void {
    this.loadOffices();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.selectedOfficeId = this.officeId;
      }
      
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.selectedOfficeId = parsedOfficeId;
            this.officeIdChange.emit(this.selectedOfficeId);
          }
        } else {
          if (this.officeId === null || this.officeId === undefined) {
            this.selectedOfficeId = null;
          }
        }
      });
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
