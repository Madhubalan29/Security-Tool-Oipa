export interface ButtonDto {
  buttonGuid: string;
  selected?: boolean; // For UI state
  configured?: boolean;
  name?: string;      // Optional for display
}

export interface CompanyPageDto {
  pageGuid: string;
  buttons: ButtonDto[];
  selected?: boolean; // For UI state
  configured?: boolean;
  name?: string;
  buttonFilter?: string;
}

export interface CompanyInquiryDto {
  inquiryScreenNameGuid: string;
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface CompanyWebServiceDto {
  webServiceGuid: string;
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface PlanTransactionDto {
  transactionGuid: string;
  buttons: ButtonDto[];
  selected?: boolean;
  configured?: boolean;
  name?: string;
  buttonFilter?: string;
}

export interface PlanPageDto {
  pageGuid: string;
  buttons: ButtonDto[];
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface PlanDto {
  planGuid: string;
  planPages: PlanPageDto[];
  planTransactions: PlanTransactionDto[];
  planInquiries: CompanyInquiryDto[]; // From Phase 1 requirement
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface ProductTransactionDto {
  transactionGuid: string;
  buttons: ButtonDto[];
  selected?: boolean;
  configured?: boolean;
  name?: string;
  buttonFilter?: string;
}

export interface ProductPageDto {
  pageGuid: string;
  buttons: ButtonDto[];
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface ProductDto {
  productGuid: string;
  productPages: ProductPageDto[];
  productTransactions: ProductTransactionDto[];
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface CompanyDto {
  companyGuid: string;
  companyPages: CompanyPageDto[];
  companyInquiries: CompanyInquiryDto[];
  companyWebServices: CompanyWebServiceDto[];
  products: ProductDto[];
  plans: PlanDto[];
  selected?: boolean;
  configured?: boolean;
  name?: string;
}

export interface SecurityGroupDto {
  securityGroupGuid?: string; // Optional for Modify
  groupName: string;
  companies: CompanyDto[];
}

export interface SecurityGroupRequestDto {
  securityGroup: SecurityGroupDto;
}

export interface MigrationScriptDto {
  companyGuid: string;
  productGuid: string;
  planGuid: string;
  entityType: string;
  entityGuid: string;
  script: string;
}

export interface GenerateScriptsResponseDto {
  securityGroupGuid: string;
  groupName: string;
  scripts: string[];
  migrationScripts?: MigrationScriptDto[];
}

export interface CreateGroupResponseDto {
  securityGroupGuid: string;
  groupName: string;
  insertScript: string;
}


