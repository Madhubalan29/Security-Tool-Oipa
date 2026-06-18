export interface UserClient {
  primaryCompany?: string;
  firstName?: string;
  lastName?: string;
  sex?: string;
  gender?: string;
  email?: string;
}

export interface UserSecurityGroup {
  securityGroupName: string;
  roleEffectiveFrom: string;
}

export interface UserDto {
  loginName: string;
  password?: string;
  userStatus: string;
  localeCode: string;
  passwordEncryption?: string;
  clientGuid?: string;
  client?: UserClient;
  securityGroup?: UserSecurityGroup[];
  links?: any[];
}

export interface GetUsersResponse {
  count: number;
  offset: number;
  limit: number;
  users: UserDto[];
}

export interface CreateUsersResponse {
  users: string[]; // List of user GUIDs
}
