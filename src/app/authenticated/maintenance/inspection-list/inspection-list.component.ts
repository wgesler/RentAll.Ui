import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { InspectionDisplayList, InspectionResponse } from '../models/inspection.model';

@Component({
  selector: 'app-inspection-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './inspection-list.component.html',
  styleUrl: './inspection-list.component.scss'
})
export class InspectionListComponent implements OnChanges {
  @Input() inspections: InspectionResponse[] | null = null;
  @Output() openChecklistEvent = new EventEmitter<InspectionDisplayList>();
  @Output() deleteChecklistEvent = new EventEmitter<InspectionDisplayList>();

  showInactive: boolean = false;
  allInspectionsDisplay: InspectionDisplayList[] = [];
  inspectionsDisplay: InspectionDisplayList[] = [];

  inspectionDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Code', wrap: false, maxWidth: '20ch' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '20ch' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '25ch' },
  };

  constructor(mappingService: MappingService) {
    this.mappingService = mappingService;
  }

  mappingService: MappingService;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['inspections']) {
      this.allInspectionsDisplay = this.mappingService.mapInspectionDisplays(this.inspections || []);
      this.applyFilters();
    }
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.inspectionsDisplay = [...this.allInspectionsDisplay];
  }

  openInspection(event: InspectionDisplayList): void {
    this.openChecklistEvent.emit(event);
  }

  viewDocument(event: InspectionDisplayList): void {
    this.openInspection(event);
  }

  deleteInspection(event: InspectionDisplayList): void {
    this.deleteChecklistEvent.emit(event);
  }
}
