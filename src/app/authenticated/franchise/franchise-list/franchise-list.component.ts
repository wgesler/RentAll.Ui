import { OnInit, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { FranchiseResponse, FranchiseListDisplay } from '../models/franchise.model';
import { FranchiseService } from '../services/franchise.service';
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
  selector: 'app-franchise-list',
  templateUrl: './franchise-list.component.html',
  styleUrls: ['./franchise-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class FranchiseListComponent implements OnInit {
  @Input() embeddedInSettings: boolean = false;
  @Output() franchiseSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  franchisesDisplayedColumns: ColumnSet = {
    'franchiseCode': { displayAs: 'Franchise Code', maxWidth: '30ch' },
    'description': { displayAs: 'Description', maxWidth: '40ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allFranchises: FranchiseListDisplay[] = [];
  franchisesDisplay: FranchiseListDisplay[] = [];

  constructor(
    public franchiseService: FranchiseService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('franchises');
  }

  ngOnInit(): void {
    this.getFranchises();
  }

  addFranchise(): void {
    if (this.embeddedInSettings) {
      this.franchiseSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Franchise, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getFranchises(): void {
    this.franchiseService.getFranchises().pipe(take(1), finalize(() => { this.removeLoadItem('franchises') })).subscribe({
      next: (response: FranchiseResponse[]) => {
        this.allFranchises = this.mappingService.mapFranchises(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Franchises', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteFranchise(franchise: FranchiseListDisplay): void {
    if (confirm(`Are you sure you want to delete ${franchise.franchiseCode}?`)) {
      this.franchiseService.deleteFranchise(franchise.franchiseId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Franchise deleted successfully', CommonMessage.Success);
          this.getFranchises();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete franchise. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete franchise', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToFranchise(event: FranchiseListDisplay): void {
    if (this.embeddedInSettings) {
      this.franchiseSelected.emit(event.franchiseId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Franchise, [event.franchiseId.toString()]);
      this.router.navigateByUrl(url);
    }
  }

  // Filter methods
  applyFilters(): void {
    this.franchisesDisplay = this.showInactive
      ? this.allFranchises
      : this.allFranchises.filter(franchise => franchise.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  // Utility Methods
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

