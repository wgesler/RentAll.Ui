import { Component, OnInit } from '@angular/core';
import { LetterListDisplay, LetterResponse } from '../models/letter.model';
import { LetterService } from '../services/letter.service';
import { ToastrService } from 'ngx-toastr';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MappingService } from '../../../services/mapping.service';
import { finalize, take } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonMessage } from '../../../enums/common-message.enum';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-letter-list',
  standalone: true,
  templateUrl: './letter-list.component.html',
  styleUrl: './letter-list.component.scss',
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent],
})

export class LetterListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;

  lettersDisplayedColumns: ColumnSet = {
    'displayState': { displayAs: 'State', sort: false },
    'text': { displayAs: 'Letter', maxWidth: '30vw', sort: false },
    'modifiedBy': { displayAs: 'Modified By', sort: false },
    'modifiedOn': { displayAs: 'Modified On', sort: false }
  };
  lettersDisplay: LetterListDisplay[] = [];

  constructor(
    public letterService: LetterService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
    this.itemsToLoad.push('letters');
  }

  ngOnInit(): void {
    this.getLetters();
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  goToLetter(event: LetterListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Letter, [event.state]));
  }

  addLetter(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Letter, ['create']));
  }

  getLetters(): void {
    this.letterService.getLetters().pipe(take(1), finalize(() => { this.removeLoadItem('letters') })).subscribe({
      next: (response: LetterResponse[]) => {
        this.lettersDisplay = this.mappingService.mapLetters(response);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Letters', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteLetter(letter: LetterListDisplay): void {
    this.letterService.deleteLetterByState(letter.state).pipe(take(1)).subscribe({
      next: (response: boolean) => {
        if (response) {
          this.toastr.success('Letter sucessfully deleted', CommonMessage.Success);
          this.getLetters();
        }
        else {
          this.toastr.error('Letter failed to delete', CommonMessage.ServiceError);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Letter failed to delete', CommonMessage.ServiceError);
        }
      }
    });
  }
}
