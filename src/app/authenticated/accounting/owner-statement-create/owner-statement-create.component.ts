import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { UtilityService } from '../../../services/utility.service';

@Component({
  selector: 'app-owner-statement-create',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './owner-statement-create.component.html',
  styleUrl: './owner-statement-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementCreateComponent implements OnInit, OnDestroy {
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatementCreate']));
  destroy$ = new Subject<void>();

  constructor(private utilityService: UtilityService, private cdr: ChangeDetectorRef) {}

  //#region Owner-Statement-Create
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOwnerStatementCreate();
  }
  //#endregion

  //#region Data Loading Methods
  loadOwnerStatementCreate(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementCreate');
    this.markViewForCheck();
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
