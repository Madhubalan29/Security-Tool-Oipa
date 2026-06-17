import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SecurityFunctionsComponent } from './components/security-functions/security-functions.component';
import { CreateGroupComponent } from './components/create-group/create-group.component';
import { ModifyGroupComponent } from './components/modify-group/modify-group.component';
import { SecurityConfigComponent } from './components/security-config/security-config.component';
import { RateLoaderComponent } from './components/rate-loader/rate-loader.component';

const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'security-group', component: SecurityFunctionsComponent },
  { path: 'security-group/create', component: CreateGroupComponent },
  { path: 'security-group/modify', component: ModifyGroupComponent },
  { path: 'security-group/clone', component: ModifyGroupComponent },
  { path: 'security-group/view', component: ModifyGroupComponent },
  { path: 'security-group/configure', component: SecurityConfigComponent },
  { path: 'rate-loader', component: RateLoaderComponent },
  { path: '**', redirectTo: '/login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
