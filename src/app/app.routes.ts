import { Routes } from '@angular/router';
import { LoginComponent } from './public/login/login.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { CompanyComponent } from './authenticated/company/company/company.component';
import { CompanyListComponent } from './authenticated/company/company-list/company-list.component';
import { LayoutComponent } from './authenticated/shared/layout/layout/layout.component';
import { authRouteGuard } from './guards/auth-guard';
import { unAuthRouteGuard } from './guards/un-auth-guard';

export enum RouterToken {
  Login = 'login',
  Auth = 'auth',
  RentalList = 'rentals',
  CompanyList = 'companies',
  Company = RouterToken.CompanyList + '/:id',
  ContactList = 'contacts',
  TenantList = 'tenants',
  Default = RouterToken.CompanyList
}

export enum RouterUrl {
  RentalList            = `${RouterToken.Auth}/${RouterToken.RentalList}`,
  CompanyList           = `${RouterToken.Auth}/${RouterToken.CompanyList}`,
  Company               = `${RouterToken.Auth}/${RouterToken.Company}`,
  ContactList           = `${RouterToken.Auth}/${RouterToken.ContactList}`,
  TenantList            = `${RouterToken.Auth}/${RouterToken.TenantList}`,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RouterUrl {
  export function replaceTokens(token: string, values: string[]): string {
    return values.reduce((path, value) => path.replace(/:[^/]+/, value), token as string);
  }
}

export const authRoutes: Routes = [
  { path: '', redirectTo: RouterToken.Default, pathMatch: 'full' },
  { path: RouterToken.RentalList, component: CompanyListComponent, canActivate: [authRouteGuard] }, // Placeholder - will be replaced later
  { path: RouterToken.CompanyList, component: CompanyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Company, component: CompanyComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.ContactList, component: CompanyListComponent, canActivate: [authRouteGuard] }, // Placeholder - will be replaced later
  { path: RouterToken.TenantList, component: CompanyListComponent, canActivate: [authRouteGuard] }, // Placeholder - will be replaced later
]

export const routes: Routes = [
	{ path: '', redirectTo: RouterToken.Login, pathMatch: 'full' },
  { path: RouterToken.Login, component: LoginComponent, canActivate: [unAuthRouteGuard] },
  { path: RouterToken.Auth, component: LayoutComponent, children: authRoutes, canActivate: [authRouteGuard] },
  { path: '**', component: PageNotFoundComponent },
];
