import { Routes } from '@angular/router';
import { LoginComponent } from './public/login/login.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { AgencyComponent } from './authenticated/agency/agency/agency.component';
import { AgencyListComponent } from './authenticated/agency/agency-list/agency-list.component';
import { LetterListComponent } from './authenticated/letters/letter-list/letter-list.component';
import { LetterComponent } from './authenticated/letters/letter/letter.component';
import { OutstandingCheckListComponent } from './authenticated/outstanding-checks/outstanding-check-list/outstanding-check-list.component';
import { canDeactivateGuard } from './guards/can-deactivate-guard';
import { OutstandingCheckComponent } from './authenticated/outstanding-checks/outstanding-check/outstanding-check.component';
import { LayoutComponent } from './authenticated/shared/layout/layout/layout.component';
import { authRouteGuard } from './guards/auth-guard';
import { unAuthRouteGuard } from './guards/un-auth-guard';

export enum RouterToken {
  Login = 'login',
  Auth = 'auth',
  AgencyList = 'agencies',
  Agency = RouterToken.AgencyList + '/:id',
  LetterList = 'letters',
  Letter = RouterToken.LetterList + '/:state',
  OutstandingCheckList = 'outstanding-checks',
  OutstandingCheck = RouterToken.OutstandingCheckList + '/:checkid',
  Default = RouterToken.OutstandingCheckList
}

export enum RouterUrl {
  AgencyList           = `${RouterToken.Auth}/${RouterToken.AgencyList}`,
  Agency               = `${RouterToken.Auth}/${RouterToken.Agency}`,
  LetterList           = `${RouterToken.Auth}/${RouterToken.LetterList}`,
  Letter               = `${RouterToken.Auth}/${RouterToken.Letter}`,
  OutstandingCheckList = `${RouterToken.Auth}/${RouterToken.OutstandingCheckList}`,
  OutstandingCheck     = `${RouterToken.Auth}/${RouterToken.OutstandingCheck}`,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RouterUrl {
  export function replaceTokens(token: string, values: string[]): string {
    return values.reduce((path, value) => path.replace(/:[^/]+/, value), token as string);
  }
}

export const authRoutes: Routes = [
  { path: '', redirectTo: RouterToken.Default, pathMatch: 'full' },
  { path: RouterToken.AgencyList, component: AgencyListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Agency, component: AgencyComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.Letter, component: LetterComponent, canDeactivate: [canDeactivateGuard], canActivate: [authRouteGuard] },
  { path: RouterToken.LetterList, component: LetterListComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.OutstandingCheck, component: OutstandingCheckComponent, canActivate: [authRouteGuard] },
  { path: RouterToken.OutstandingCheckList, component: OutstandingCheckListComponent, canActivate: [authRouteGuard] },
]

export const routes: Routes = [
	{ path: '', redirectTo: RouterToken.Login, pathMatch: 'full' },
  { path: RouterToken.Login, component: LoginComponent, canActivate: [unAuthRouteGuard] },
  { path: RouterToken.Auth, component: LayoutComponent, children: authRoutes, canActivate: [authRouteGuard] },
  { path: '**', component: PageNotFoundComponent },
];
