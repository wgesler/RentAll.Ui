import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { appConfig } from '../app.config';

/** App providers for component specs; HTTP goes to the testing backend instead of the network. */
export const appTestProviders: Array<Provider | EnvironmentProviders> = [
  ...appConfig.providers,
  provideHttpClientTesting()
];
