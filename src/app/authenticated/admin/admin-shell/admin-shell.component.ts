import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { DocumentHealthComponent } from '../../logs/document-health/document-health.component';
import { AdminTasksComponent } from '../admin-tasks/admin-tasks.component';

@Component({
  standalone: true,
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  imports: [CommonModule, MaterialModule, TitleBarSelectComponent, AdminTasksComponent, DocumentHealthComponent]
})
export class AdminShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private destroy$ = new Subject<void>();

  organizationId = '';
  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;
  selectedOfficeId: number | null = null;
  selectedTabIndex = 0;

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices
    });
    this.loadOffices();
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
  }

  loadOffices(): void {
    if (!this.organizationId) {
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.showOfficeDropdown = this.offices.length > 1;
          this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
            topBarPinned: false,
            pageOfficeId: this.selectedOfficeId,
            offices: this.offices
          });
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.selectedOfficeId = null;
      }
    });
  }

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.selectedOfficeId = officeId;
    if (officeId != null && this.offices.length > 0 && !this.offices.some(office => office.officeId === officeId)) {
      this.selectedOfficeId = null;
    } else if (this.offices.length === 1) {
      this.selectedOfficeId = this.offices[0].officeId;
    }
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    this.showOfficeDropdown = this.offices.length > 1;
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
