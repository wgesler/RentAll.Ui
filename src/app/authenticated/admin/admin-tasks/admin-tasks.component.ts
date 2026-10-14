import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AdminTaskService, StorageRepairEvent } from '../services/admin-task.service';

interface AdminTask {
  key: string;
  label: string;
  detail: string;
  running: boolean;
  result: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-tasks',
  templateUrl: './admin-tasks.component.html',
  styleUrl: './admin-tasks.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class AdminTasksComponent {
  private adminTaskService = inject(AdminTaskService);
  private toastr = inject(ToastrService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('progressLog') progressLog?: ElementRef<HTMLElement>;

  progressLines: string[] = [];
  tasks: AdminTask[] = [
    { key: 'office-logos', label: 'Office logos', detail: 'Move each office logo and accounting-office logo under that office.', running: false, result: '' },
    { key: 'organization-logos', label: 'Organization logos', detail: 'Move organization logos under global.', running: false, result: '' },
    { key: 'profiles', label: 'Profile pictures', detail: 'Move profile pictures under the user office, or global when there is no office.', running: false, result: '' },
    { key: 'state-forms', label: 'State forms', detail: 'Move state forms under global.', running: false, result: '' },
    { key: 'user-guide', label: 'User guide images', detail: 'Move user guide images under global.', running: false, result: '' },
    { key: 'receipts', label: 'Receipt images', detail: 'Move each receipt image under its office and receipt number.', running: false, result: '' },
    { key: 'appliance-decals', label: 'Appliance decals', detail: 'Move appliance decals under the office and property code.', running: false, result: '' },
    { key: 'listing-photos', label: 'Listing photos', detail: 'Move each listing photo under the office and property code.', running: false, result: '' },
    { key: 'inspection-photos', label: 'Inspection photos', detail: 'Move each inspection photo under the office and property code.', running: false, result: '' },
    { key: 'denver-documents', label: 'Office paths', detail: 'For each saved link, keep the newest file in the spaced office folder, delete the other copy, and save the link.', running: false, result: '' }
  ];

  get busy(): boolean {
    return this.tasks.some(task => task.running);
  }

  run(task: AdminTask): void {
    if (this.busy) {
      return;
    }

    task.running = true;
    task.result = '';
    this.progressLines = [`${task.label} started.`];
    this.scrollProgress();
    this.adminTaskService.repair(task.key).pipe(finalize(() => this.paint(() => { task.running = false; }))).subscribe({
      next: (event: StorageRepairEvent) => {
        this.paint(() => this.appendProgress(task, event));
      },
      error: () => {
        this.paint(() => {
          task.running = false;
          task.result = 'The repair did not finish. Nothing that failed was left without its original file.';
          this.progressLines = [...this.progressLines, task.result];
          this.scrollProgress();
          this.toastr.error(task.result, CommonMessage.Error);
        });
      }
    });
  }

  appendProgress(task: AdminTask, event: StorageRepairEvent): void {
    if (event.kind === 'start') {
      const count = event.total ?? 0;
      this.progressLines = [...this.progressLines, `${task.label}: ${count} file${count === 1 ? '' : 's'}.`];
    } else if (event.kind === 'file') {
      const status = event.status === 'failed' && event.detail ? `failed: ${event.detail}` : event.status;
      this.progressLines = [...this.progressLines, `${event.file} — ${status}`];
    } else if (event.kind === 'done') {
      task.running = false;
      task.result = this.describe(event);
      this.progressLines = [...this.progressLines, task.result];
      this.scrollProgress();
      if ((event.failed ?? 0) > 0) {
        this.toastr.error(task.result, CommonMessage.Error);
        return;
      }
      this.toastr.success(task.result, CommonMessage.Success);
      return;
    } else if (event.kind === 'error') {
      task.running = false;
      task.result = event.detail || 'The repair did not finish. Nothing that failed was left without its original file.';
      this.progressLines = [...this.progressLines, task.result];
      this.scrollProgress();
      this.toastr.error(task.result, CommonMessage.Error);
      return;
    }

    this.scrollProgress();
  }

  describe(response: StorageRepairEvent): string {
    const moved = response?.moved ?? 0;
    const alreadyCorrect = response?.alreadyCorrect ?? 0;
    const removed = response?.removed ?? 0;
    const failed = response?.failed ?? 0;
    const summary = `${moved} moved, ${alreadyCorrect} already correct, ${removed} removed, ${failed} failed.`;
    const errors = response?.errors ?? [];
    return errors.length > 0 ? `${summary} ${errors.join(' ')}` : summary;
  }

  paint(update: () => void): void {
    this.zone.run(() => {
      update();
      this.cdr.detectChanges();
    });
  }

  scrollProgress(): void {
    setTimeout(() => {
      const element = this.progressLog?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
