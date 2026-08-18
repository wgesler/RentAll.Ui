import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { OrganizationService } from '../../../organizations/services/organization.service';
import { emptyUserGuide, USER_GUIDE_WELCOME_URL, UserGuideResponse } from '../../../organizations/models/user-guide.model';
import { UserGroups } from '../../../users/models/user-enums';
import { getUserGuideNavItems, NavItemDefinition } from '../../access/role-access';

export interface HelpGuideDialogData {
  topicUrl?: string;
}

interface HelpTocItem {
  url: string;
  displayName: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'app-help-guide-dialog',
  imports: [MaterialModule],
  templateUrl: './help-guide-dialog.component.html',
  styleUrl: './help-guide-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpGuideDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject<MatDialogRef<HelpGuideDialogComponent>>(MatDialogRef);
  private data = inject<HelpGuideDialogData>(MAT_DIALOG_DATA, { optional: true });
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('pageEditor') set pageEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.pageEditor = value;
    this.syncPageEditor();
  }

  pageEditor?: ElementRef<HTMLDivElement>;
  tocItems: HelpTocItem[] = [];
  selectedUrl = USER_GUIDE_WELCOME_URL;
  selectedTitle = 'Welcome';
  userGuide: UserGuideResponse = emptyUserGuide();
  canEdit = false;
  isEditing = false;
  isSaving = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['userGuide']));
  isPageReady = false;
  destroy$ = new Subject<void>();

  //#region Help Guide
  ngOnInit(): void {
    this.canEdit = this.authService.hasRole(UserGroups.SuperAdmin);
    this.tocItems = this.buildTocItems();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadUserGuide();
  }

  loadUserGuide(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'userGuide');
    this.organizationService.getUserGuide().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'userGuide'); })).subscribe({
      next: userGuide => {
        this.userGuide = userGuide || emptyUserGuide();
        this.selectTopic(this.data?.topicUrl || USER_GUIDE_WELCOME_URL);
      },
      error: () => {
        this.userGuide = emptyUserGuide();
        this.selectTopic(this.data?.topicUrl || USER_GUIDE_WELCOME_URL);
      }
    });
  }

  selectTopic(url: string): void {
    this.captureEditorHtml();
    const resolvedUrl = url === 'dashboard-staff' || url === 'dashboard-owner' ? 'dashboard' : url;
    const match = this.tocItems.find(item => item.url === resolvedUrl);
    this.selectedUrl = match ? match.url : USER_GUIDE_WELCOME_URL;
    this.selectedTitle = match?.displayName || 'Welcome';
    this.syncPageEditor();
    this.markViewForCheck();
  }

  getArticleHtml(): string {
    return this.mappingService.getUserGuidePageHtml(this.userGuide, this.selectedUrl);
  }

  startEdit(): void {
    if (!this.canEdit) {
      return;
    }
    this.isEditing = true;
    this.markViewForCheck();
  }

  saveUserGuide(): void {
    if (!this.canEdit || !this.isEditing || this.isSaving) {
      return;
    }
    this.captureEditorHtml();
    this.isSaving = true;
    this.organizationService.updateUserGuide(this.userGuide).pipe(take(1), finalize(() => { this.isSaving = false; this.markViewForCheck(); })).subscribe({
      next: userGuide => {
        this.userGuide = userGuide;
        this.isEditing = false;
        this.toastr.success('User guide saved');
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to save user guide');
      }
    });
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
  //#endregion

  //#region Build Form
  onPageEditorInput(event: Event): void {
    const element = event.target as HTMLDivElement;
    this.userGuide = this.mappingService.setUserGuidePageHtml(this.userGuide, this.selectedUrl, element.innerHTML);
  }

  applyPageFormat(format: 'bold' | 'italic' | 'underline' | 'paragraph' | 'unorderedList'): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    editor.focus();
    if (format === 'paragraph') {
      const inserted = this.execEditorCommand('insertParagraph', false);
      if (!inserted) {
        this.execEditorCommand('insertHTML', false, '<p><br></p>');
      }
      this.userGuide = this.mappingService.setUserGuidePageHtml(this.userGuide, this.selectedUrl, editor.innerHTML);
      return;
    }
    if (format === 'unorderedList') {
      this.applyUnorderedListCommand(editor);
      this.userGuide = this.mappingService.setUserGuidePageHtml(this.userGuide, this.selectedUrl, editor.innerHTML);
      return;
    }
    this.execEditorCommand(format, false);
    this.userGuide = this.mappingService.setUserGuidePageHtml(this.userGuide, this.selectedUrl, editor.innerHTML);
  }

  preventEditorToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  applyUnorderedListCommand(editor: HTMLDivElement): void {
    editor.focus();
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const listItems = selectedText.split(/\r?\n+/).map(item => item.trim()).filter(item => !!item);
    if (listItems.length > 0) {
      const listHtml = `<ul>${listItems.map(item => `<li>${this.escapeEditorHtml(item)}</li>`).join('')}</ul>`;
      this.execEditorCommand('insertHTML', false, listHtml);
      return;
    }
    if (!selection || selection.rangeCount === 0) {
      this.execEditorCommand('insertHTML', false, '<ul><li><br></li></ul>');
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }
    this.execEditorCommand('insertHTML', false, '<ul><li><br></li></ul>');
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  buildTocItems(): HelpTocItem[] {
    const navItems: NavItemDefinition[] = getUserGuideNavItems(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    return [
      { url: USER_GUIDE_WELCOME_URL, displayName: 'Welcome', icon: 'menu_book' },
      ...navItems.map(item => ({ url: item.url, displayName: item.displayName, icon: item.icon }))
    ];
  }

  syncPageEditor(): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    const nextHtml = this.getArticleHtml();
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }

  captureEditorHtml(): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    this.userGuide = this.mappingService.setUserGuidePageHtml(this.userGuide, this.selectedUrl, editor.innerHTML);
  }

  execEditorCommand(commandId: string, showUi = false, value?: string): boolean {
    return (document as unknown as { execCommand(commandId: string, showUI?: boolean, value?: string): boolean }).execCommand(commandId, showUi, value);
  }

  escapeEditorHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
