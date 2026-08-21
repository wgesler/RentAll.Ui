import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RouterToken } from '../../../../app.routes.tokens';
import { USER_GUIDE_WELCOME_URL } from '../../../organizations/models/user-guide.model';

@Injectable({ providedIn: 'root' })
export class HelpGuideService {
  private router = inject(Router);

  open(topicUrl?: string): void {
    const resolvedTopicUrl = topicUrl || this.getCurrentTopicUrl();
    const queryParams = resolvedTopicUrl === USER_GUIDE_WELCOME_URL ? {} : { topic: resolvedTopicUrl };
    const url = this.router.serializeUrl(
      this.router.createUrlTree([RouterToken.UserGuide], { queryParams })
    );
    window.open(url, '_blank', 'noopener');
  }

  getCurrentTopicUrl(): string {
    const parts = this.router.url.split('?')[0].split('/').filter(Boolean);
    const authIndex = parts.indexOf('auth');
    const topicUrl = (authIndex >= 0 ? parts[authIndex + 1] : parts[0]) || USER_GUIDE_WELCOME_URL;
    if (topicUrl === 'dashboard-staff' || topicUrl === 'dashboard-owner') {
      return 'dashboard';
    }
    return topicUrl;
  }
}
