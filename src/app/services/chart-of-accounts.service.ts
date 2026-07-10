import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CoaTreeNode, CoaWizardData, CoaSaveResponse } from '../models/chart-of-accounts.model';

@Injectable({
  providedIn: 'root'
})
export class ChartOfAccountsService {
  private baseUrl = 'http://localhost:8015/api/chart-of-accounts';

  constructor(private http: HttpClient) {}

  getHierarchyTree(): Observable<CoaTreeNode[]> {
    return this.http.get<CoaTreeNode[]>(`${this.baseUrl}/hierarchy`);
  }

  saveConfiguration(data: CoaWizardData): Observable<CoaSaveResponse> {
    return this.http.post<CoaSaveResponse>(this.baseUrl, data);
  }

  checkAccountExists(accountNumber: string): Observable<boolean> {
    return this.http.get<boolean>(`${this.baseUrl}/exists`, {
      params: { accountNumber }
    });
  }

  getEntitiesByTransactionName(transactionName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/entity-by-transaction`, {
      params: { transactionName }
    });
  }

  getTransactions(): Observable<{ codeValue: string, description: string }[]> {
    return this.http.get<{ codeValue: string, description: string }[]>(`${this.baseUrl}/transactions`);
  }

  getFullConfig(entryGuid: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/config/${entryGuid}`);
  }

  getFullConfigByEntity(entityGuid: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/config-by-entity/${entityGuid}`);
  }
}
