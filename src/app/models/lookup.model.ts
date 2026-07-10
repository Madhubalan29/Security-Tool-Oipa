export interface AsAuthButton {
  buttonGuid: string;
  buttonName: string;
}

export interface AsAuthPage {
  pageGuid: string;
  pageName: string;
}

export interface AsCompany {
  companyGuid: string;
  companyName: string;
  clientGuid: string;
}

export interface AsProduct {
  productGuid: string;
  productName: string;
  companyGuid: string;
}

export interface AsPlan {
  planGuid: string;
  planName: string;
  companyGuid: string;
  productGuid: string;
}

export interface AsTransaction {
  transactionGuid: string;
  transactionName: string;
  planGuid: string;
  productGuid: string;
}

export interface AsInquiryScreen {
  inquiryScreenGuid: string;
  screenName: string;
  companyGuid: string;
  planGuid: string;
  productGuid: string;
  inquiryScreenNameGuid: string; // The specific GUID mapped in security mapping
  typeCode?: string;
  typeName?: string;
}

export interface AsWebService {
  webServiceGuid: string;
  webServiceName: string;
}
