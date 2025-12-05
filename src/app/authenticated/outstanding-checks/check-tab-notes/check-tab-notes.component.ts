import { Component, Input, NgZone, OnInit } from '@angular/core';
import { OutstandingCheckResponse } from '../models/outstanding-check.model';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { OutstandingCheckService } from '../services/outstanding-check.service';
import { finalize, take } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MappingService } from '../../../services/mapping.service';
import { NoteResponse, NoteDisplay, NoteRequest } from '../models/note.model';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormatterService } from '../../../services/formatter-service';
import { AuthService } from '../../../services/auth.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';


@Component({
  selector: 'app-check-tab-notes',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, ReactiveFormsModule],
  templateUrl: './check-tab-notes.component.html',
  styleUrl: './check-tab-notes.component.scss'
})

export class CheckTabNotesComponent implements OnInit {
  @Input() outstandingCheck: OutstandingCheckResponse;

  noteDetails = { data: { title: 'Note Details', message: '', no: 'Close', yes: '', useHTML: true, icon: 'note' } };
  dialogRef: MatDialogRef<GenericModalComponent>;

  isServiceError: boolean = false;
  isSubmitting: boolean = false;
  itemsToLoad: string[] = [];
  form: FormGroup;
  notesColumns: ColumnSet = {
    'text': { displayAs: 'Note', maxWidth: '30vw', sort: false },
    'createdBy': { displayAs: 'Created By', sort: false },
    'createdOn': { displayAs: 'Created On', sort: false, wrap: false }
  };
  notes: NoteDisplay[];
  userName: string = '';

  constructor(
    public outstandingCheckService: OutstandingCheckService,
    public toastrService: ToastrService,
    public mappingService: MappingService,
    public fb: FormBuilder,
    public authService: AuthService,
    public formatterService: FormatterService,
    private zone: NgZone,
    private dialog: MatDialog) {
      this.itemsToLoad.push('notes');
    }

  ngOnInit(): void {
    this.buildForm();
    this.getNotes();
    this.userName = this.authService.getUser().firstName + ' ' + this.authService.getUser().lastName;
  }

  buildForm(): void {
    this.form = this.fb.group({
      text: new FormControl('', [ Validators.maxLength(1000) ])
    });
  }

  getNotes(): void {
    this.outstandingCheckService.getNotesByOutstandingCheckId(this.outstandingCheck.outstandingCheckId).pipe(take(1), finalize(() => { this.removeLoadItem('notes') })).subscribe({
      next: (response: NoteResponse[]) => {
        this.notes = this.mappingService.mapNotes(response);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastrService.error('Could not load Agencies', CommonMessage.ServiceError);
        }
        this.isServiceError = true;
      }
    });
  }

  addNote(): void {
    const request: NoteRequest = {
      outstandingCheckId: this.outstandingCheck.outstandingCheckId,
      text: this.form.get('text').value,
      createdBy: this.userName
    }
    this.outstandingCheckService.addNote(this.outstandingCheck.outstandingCheckId, request).pipe(take(1), finalize(() => { })).subscribe({
      next: (response: NoteResponse) => {
        this.notes.unshift({
          text: response.text,
          createdBy: response.createdBy,
          createdOn: this.formatterService.date(response.createdOn)
        });
        this.notes = this.notes.slice();
        this.form.get('text').markAsUntouched();
        this.form.reset();
        this.toastrService.success('Your note has been added', CommonMessage.ServiceError);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastrService.error('Could not add note', CommonMessage.ServiceError);
        }
        this.isServiceError = true;
      }
    });
  }

  openDetails(note: NoteDisplay): void {
    this.noteDetails.data.message = `<div class="dialog-details">
        <div class="mb-1">
          <div class="label">Note: </div>
          <div class="value">${note.text}</div>
        </div>
        <div class="mb-1">
          <div class="label">Created By: </div>
          <div class="value">${note.createdBy}</div>
        </div>
        <div class="mb-1">
          <div class="label">Created On: </div>
          <div class="value">${note.createdOn}</div>
        </div>
      </div>`;
    this.zone.run(() => {
      this.dialogRef = this.dialog.open(GenericModalComponent, this.noteDetails);
    });
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}
