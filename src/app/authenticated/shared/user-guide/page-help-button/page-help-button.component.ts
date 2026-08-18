import { Component, inject } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { HelpGuideService } from '../help-guide/help-guide.service';

@Component({
  standalone: true,
  selector: 'app-page-help-button',
  imports: [MaterialModule],
  templateUrl: './page-help-button.component.html',
  styleUrl: './page-help-button.component.scss'
})
export class PageHelpButtonComponent {
  private helpGuideService = inject(HelpGuideService);

  openHelp(): void {
    this.helpGuideService.open(this.helpGuideService.getCurrentTopicUrl());
  }
}
