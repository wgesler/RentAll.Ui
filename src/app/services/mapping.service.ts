import { Injectable } from '@angular/core';
import { AgencyResponse, AgencyListDisplay } from '../authenticated/agency/models/agency.model';
import { LetterListDisplay, LetterResponse } from '../authenticated/letters/models/letter.model';
import { OutstandingCheckListDisplay, OutstandingCheckSummary, OutstandingCheckSummaryResponse } from '../authenticated/outstanding-checks/models/outstanding-check.model';
import { FormatterService } from './formatter-service';
import { EmailDisplay, EmailResponse } from '../authenticated/outstanding-checks/models/email.model';
import { NoteResponse, NoteDisplay } from '../authenticated/outstanding-checks/models/note.model';

@Injectable({
    providedIn: 'root'
})

export class MappingService {
  readonly defaultState = 'XX';

  constructor(private formatter: FormatterService) { }
  
  mapAgencies(agencies: AgencyResponse[]): AgencyListDisplay[] {
    return agencies.map<AgencyListDisplay>((o: AgencyResponse) => ({
      agencyId: o.agencyId,
      name: o.name,
      regId: o.regId,
      branch: o.branch,
      state: o.state,
      parentCompany: o.parentCompany,
    }));
  }

  mapLetters(letters: LetterResponse[]): LetterListDisplay[] {
    return letters.map<LetterListDisplay>((o: LetterResponse) => {
      return {
        displayState: o.state === this.defaultState ? 'Default' : o.state,
        state: o.state,
        text: o.text,
        modifiedBy: o.modifiedBy,
        modifiedOn: this.formatter.date(new Date(o.modifiedOn)),
        deleteDisabled: o.state === this.defaultState ? true : false
      }
    });
  }

  mapOutstandingChecks(checks: OutstandingCheckSummaryResponse[]): OutstandingCheckSummary[] {
    return checks.map<OutstandingCheckSummary>((o: OutstandingCheckSummaryResponse) => ({
      outstandingCheckId: o.outstandingCheckId,
      agencyId: o.agencyId,
      gfNo: o.gfNo,
      amount: o.amount,
      checkNum: o.checkNum,
      checkDate: new Date(o.checkDate),
      lastContact: new Date(o.lastContact),
      reminderSent: o.reminderSent,
      escheatSent: o.escheatSent
    }));
  }

  mapOutstandingCheckDisplay(checks: OutstandingCheckSummary[]): OutstandingCheckListDisplay[] {
    return checks.map<OutstandingCheckListDisplay>((o: OutstandingCheckSummary) => ({
      outstandingCheckId: o.outstandingCheckId,
      agencyId: o.agencyId,
      gfNo: o.gfNo,
      amount: '$' + this.formatter.currency(Number(o.amount)),
      checkNum: o.checkNum,
      checkDate: this.formatter.dateOnly(o.checkDate),
      lastContact: this.formatter.dateOnly(o.lastContact),
      reminderSent: o.reminderSent,
      escheatSent: o.escheatSent
    }));
  }

  mapEmails(emails: EmailResponse[]): EmailDisplay[] {
    return emails.map<EmailDisplay>((o: EmailResponse) => ({
      companyName: o.companyName,
      payeeName: o.payeeName,
      payeeEmail: o.payeeEmail,
      isEscheat: o.isEscheat ? 'Escheat' : 'Reminder',
      success: o.success,
      createdBy: o.createdBy,
      createdOn: this.formatter.date(new Date(o.createdOn))
    }));
  }

  mapNotes(notes: NoteResponse[]): NoteDisplay[] {
    return notes.map<NoteDisplay>((o: NoteResponse) => ({
      text: o.text,
      createdBy: o.createdBy,
      createdOn: this.formatter.date(new Date(o.createdOn))
    }));
  }
}
