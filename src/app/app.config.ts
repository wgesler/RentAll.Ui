import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideEnvironmentNgxMask } from 'ngx-mask';
import { provideToastr } from 'ngx-toastr';
import { authInterceptor } from './interceptor/auth.interceptor';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Keepalive } from '@ng-idle/keepalive';
import { Idle } from '@ng-idle/core';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes), 
    provideHttpClient(withInterceptors([authInterceptor])),
    provideEnvironmentNgxMask(),
    provideAnimationsAsync(),
    provideToastr(),
    DecimalPipe,
    DatePipe,
    Idle,
    Keepalive,
    {provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        // Handle default data overrides. Lookup 'JS spread syntax' if this still doesn't make sense.
        ...new MatDialogConfig(),  // inherit automatic default options

        width: '35rem'
      }
    }
  ]
};