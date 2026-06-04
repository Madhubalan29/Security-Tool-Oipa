import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SecurityGroupRequestDto, SecurityGroupDto, CompanyDto } from '../models/security-group.model';

export type SecurityMode = 'create' | 'modify' | 'clone';

const STORAGE_KEY_MODE = 'sg_mode';
const STORAGE_KEY_GUID = 'sg_guid';
const STORAGE_KEY_GROUP_NAME = 'sg_groupName';
const STORAGE_KEY_CONFIG_STATE = 'sg_configState';
const STORAGE_KEY_CLONE_SOURCE = 'sg_cloneSourceGuid';

/** Shape of the persisted configure-page UI state */
export interface PersistedConfigState {
  activeStep: number;
  activeCompanyIndex: number;
  activeTabIndex: number;
  /** Serialised CompanyConfig[] – only the fields that matter */
  companyConfigs: any[];
}

@Injectable({
  providedIn: 'root'
})
export class SecurityStateService {

  private modeSubject = new BehaviorSubject<SecurityMode>(this.loadMode());
  private guidSubject = new BehaviorSubject<string>(this.loadString(STORAGE_KEY_GUID));
  private groupNameSubject = new BehaviorSubject<string>(this.loadString(STORAGE_KEY_GROUP_NAME));
  private payloadSubject = new BehaviorSubject<SecurityGroupRequestDto>(this.createEmptyPayload());

  mode$ = this.modeSubject.asObservable();
  guid$ = this.guidSubject.asObservable();
  groupName$ = this.groupNameSubject.asObservable();
  payload$ = this.payloadSubject.asObservable();

  get currentMode(): SecurityMode { return this.modeSubject.value; }
  get currentGuid(): string { return this.guidSubject.value; }
  get currentGroupName(): string { return this.groupNameSubject.value; }
  get currentPayload(): SecurityGroupRequestDto { return this.payloadSubject.value; }

  setMode(mode: SecurityMode): void {
    sessionStorage.setItem(STORAGE_KEY_MODE, mode);
    this.modeSubject.next(mode);
  }

  setGroupGuid(guid: string): void {
    sessionStorage.setItem(STORAGE_KEY_GUID, guid);
    this.guidSubject.next(guid);
  }

  setGroupName(name: string): void {
    sessionStorage.setItem(STORAGE_KEY_GROUP_NAME, name);
    this.groupNameSubject.next(name);
  }

  updatePayload(payload: SecurityGroupRequestDto): void {
    this.payloadSubject.next(payload);
  }

  // ── Clone source ──
  get cloneSourceGuid(): string {
    return sessionStorage.getItem(STORAGE_KEY_CLONE_SOURCE) || '';
  }

  setCloneSourceGuid(guid: string): void {
    sessionStorage.setItem(STORAGE_KEY_CLONE_SOURCE, guid);
  }

  updateCompanies(companies: CompanyDto[]): void {
    const current = this.currentPayload;
    this.payloadSubject.next({
      securityGroup: {
        ...current.securityGroup,
        companies
      }
    });
  }

  // ── Config page state persistence ──

  saveConfigState(state: PersistedConfigState): void {
    try {
      sessionStorage.setItem(STORAGE_KEY_CONFIG_STATE, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to persist config state to sessionStorage', e);
    }
  }

  loadConfigState(): PersistedConfigState | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_CONFIG_STATE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearConfigState(): void {
    sessionStorage.removeItem(STORAGE_KEY_CONFIG_STATE);
  }

  resetState(): void {
    sessionStorage.removeItem(STORAGE_KEY_MODE);
    sessionStorage.removeItem(STORAGE_KEY_GUID);
    sessionStorage.removeItem(STORAGE_KEY_GROUP_NAME);
    sessionStorage.removeItem(STORAGE_KEY_CONFIG_STATE);
    sessionStorage.removeItem(STORAGE_KEY_CLONE_SOURCE);
    this.modeSubject.next('create');
    this.guidSubject.next('');
    this.groupNameSubject.next('');
    this.payloadSubject.next(this.createEmptyPayload());
  }

  private loadMode(): SecurityMode {
    const stored = sessionStorage.getItem(STORAGE_KEY_MODE);
    return (stored === 'create' || stored === 'modify' || stored === 'clone') ? stored : 'create';
  }

  private loadString(key: string): string {
    return sessionStorage.getItem(key) || '';
  }

  private createEmptyPayload(): SecurityGroupRequestDto {
    return {
      securityGroup: {
        groupName: '',
        companies: []
      }
    };
  }
}
