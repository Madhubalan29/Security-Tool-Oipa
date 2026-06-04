import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AsCompany,
  AsAuthPage,
  AsAuthButton,
  AsProduct,
  AsPlan,
  AsTransaction,
  AsInquiryScreen,
  AsWebService
} from '../models/lookup.model';

@Injectable({
  providedIn: 'root'
})
export class LookupService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getCompanies(): Observable<AsCompany[]> {
    return this.http.get<AsCompany[]>(`${this.baseUrl}/companies`);
  }

  getPages(): Observable<AsAuthPage[]> {
    return this.http.get<AsAuthPage[]>(`${this.baseUrl}/pages`);
  }

  getButtons(): Observable<AsAuthButton[]> {
    return this.http.get<AsAuthButton[]>(`${this.baseUrl}/buttons`);
  }

  getProductsByCompany(companyGuid: string): Observable<AsProduct[]> {
    return this.http.get<AsProduct[]>(`${this.baseUrl}/companies/${companyGuid}/products`);
  }

  getPlans(companyGuid: string, productGuid: string): Observable<AsPlan[]> {
    return this.http.get<AsPlan[]>(`${this.baseUrl}/companies/${companyGuid}/products/${productGuid}/plans`);
  }

  getPlansByCompany(companyGuid: string): Observable<AsPlan[]> {
    return this.http.get<AsPlan[]>(`${this.baseUrl}/companies/${companyGuid}/plans`);
  }

  getTransactions(planGuid?: string, productGuid?: string): Observable<AsTransaction[]> {
    let params = new HttpParams();
    if (planGuid) params = params.set('planGuid', planGuid);
    if (productGuid) params = params.set('productGuid', productGuid);
    return this.http.get<AsTransaction[]>(`${this.baseUrl}/transactions`, { params });
  }

  getInquiryScreens(companyGuid?: string, planGuid?: string): Observable<AsInquiryScreen[]> {
    let params = new HttpParams();
    if (companyGuid) params = params.set('companyGuid', companyGuid);
    if (planGuid) params = params.set('planGuid', planGuid);
    return this.http.get<AsInquiryScreen[]>(`${this.baseUrl}/inquiry-screens`, { params });
  }

  getWebServices(): Observable<AsWebService[]> {
    return this.http.get<AsWebService[]>(`${this.baseUrl}/webservices`);
  }
}
