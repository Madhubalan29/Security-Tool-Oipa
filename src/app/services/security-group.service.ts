import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SecurityGroupRequestDto, SecurityGroupDto } from '../models/security-group.model';

@Injectable({
  providedIn: 'root'
})
export class SecurityGroupService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Create a new security group by name.
   * POST /api/security-groups/create
   * Returns the generated GUID for the new group.
   */
  createGroup(groupName: string): Observable<{ securityGroupGuid: string }> {
    return this.http.post<{ securityGroupGuid: string }>(`${this.baseUrl}/security-groups/create`, { groupName });
  }

  /**
   * Get a list of all existing security groups.
   * GET /api/security-groups
   */
  getAllGroups(): Observable<SecurityGroupDto[]> {
    return this.http.get<SecurityGroupDto[]>(`${this.baseUrl}/security-groups`);
  }

  /**
   * Fetch the full deeply-nested security configuration for a group.
   * GET /api/security-groups/{guid}
   */
  getGroupConfig(guid: string): Observable<SecurityGroupRequestDto> {
    return this.http.get<SecurityGroupRequestDto>(`${this.baseUrl}/security-groups/${guid}`);
  }

  /**
   * Save (submit) the full security group configuration payload.
   * POST /api/security-groups
   * This sends the entire JSON tree for creation or modification.
   */
  saveGroupConfig(request: SecurityGroupRequestDto): Observable<string[]> {
    return this.http.post<string[]>(`${this.baseUrl}/security-groups/generate-scripts`, request);
  }
}
