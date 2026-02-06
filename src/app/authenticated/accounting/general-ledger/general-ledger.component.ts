import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';

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
    this.officeService.getOffices().subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = offices;
        // After offices load, set selectedOfficeId from officeId input if provided
        if (this.officeId !== null) {
          this.selectedOfficeId = this.officeId;
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
