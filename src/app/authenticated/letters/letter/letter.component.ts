import { Component, OnInit } from '@angular/core';
import { CombinedLetterResponse, LetterListDisplay, LetterResponse } from '../models/letter.model';
import { LetterService } from '../services/letter.service';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, filter } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { DefaultState, States } from '../models/letter.consts';
import { CanComponentDeactivate, CanDeactivateType } from '../../../guards/can-deactivate-guard';
import { ConfirmDiscardService } from '../../../services/confirm-discard.service';
import { AuthService } from '../../../services/auth.service';


@Component({
  selector: 'app-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './letter.component.html',
  styleUrl: './letter.component.scss'
})
export class LetterComponent implements OnInit, CanComponentDeactivate {
  readonly defaultState = DefaultState;
  readonly escheatReplacement = /\{\{escheatment text\}\}/;
  readonly editConfig = { data: {title: 'Edit Instead?', message: 'This letter exists already. Would you like to edit it instead?', no: 'Cancel', yes: 'Edit'} };
  readonly createConfig = { data: {title: 'Create Letter?', message: "This letter doesn't exist yet. Would you like to begin creating it?", no: 'Cancel', yes: 'Create'} };

  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  userName: string = '';

  create: boolean = false;
  oldState: string;
  requestedState: string;
  isDefault: boolean = false;

  subject: string;
  prefixText: string;
  suffixText: string;

  letter: LetterListDisplay;
  states: string[] = States.slice();

  form: FormGroup;
  stateForm: FormGroup;

  backText: string = 'Letters';
  returnUrl: string = RouterUrl.LetterList;

  constructor(
    public dialog: MatDialog,
    public authService: AuthService,
    public letterService: LetterService,
    public router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private confirmDiscardService: ConfirmDiscardService)
  {
    this.itemsToLoad.push('letter');
  }

  ngOnInit(): void {
    this.userName = this.authService.getUser().firstName + ' ' + this.authService.getUser().lastName;
    this.form = this.fb.group({
      subject: [{ value: '' }, [Validators.required, Validators.minLength(5)]], 
      text: [{ value: '' }, [Validators.required, Validators.minLength(10)]]     
    });

    this.stateForm = this.fb.group({ state: new FormControl(''), });
    this.form.valueChanges.subscribe({next: () => { this.confirmDiscardService.set(!this.form.pristine); }});
    this.form.disable();

    this.route.queryParamMap.subscribe((queryParamMap: ParamMap) => {
      if (queryParamMap.has('returnUrl')) {
        this.create = true;
        this.returnUrl = queryParamMap.get('returnUrl');
      }
      this.backText = queryParamMap.get('backText') ?? this.backText;
    });

    this.route.paramMap.pipe(filter(p => p.has('state')))
      .subscribe((paramMap: ParamMap) => {
        this.oldState = this.requestedState;
        this.requestedState = paramMap.get('state');
        this.letter = {
          state: this.requestedState,
          text: null,
          modifiedBy: null,
          modifiedOn: null,
          deleteDisabled: true
        };
        this.prefixText = this.suffixText = null;
        if (this.letter.state === 'create') {
          this.create = true;
          this.letter.state = null;
          this.form.reset();
          this.stateForm.reset();
          this.removeLoadItem('letter');
        } else {
          this.getLetterInfo();
        }
      });
  }

  canDeactivate(): CanDeactivateType {
    if (this.form.pristine) return true;
    return this.confirmDiscardService.confirm(result =>
      result || this.configureForms(this.requestedState)
    );
  }

  back(): void {
    this.router.navigateByUrl(this.returnUrl);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  configureForms(state: string): void {
    this.stateForm.get('state').setValue(state);
    this.isDefault = this.requestedState === this.defaultState;
    if (this.isDefault) this.form.get('subject').enable();
    else this.form.get('subject').disable();
  }

  save(): void {
    if (this.form.invalid)
      return;

    const text = (this.isDefault ? this.form.get('subject').value + '\r\n' : '') + this.form.get('text').value;
    this.letterService.addOrUpdateLetter({state: this.stateForm.get('state').value, text: text, createdBy: this.userName}).subscribe({
      next: () => {
        this.confirmDiscardService.disable();
        this.form.markAsPristine();
        this.toastr.success('Successfully updated letter');
        this.back();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not update letter info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  selectLetter(state: string): void {
    this.router.navigateByUrl(this.router.url.replace(this.requestedState, state));
  }

  private getLetterInfo(): void {
    this.letterService.getLetterByState(this.letter.state).pipe(take(1),
    finalize(() => { this.removeLoadItem('letter') })).subscribe({
      next: (response: CombinedLetterResponse) => {
        let letter: LetterResponse;

        // separate subject line
        const list = response.defaultLetter.text.split('\n');
        response.defaultLetter.text = list.slice(1).join('\n');
        this.subject = list[0];

        this.configureForms(this.requestedState);

        // populate static text
        if (this.isDefault) {
          this.prefixText = null;
          this.suffixText = null;
          letter = response.defaultLetter;
        } else {
          const text = response.defaultLetter.text.split(this.escheatReplacement);
          this.prefixText = text[0];
          this.suffixText = text[1];
          letter = response.stateEscheatLetter;
        }

        this.letter = {
          state: this.requestedState,
          text: letter?.text,
          modifiedBy: letter?.modifiedBy,
          modifiedOn: letter?.modifiedOn,
          deleteDisabled: this.requestedState === 'Default' ? true : false
        }

        // populate previous values
        this.form.get('subject').setValue(this.subject);
        this.form.get('text').setValue(this.letter.text);
        this.form.get('text').enable();
        this.form.markAsPristine();
        this.confirmDiscardService.disable();

        const config =
          ( this.create &&  this.letter.modifiedOn) ? this.editConfig   :
          (!this.create && !this.letter.modifiedOn) ? this.createConfig : null;
        if (!config) return;
        const dialogRef = this.dialog.open(GenericModalComponent, config);
        dialogRef.afterClosed().subscribe({next: result => {
          if (result) this.create = !this.create;
          else this.selectLetter(this.oldState || 'create');
        } });
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load letter info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          this.form.get('text').reset();
        }
      }
    });
  }
}
