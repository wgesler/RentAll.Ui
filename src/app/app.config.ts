import { DatePipe, DecimalPipe } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { Idle } from '@ng-idle/core';
import { Keepalive } from '@ng-idle/keepalive';
import { provideEnvironmentNgxMask } from 'ngx-mask';
import { provideToastr } from 'ngx-toastr';
import { routes } from './app.routes';
import { authInterceptor } from './interceptor/auth.interceptor';

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