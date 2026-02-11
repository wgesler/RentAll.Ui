import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Environment } from '../../environments/models/custom-window';



@Injectable({
  providedIn: 'root',
})

export class ConfigService {
  private readonly configApi: Environment;
  private readonly useDevApi: boolean = false;

  constructor() {
    this.configApi = this.getEnvConfig();
  }

  public config(): Environment {
    return this.configApi;
  }

  private getEnvConfig(): Environment {

    if (environment.local && this.useDevApi) {
      return {
        production: false,
        staging: false,
        dev: true,
        local: false,
        title: 'RentAll - Dev',
        apiUrl: 'https://dev.escheatr.4t.services/',
      } as Environment;
	}

    return environment;
  }
}
