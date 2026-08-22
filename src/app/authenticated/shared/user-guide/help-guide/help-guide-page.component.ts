import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, firstValueFrom, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { CommonService } from '../../../../services/common.service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService, ImageOptimizationFailedError } from '../../../../services/utility.service';
import { OrganizationType } from '../../../organizations/models/organization-enum';
import { OrganizationService } from '../../../organizations/services/organization.service';
import { cloneUserGuide, emptyUserGuide, normalizeUserGuideResponse, USER_GUIDE_WELCOME_URL, UserGuideResponse } from '../../../organizations/models/user-guide.model';
import { UserGroups } from '../../../users/models/user-enums';
import { filterNavItemsForPartner, getUserGuideNavItems } from '../../access/role-access';
import {
  buildUserGuideTocAccessContext,
  buildUserGuideTocTree,
  expandUserGuideTocAncestors,
  flattenVisibleUserGuideToc,
  UserGuideTocNode
} from '../user-guide-toc-registry';
import { normalizeUserGuideHtmlForSave, stripEditorImageChrome, USER_GUIDE_IMAGE_PATH_ATTR, getImageStoragePathFromElement } from '../user-guide-html.util';

@Component({
  standalone: true,
  selector: 'app-help-guide-page',
  imports: [MaterialModule],
  templateUrl: './help-guide-page.component.html',
  styleUrl: './help-guide-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpGuidePageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private commonService = inject(CommonService);
  private organizationService = inject(OrganizationService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('pageEditor') set pageEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.pageEditor = value;
    this.syncPageEditor();
  }

  @ViewChild('pageImageInput') pageImageInput?: ElementRef<HTMLInputElement>;
  pageEditor?: ElementRef<HTMLDivElement>;
  tocTree: UserGuideTocNode[] = [];
  expandedTocIds = new Set<string>();
  selectedTocId = USER_GUIDE_WELCOME_URL;
  selectedUrl = USER_GUIDE_WELCOME_URL;
  selectedTitle = 'Welcome';
  userGuide: UserGuideResponse = emptyUserGuide();
  userGuideSnapshot: UserGuideResponse | null = null;
  canEdit = false;
  isEditing = false;
  isSaving = false;
  isUploadingImage = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['userGuide']));
  isPageReady = false;
  destroy$ = new Subject<void>();

  //#region Help Guide
  ngOnInit(): void {
    this.canEdit = this.authService.hasRole(UserGroups.SuperAdmin);
    this.tocTree = this.buildTocTree();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadUserGuide();
  }

  loadUserGuide(): void {
    const initialTopicUrl = this.getInitialTopicUrl();
    this.utilityService.addLoadItem(this.itemsToLoad$, 'userGuide');
    this.organizationService.getUserGuide().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'userGuide'); })).subscribe({
      next: userGuide => {
        this.userGuide = normalizeUserGuideResponse(userGuide);
        this.selectTopic(initialTopicUrl);
      },
      error: () => {
        this.userGuide = emptyUserGuide();
        this.selectTopic(initialTopicUrl);
      }
    });
  }

  getInitialTopicUrl(): string {
    return this.route.snapshot.queryParamMap.get('topic') || USER_GUIDE_WELCOME_URL;
  }

  selectTopic(url: string): void {
    this.captureEditorHtml();
    const resolvedUrl = url === 'dashboard-staff' || url === 'dashboard-owner' ? 'dashboard' : url;
    const match = this.findTocNodeByContentUrl(resolvedUrl) ?? this.findTocNodeById(USER_GUIDE_WELCOME_URL);
    if (match) {
      this.applyTocSelection(match, true);
    } else {
      this.selectedUrl = USER_GUIDE_WELCOME_URL;
      this.selectedTitle = 'Welcome';
      this.selectedTocId = USER_GUIDE_WELCOME_URL;
    }
    this.syncPageEditor();
    this.markViewForCheck();
  }

  onTocClick(node: UserGuideTocNode): void {
    this.captureEditorHtml();
    if (node.children?.length) {
      if (this.expandedTocIds.has(node.id)) {
        this.collapseTocBranch(node.id);
      } else {
        this.expandedTocIds.clear();
        expandUserGuideTocAncestors(this.tocTree, node.id, this.expandedTocIds);
        this.expandedTocIds.add(node.id);
      }
    } else {
      this.expandedTocIds.clear();
      expandUserGuideTocAncestors(this.tocTree, node.id, this.expandedTocIds);
    }
    this.applyTocSelection(node, false);
    this.syncPageEditor();
    this.markViewForCheck();
  }

  getArticleHtml(): string {
    return this.mappingService.getUserGuideSectionHtml(this.userGuide, this.selectedTocId);
  }

  get safeArticleHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.getArticleHtml());
  }

  startEdit(): void {
    if (!this.canEdit) {
      return;
    }
    this.userGuideSnapshot = cloneUserGuide(this.userGuide);
    this.isEditing = true;
    this.markViewForCheck();
    queueMicrotask(() => this.syncPageEditor());
  }

  cancelEdit(): void {
    if (!this.canEdit || !this.isEditing || this.isSaving) {
      return;
    }
    if (this.userGuideSnapshot) {
      this.userGuide = cloneUserGuide(this.userGuideSnapshot);
    }
    this.userGuideSnapshot = null;
    this.isEditing = false;
    this.syncPageEditor();
    this.markViewForCheck();
  }

  saveUserGuide(): void {
    if (!this.canEdit || !this.isEditing || this.isSaving) {
      return;
    }
    this.captureEditorHtml();
    const payload: UserGuideResponse = {
      ...this.userGuide,
      sections: Object.fromEntries(
        Object.entries(this.userGuide.sections || {}).map(([topicKey, html]) => [topicKey, normalizeUserGuideHtmlForSave(html)])
      )
    };
    this.isSaving = true;
    this.organizationService.updateUserGuide(payload).pipe(take(1), finalize(() => { this.isSaving = false; this.markViewForCheck(); })).subscribe({
      next: userGuide => {
        this.userGuide = normalizeUserGuideResponse(userGuide);
        this.userGuideSnapshot = null;
        this.isEditing = false;
        this.toastr.success('User guide saved');
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to save user guide');
      }
    });
  }

  closePage(): void {
    window.close();
  }
  //#endregion

  //#region Build Form
  onPageEditorInput(event: Event): void {
    const element = event.target as HTMLDivElement;
    this.userGuide = this.mappingService.setUserGuideSectionHtml(this.userGuide, this.selectedTocId, stripEditorImageChrome(element.innerHTML));
  }

  onPageEditorClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.help-guide-image-remove')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const wrap = target.closest('.help-guide-image-wrap');
    if (wrap) {
      void this.removePageImage(wrap);
    }
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
      this.userGuide = this.mappingService.setUserGuideSectionHtml(this.userGuide, this.selectedTocId, stripEditorImageChrome(editor.innerHTML));
      return;
    }
    if (format === 'unorderedList') {
      this.applyUnorderedListCommand(editor);
      this.userGuide = this.mappingService.setUserGuideSectionHtml(this.userGuide, this.selectedTocId, stripEditorImageChrome(editor.innerHTML));
      return;
    }
    this.execEditorCommand(format, false);
    this.userGuide = this.mappingService.setUserGuideSectionHtml(this.userGuide, this.selectedTocId, stripEditorImageChrome(editor.innerHTML));
  }

  preventEditorToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  openPageImagePicker(): void {
    this.pageImageInput?.nativeElement.click();
  }

  async onPageImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.uploadAndInsertPageImage(file);
  }

  async onPageEditorPaste(event: ClipboardEvent): Promise<void> {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems?.length) {
      return;
    }
    const imageItem = Array.from(clipboardItems).find(item => item.type.startsWith('image/'));
    if (!imageItem) {
      return;
    }
    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }
    event.preventDefault();
    await this.uploadAndInsertPageImage(file);
  }

  async uploadAndInsertPageImage(file: File): Promise<void> {
    if (!this.canEdit || !this.isEditing || this.isUploadingImage) {
      return;
    }
    this.isUploadingImage = true;
    this.markViewForCheck();
    try {
      const payload = await this.utilityService.buildUserGuideImageUploadPayload(file);
      const response = await firstValueFrom(this.organizationService.uploadUserGuideImage({ fileDetails: payload.fileDetails }));
      const imagePath = response?.imagePath || (response as { ImagePath?: string } | null)?.ImagePath;
      if (!imagePath) {
        this.toastr.error('Unable to upload image');
        return;
      }
      this.insertPageImageAtCursor(imagePath, payload.fileDetails.fileName, payload.fileDetails.dataUrl);
      this.toastr.success('Image inserted');
    } catch (error) {
      if (error instanceof ImageOptimizationFailedError) {
        this.toastr.error(this.utilityService.getImageCompressionFailureMessage(file.name));
        return;
      }
      const message = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(message || 'Unable to upload image');
    } finally {
      this.isUploadingImage = false;
      this.markViewForCheck();
    }
  }

  insertPageImageAtCursor(imagePath: string, altText: string, previewDataUrl: string): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    editor.focus();
    const safePath = this.escapeEditorHtml(imagePath);
    const safePreview = previewDataUrl;
    const safeAlt = this.escapeEditorHtml(altText || 'User guide image');
    const imageHtml = `<span class="help-guide-image-wrap" contenteditable="false" ${USER_GUIDE_IMAGE_PATH_ATTR}="${safePath}"><button type="button" class="help-guide-image-remove" aria-label="Remove image">&times;</button><img src="${safePreview}" ${USER_GUIDE_IMAGE_PATH_ATTR}="${safePath}" alt="${safeAlt}"></span>`;
    this.execEditorCommand('insertHTML', false, imageHtml);
    this.userGuide = this.mappingService.setUserGuideSectionHtml(this.userGuide, this.selectedTocId, stripEditorImageChrome(editor.innerHTML));
    this.markViewForCheck();
  }

  async removePageImage(wrap: Element): Promise<void> {
    const storagePath = getImageStoragePathFromElement(wrap);
    wrap.remove();
    this.syncUserGuideFromEditor();

    if (!storagePath) {
      return;
    }

    try {
      await firstValueFrom(this.organizationService.deleteUserGuideImage(storagePath));
    } catch (error) {
      const message = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(message || 'Unable to delete image file');
    }
  }

  decorateEditorImages(editor: HTMLDivElement): void {
    editor.querySelectorAll('img').forEach(img => {
      if (img.closest('.help-guide-image-wrap')) {
        return;
      }

      const storagePath = getImageStoragePathFromElement(img);
      const wrap = document.createElement('span');
      wrap.className = 'help-guide-image-wrap';
      wrap.contentEditable = 'false';
      if (storagePath) {
        wrap.setAttribute(USER_GUIDE_IMAGE_PATH_ATTR, storagePath);
      }

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'help-guide-image-remove';
      removeButton.setAttribute('aria-label', 'Remove image');
      removeButton.textContent = '×';

      img.parentNode?.insertBefore(wrap, img);
      wrap.appendChild(removeButton);
      wrap.appendChild(img);
    });
  }

  syncUserGuideFromEditor(): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    this.userGuide = this.mappingService.setUserGuideSectionHtml(
      this.userGuide,
      this.selectedTocId,
      stripEditorImageChrome(editor.innerHTML)
    );
    this.markViewForCheck();
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

  buildTocTree(): UserGuideTocNode[] {
    let navItems = getUserGuideNavItems(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    if (!this.authService.hasRole(UserGroups.SuperAdmin)
      && Number(this.commonService.getOrganizationTypeId()) === OrganizationType.Partner) {
      navItems = filterNavItemsForPartner(navItems);
    }
    return buildUserGuideTocTree(
      navItems,
      buildUserGuideTocAccessContext(this.authService, this.commonService),
      USER_GUIDE_WELCOME_URL
    );
  }

  get visibleTocRows(): { node: UserGuideTocNode; depth: number }[] {
    return flattenVisibleUserGuideToc(this.tocTree, this.expandedTocIds);
  }

  isTocExpanded(nodeId: string): boolean {
    return this.expandedTocIds.has(nodeId);
  }

  getTocIndent(depth: number): number {
    if (depth === 0) {
      return 8;
    }
    if (depth === 1) {
      return 36;
    }
    return 60 + (depth - 2) * 20;
  }

  showAccountingExpandChevron(node: UserGuideTocNode): boolean {
    return !!node.children?.length && node.id.startsWith('accounting/');
  }

  applyTocSelection(node: UserGuideTocNode, expandPath: boolean): void {
    if (expandPath) {
      this.expandedTocIds.clear();
      expandUserGuideTocAncestors(this.tocTree, node.id, this.expandedTocIds);
      if (node.children?.length) {
        this.expandedTocIds.add(node.id);
      }
    }
    this.selectedUrl = node.contentUrl;
    this.selectedTitle = node.displayName;
    this.selectedTocId = node.id;
  }

  collapseTocBranch(nodeId: string): void {
    for (const id of [...this.expandedTocIds]) {
      if (id === nodeId || id.startsWith(`${nodeId}/`)) {
        this.expandedTocIds.delete(id);
      }
    }
  }

  findTocNodeById(nodeId: string, nodes: UserGuideTocNode[] = this.tocTree): UserGuideTocNode | undefined {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      if (node.children?.length) {
        const match = this.findTocNodeById(nodeId, node.children);
        if (match) {
          return match;
        }
      }
    }
    return undefined;
  }

  findTocNodeByContentUrl(contentUrl: string, nodes: UserGuideTocNode[] = this.tocTree): UserGuideTocNode | undefined {
    for (const node of nodes) {
      if (node.id === contentUrl) {
        return node;
      }
      if (node.children?.length) {
        const match = this.findTocNodeByContentUrl(contentUrl, node.children);
        if (match) {
          return match;
        }
      }
    }
    return undefined;
  }

  syncPageEditor(): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    const nextHtml = this.getArticleHtml();
    const currentHtml = stripEditorImageChrome(editor.innerHTML);
    if (currentHtml !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
    if (this.canEdit && this.isEditing) {
      this.decorateEditorImages(editor);
    }
  }

  captureEditorHtml(): void {
    const editor = this.pageEditor?.nativeElement;
    if (!editor) {
      return;
    }
    this.userGuide = this.mappingService.setUserGuideSectionHtml(this.userGuide, this.selectedTocId, stripEditorImageChrome(editor.innerHTML));
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
