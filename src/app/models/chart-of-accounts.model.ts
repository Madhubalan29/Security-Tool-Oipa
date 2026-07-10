export interface CoaTreeNode {
  id?: string;
  name: string;
  type: 'root' | 'company' | 'account' | 'entity' | 'transaction' | 'entry' | 'criteria' | 'result';
  icon?: string;
  details?: any;
  children?: CoaTreeNode[];
}

export interface CoaCriteriaItem {
  criteria: string;
  value: string;
}

export interface CoaWizardData {
  // Step 1: New Chart Of Account
  primaryCompany: string;
  accountNumber: string;
  accountDescription: string;

  // Step 2: Chart Of Accounts Entity
  transaction: string;
  suspense: boolean;

  // Step 3: Chart Of Accounts Entry
  effectiveFromDate: string | Date;
  effectiveToDate: string | Date;
  entryDescription: string;
  creditDebit: string;
  type: string; // 'MathVariable' | 'By Fund' | 'Disbursement' | 'GeneralLedger'
  gainLoss: boolean;
  flipOnNegative: boolean;
  accountingAmount: string; // Used when type === 'MathVariable'
  fundType: string;         // Used when type === 'By Fund'
  originalDisbursementStatus: string;
  doReversalAccounting: boolean;

  // Step 4: Chart Of Accounts Criteria
  writeAccounting: boolean;

  // Step 5: Chart Of Accounts Result (Grouped selections & direct items)
  resultSelections: {
    branchSection: string;      // 'Branch' | 'AgentBranchID' | 'PremiumCollectionBranchID' | ''
    departmentSection: string;  // 'Department' | 'StampDutyDepartment' | 'StampDutyCreditDepartment' | 'PHCFDepartment' | 'PHCFCreditDepartment' | 'PremiumCollectionDepartmentID' | ''
    productSection: string;     // 'Product' | 'PremiumCollectionProduct' | ''
    channelSection: string;     // 'Channel' | 'PremiumCollectionChannelID' | ''
    lobSection: string;         // 'LOB' | 'PremiumCollectionLOBID' | ''
    company: boolean;           // Direct checkbox for Company
    defaultBranchID: boolean;   // Direct checkbox for DefaultBranchID
  };

  // Create Entity flow flags
  isNewEntityOnly?: boolean;
  existingAccountGuid?: string;
  lockStep1: boolean;
  lockStep2: boolean;
  lockStep3: boolean;

  // Edit flow fields
  editMode?: boolean;
  coaGuid?: string;
  entityGuid?: string;
  entryGuid?: string;
  lastConfiguredStep?: number;
}

export interface CoaSaveResponse {
  scripts: string[];
  message?: string;
}

