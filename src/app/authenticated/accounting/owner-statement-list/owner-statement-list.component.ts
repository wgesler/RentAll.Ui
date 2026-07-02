import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { UtilityService } from '../../../services/utility.service';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './owner-statement-list.component.html',
  styleUrl: './owner-statement-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnDestroy {
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatementList']));
  destroy$ = new Subject<void>();

  constructor(private utilityService: UtilityService, private cdr: ChangeDetectorRef) {}

  //#region Owner-Statement-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOwnerStatementList();
  }
  //#endregion

  //#region Data Loading Methods
  loadOwnerStatementList(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementList');
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
