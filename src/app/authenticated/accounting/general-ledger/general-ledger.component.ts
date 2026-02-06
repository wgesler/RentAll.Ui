import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';

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
  showInactive: boolean = false;
  showOfficeDropdown: boolean = true;

  constructor(
    private officeService: OfficeService
  ) {}

  ngOnInit(): void {
    this.loadOffices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Update if the value changed (including initial load when previousOfficeId is undefined)
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.selectedOfficeId = newOfficeId;
      }
    }
  }

  loadOffices(): void {
    this.officeService.getAllOffices().subscribe({
      next: (allOffices: OfficeResponse[]) => {
        // API already filters offices by user access
        this.offices = allOffices || [];
        
        // After offices load, set selectedOfficeId from officeId input if provided
        if (this.officeId !== null) {
          this.selectedOfficeId = this.officeId;
        }
        
        // Auto-select if only one office available (unless officeId input is provided)
        if (this.offices.length === 1 && this.officeId === null) {
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
  }

  onOfficeChange(): void {
    // Emit office change to parent
    this.officeIdChange.emit(this.selectedOfficeId);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    // Handle inactive toggle if needed
  }

  onAdd(): void {
    // Handle add action if needed
  }
}
