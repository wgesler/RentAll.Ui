import { Routes } from '@angular/router';
import { LoginComponent } from './public/login/login.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { CompanyComponent } from './authenticated/company/company/company.component';
import { CompanyListComponent } from './authenticated/company/company-list/company-list.component';
import { PropertyComponent } from './authenticated/property/property/property.component';
import { PropertyListComponent } from './authenticated/property/property-list/property-list.component';
import { ContactComponent } from './authenticated/contact/contact/contact.component';
import { ContactListComponent } from './authenticated/contact/contact-list/contact-list.component';
import { UserComponent } from './authenticated/user/user/user.component';
import { UserListComponent } from './authenticated/user/user-list/user-list.component';
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
  Contact = RouterToken.ContactList + '/:id',
  TenantList = 'tenants',
  Property = RouterToken.TenantList + '/:id',
  UserList = 'users',
  User = RouterToken.UserList + '/:id',
  Default = RouterToken.CompanyList
}

export enum RouterUrl {
  RentalList            = `${RouterToken.Auth}/${RouterToken.RentalList}`,
  CompanyList           = `${RouterToken.Auth}/${RouterToken.CompanyList}`,
  Company               = `${RouterToken.Auth}/${RouterToken.Company}`,
  ContactList           = `${RouterToken.Auth}/${RouterToken.ContactList}`,
  Contact               = `${RouterToken.Auth}/${RouterToken.Contact}`,
  TenantList            = `${RouterToken.Auth}/${RouterToken.TenantList}`,
  Property              = `${RouterToken.Auth}/${RouterToken.Property}`,
  UserList              = `${RouterToken.Auth}/${RouterToken.UserList}`,
  User                  = `${RouterToken.Auth}/${RouterToken.User}`,
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
  { path: RouterToken.ContactList, component: ContactListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Contact, component: ContactComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.TenantList, component: PropertyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Property, component: PropertyComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.UserList, component: UserListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.User, component: UserComponent, canActivate: [authRouteGuard] },
]

export const routes: Routes = [
	{ path: '', redirectTo: RouterToken.Login, pathMatch: 'full' },
  { path: RouterToken.Login, component: LoginComponent, canActivate: [unAuthRouteGuard] },
  { path: RouterToken.Auth, component: LayoutComponent, children: authRoutes, canActivate: [authRouteGuard] },
  { path: '**', component: PageNotFoundComponent },
];
