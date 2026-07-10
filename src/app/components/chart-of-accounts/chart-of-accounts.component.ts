import { Component, OnInit } from '@angular/core';
import { NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { CoaTreeNode, CoaWizardData } from '../../models/chart-of-accounts.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { SqlConfirmDialogComponent } from '../sql-confirm-dialog/sql-confirm-dialog.component';
import { SecurityGroupService } from '../../services/security-group.service';
import { CoaViewSummaryDialogComponent } from '../coa-view-summary-dialog/coa-view-summary-dialog.component';

@Component({
  selector: 'app-chart-of-accounts',
  templateUrl: './chart-of-accounts.component.html',
  styleUrls: ['./chart-of-accounts.component.scss']
})
export class ChartOfAccountsComponent implements OnInit {
  currentView: 'hierarchy' | 'wizard' = 'hierarchy';

  treeControl = new NestedTreeControl<CoaTreeNode>(node => node.children);
  dataSource = new MatTreeNestedDataSource<CoaTreeNode>();

  private rawTreeData: CoaTreeNode[] = [];

  // Global search
  searchQuery = '';

  // Per-node inline search (company → accounts, account → transactions)
  nodeFilters: { [key: string]: string } = {};

  selectedNode: CoaTreeNode | null = null;
  isLoading = false;

  availableAccounts: { label: string; guid: string; accountNumber: string }[] = [];
  existingAccountNumbers: Set<string> = new Set<string>();

  wizardTitle = 'Create New Chart of Account';
  activeStepIndex = 0;
  isNewEntityMode = false;

  allSteps = [
    { id: 1, title: 'Chart of Account', subtitle: 'Company & Account details', icon: 'account_balance' },
    { id: 2, title: 'Account Entity', subtitle: 'Transaction & Suspense', icon: 'layers' },
    { id: 3, title: 'Accounting Entry', subtitle: 'Financial rules', icon: 'receipt_long' },
    { id: 4, title: 'Accounting Criteria', subtitle: 'Execution criteria', icon: 'rule' },
    { id: 5, title: 'Accounting Result', subtitle: 'Section bindings', icon: 'output' }
  ];
  wizardSteps = [...this.allSteps];

  companyOptions = ['Britam Holdings'];
  transactionOptions: string[] = []; // Fetched dynamically
  filteredTransactionOptions: string[] = [];
  creditDebitOptions = ['Credit', 'Debit'];
  typeOptions = ['MathVariable', 'By Fund', 'Disbursement', 'GeneralLedger'];
  
  fundTypeOptions = [
    { code: '01', label: 'Fixed' },
    { code: '02', label: 'Variable' },
    { code: '03', label: 'Fixed Benefit' },
    { code: '04', label: 'Unitized Fixed' },
    { code: '05', label: 'Non-Invest' },
    { code: '06', label: 'MVA' },
    { code: '07', label: 'DCA+ Fund' },
    { code: '09', label: 'IUL Index' },
    { code: '10', label: 'UnitLinkedVariable' }
  ];

  disbursementStatusOptions = [
    { code: '01', label: 'Active' },
    { code: '02', label: 'Pending' },
    { code: '12', label: 'Recoverable' },
    { code: '27', label: 'Recovered' },
    { code: '34', label: 'Pending Shadow' },
    { code: '44', label: 'Recovered Shadow' }
  ];

  formData: CoaWizardData = this.getInitialFormData();
  searchFilterType: string = 'Account Number';
  searchFilterOptions = ['Account Number', 'Transaction name', 'MathVariable', 'Clear Search'];
  accountExistsError: boolean = false;

  constructor(
    private coaService: ChartOfAccountsService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private securityGroupService: SecurityGroupService
  ) {}

  ngOnInit(): void {
    this.fetchTreeData();
    this.fetchTransactions();
  }

  fetchTransactions(): void {
    this.coaService.getTransactions().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          // data contains codeValue (guid) and description (name). We can just use the name for the dropdown
          this.transactionOptions = data.map(d => d.description);
          this.filteredTransactionOptions = [...this.transactionOptions];
        }
      },
      error: () => console.error('Failed to fetch transactions')
    });
  }

  filterTransactions(val: string): void {
    const q = (val || '').toLowerCase().trim();
    if (!q) {
      this.filteredTransactionOptions = [...this.transactionOptions];
    } else {
      this.filteredTransactionOptions = this.transactionOptions.filter(t => t.toLowerCase().includes(q));
    }
  }

  checkAccountExists(isBlur: boolean = false): void {
    if (this.formData.lockStep1) {
      this.accountExistsError = false;
      return;
    }
    const accNum = (this.formData.accountNumber || '').trim();
    if (!accNum) {
      this.accountExistsError = false;
      return;
    }
    
    // Check locally first for immediate feedback
    if (this.existingAccountNumbers.has(accNum)) {
      this.accountExistsError = true;
      return;
    }

    if (isBlur) {
      this.coaService.checkAccountExists(accNum).subscribe({
        next: (exists) => {
          this.accountExistsError = exists;
        },
        error: () => {
          this.accountExistsError = this.existingAccountNumbers.has(accNum);
        }
      });
    } else {
      this.accountExistsError = false;
    }
  }

  hasChild = (_: number, node: CoaTreeNode) => node.type !== 'entry';

  nodeKey(node: CoaTreeNode): string {
    return node.id || node.name;
  }

  fetchTreeData(): void {
    this.isLoading = true;
    this.coaService.getHierarchyTree().subscribe({
      next: (data) => {
        this.isLoading = false;
        if (data && data.length > 0) {
          // Skip root node — companies become top-level
          const companies = (data[0]?.type === 'root' && data[0].children) ? data[0].children : data;
          this.rawTreeData = companies;
          this.dataSource.data = companies;
          this.treeControl.expandAll();
          this.extractAvailableAccounts(companies);
        } else {
          this.loadMockTreeData();
        }
      },
      error: () => { this.isLoading = false; this.loadMockTreeData(); }
    });
  }

  loadMockTreeData(): void {
    const companies: CoaTreeNode[] = [
      {
        id: 'COMP-1', name: 'Britam Holdings', type: 'company', icon: 'domain',
        children: [
          {
            id: 'ACC-510116', name: '510116 - Premium Waiver', type: 'account', icon: 'receipt_long',
            details: { accountNumber: '510116', description: 'Premium Waiver', coaGuid: 'ACC-510116' },
            children: [
              {
                id: 'ENT-1', name: 'WoPPayment', type: 'transaction', icon: 'swap_horiz',
                details: { entityGuid: 'ENT-1', entityCode: '01', transactionName: 'WoPPayment', suspense: false },
                children: [
                  { id: 'EN-1', name: 'PremiumTax330505CreditMV', type: 'entry', icon: 'analytics' }
                ]
              }
            ]
          },
          {
            id: 'ACC-360201', name: '360201 - Premium Suspense', type: 'account', icon: 'receipt_long',
            details: { accountNumber: '360201', description: 'Premium Suspense', coaGuid: 'ACC-360201' },
            children: [
              {
                id: 'ENT-2', name: 'PremiumAllocation', type: 'transaction', icon: 'swap_horiz',
                details: { entityGuid: 'ENT-2', entityCode: '01', transactionName: 'PremiumAllocation', suspense: false },
                children: [
                  { id: 'EN-2', name: 'PremiumAllocationCreditMV', type: 'entry', icon: 'analytics' }
                ]
              },
              {
                id: 'ENT-3', name: 'InitialPremiumAllocation', type: 'transaction', icon: 'swap_horiz', 
                details: { entityGuid: 'ENT-3', entityCode: '02', transactionName: 'InitialPremiumAllocation', suspense: false },
                children: []
              }
            ]
          }
        ]
      }
    ];
    this.rawTreeData = companies;
    this.dataSource.data = companies;
    this.treeControl.expandAll();
    this.extractAvailableAccounts(companies);
  }

  extractAvailableAccounts(nodes: CoaTreeNode[]): void {
    this.availableAccounts = [];
    this.existingAccountNumbers = new Set<string>();
    const traverse = (list: CoaTreeNode[]) => {
      for (const n of list) {
        if (n.type === 'account' && n.details) {
          const accNum = n.details['accountNumber'] || '';
          this.availableAccounts.push({ label: n.name, guid: n.details['coaGuid'] || n.id || '', accountNumber: accNum });
          if (accNum) {
            this.existingAccountNumbers.add(accNum.trim());
          }
        }
        if (n.children) traverse(n.children);
      }
    };
    traverse(nodes);
  }

  onSearchFilterTypeChange(val: string): void {
    if (val === 'Clear Search') {
      this.searchFilterType = 'Account Number';
      this.searchQuery = '';
      this.applyFilter();
    } else {
      this.applyFilter();
    }
  }

  // Global search filter
  applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.dataSource.data = this.applyNodeFiltersToTree(this.rawTreeData);
      this.treeControl.expandAll();
      return;
    }

    let filtered: CoaTreeNode[] = [];
    if (this.searchFilterType === 'Account Number') {
      filtered = this.filterTreeByAccount(this.rawTreeData, q);
    } else if (this.searchFilterType === 'Transaction name') {
      filtered = this.filterTreeByTransaction(this.rawTreeData, q);
    } else if (this.searchFilterType === 'MathVariable') {
      filtered = this.filterTreeByMathVariable(this.rawTreeData, q);
    } else {
      filtered = this.filterNodes(this.rawTreeData, q);
    }

    this.dataSource.data = filtered;
    this.treeControl.expandAll();
  }

  private filterTreeByAccount(nodes: CoaTreeNode[], q: string): CoaTreeNode[] {
    const result: CoaTreeNode[] = [];
    for (const n of nodes) {
      if (n.type === 'company') {
        const matchedAccounts = n.children ? this.filterTreeByAccount(n.children, q) : [];
        if (matchedAccounts.length > 0) {
          result.push({ ...n, children: matchedAccounts });
        }
      } else if (n.type === 'account') {
        const match = n.name.toLowerCase().includes(q);
        if (match) {
          result.push({ ...n });
        }
      }
    }
    return result;
  }

  private filterTreeByTransaction(nodes: CoaTreeNode[], q: string): CoaTreeNode[] {
    const result: CoaTreeNode[] = [];
    for (const n of nodes) {
      if (n.type === 'company' || n.type === 'account') {
        const matchedChildren = n.children ? this.filterTreeByTransaction(n.children, q) : [];
        if (matchedChildren.length > 0) {
          result.push({ ...n, children: matchedChildren });
        }
      } else if (n.type === 'transaction') {
        const match = n.name.toLowerCase().includes(q);
        if (match) {
          result.push({ ...n });
        }
      }
    }
    return result;
  }

  private filterTreeByMathVariable(nodes: CoaTreeNode[], q: string): CoaTreeNode[] {
    const result: CoaTreeNode[] = [];
    for (const n of nodes) {
      if (n.type === 'company' || n.type === 'account' || n.type === 'transaction') {
        const matchedChildren = n.children ? this.filterTreeByMathVariable(n.children, q) : [];
        if (matchedChildren.length > 0) {
          result.push({ ...n, children: matchedChildren });
        }
      } else if (n.type === 'entry') {
        const isMV = n.details?.accountingTypeCode === '03';
        const match = isMV && n.name.toLowerCase().includes(q);
        if (match) {
          result.push({ ...n });
        }
      }
    }
    return result;
  }

  private filterNodes(nodes: CoaTreeNode[], q: string): CoaTreeNode[] {
    const result: CoaTreeNode[] = [];
    for (const n of nodes) {
      const match = n.name.toLowerCase().includes(q);
      const childFiltered = n.children ? this.filterNodes(n.children, q) : [];
      if (match || childFiltered.length > 0) {
        result.push({ ...n, children: childFiltered.length > 0 ? childFiltered : n.children });
      }
    }
    return result;
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applyFilter();
  }

  // Per-node search (company→accounts, account→transactions)
  applyNodeFilter(node: CoaTreeNode): void {
    const rebuilt = this.applyNodeFiltersToTree(this.rawTreeData);
    this.dataSource.data = rebuilt;
    this.treeControl.expandAll();
  }

  clearNodeFilter(node: CoaTreeNode): void {
    delete this.nodeFilters[this.nodeKey(node)];
    this.applyNodeFilter(node);
  }

  private applyNodeFiltersToTree(nodes: CoaTreeNode[]): CoaTreeNode[] {
    return nodes.map(n => {
      const key = this.nodeKey(n);
      const filterVal = (this.nodeFilters[key] || '').toLowerCase().trim();
      let children = n.children ? this.applyNodeFiltersToTree(n.children) : undefined;
      if (filterVal && children) {
        children = children.filter(c => c.name.toLowerCase().includes(filterVal));
      }
      return { ...n, children };
    });
  }

  selectTreeNode(node: CoaTreeNode): void {
    this.selectedNode = this.selectedNode === node ? null : node;
  }

  openViewSummary(node: CoaTreeNode): void {
    this.selectedNode = node;
    this.isLoading = true;
    
    let fetchObs$ = null;
    if (node.type === 'transaction') {
      const entityGuid = node.details?.entityGuid || node.id;
      if (entityGuid) {
        fetchObs$ = this.coaService.getFullConfigByEntity(entityGuid);
      }
    } else if (node.type === 'entry') {
      if (node.id) {
        fetchObs$ = this.coaService.getFullConfig(node.id);
      }
    } else {
      const firstTxn = this.findFirstChildOfType(node, 'transaction');
      if (firstTxn) {
        const entityGuid = firstTxn.details?.entityGuid || firstTxn.id;
        if (entityGuid) {
          fetchObs$ = this.coaService.getFullConfigByEntity(entityGuid);
        }
      }
    }
    
    if (!fetchObs$) {
      this.isLoading = false;
      this.snackBar.open('No configuration found to view.', 'Close', { duration: 3000 });
      return;
    }
    
    fetchObs$.subscribe({
      next: (config) => {
        this.isLoading = false;
        this.dialog.open(CoaViewSummaryDialogComponent, { data: config, width: '800px', maxHeight: '90vh', panelClass: 'custom-dialog-container' });
        this.snackBar.open(`Fetched config for ${node.name}`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.isLoading = false;
        this.snackBar.open('Failed to load configuration.', 'Close', { duration: 3000 });
      }
    });
  }

  private findFirstChildOfType(node: CoaTreeNode, type: string): CoaTreeNode | null {
    if (node.type === type) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this.findFirstChildOfType(child, type);
        if (found) return found;
      }
    }
    return null;
  }

  openCreateWizard(): void {
    this.isNewEntityMode = false;
    this.wizardTitle = 'Create New Chart of Account';
    this.wizardSteps = [...this.allSteps];
    this.formData = this.getInitialFormData();
    this.formData.accountNumber = '';
    this.formData.accountDescription = '';
    this.formData.isNewEntityOnly = false;
    this.formData.lockStep1 = false;
    this.formData.lockStep2 = false;
    this.formData.lockStep3 = false;
    this.filteredTransactionOptions = [...this.transactionOptions];
    this.accountExistsError = false;
    this.goToFirstUnlockedStep();
    this.currentView = 'wizard';
  }

  openCreateEntityWizard(node?: CoaTreeNode): void {
    this.isNewEntityMode = true;
    this.wizardTitle = 'Add New Entity';
    this.wizardSteps = [...this.allSteps]; // Show all steps
    this.formData = this.getInitialFormData();
    this.formData.isNewEntityOnly = true;
    this.formData.transaction = '';
    this.formData.lockStep1 = true;
    this.formData.lockStep2 = false;
    this.formData.lockStep3 = false;
    this.filteredTransactionOptions = [...this.transactionOptions];
    this.accountExistsError = false;
    const target = node || this.selectedNode;
    if (target?.type === 'account' && target.details) {
      this.formData.accountNumber = target.details['accountNumber'] || '';
      this.formData.accountDescription = target.details['description'] || '';
      this.formData.existingAccountGuid = target.details['coaGuid'] || '';
    }
    this.goToFirstUnlockedStep();
    this.currentView = 'wizard';
  }

  openCreateEntryWizard(node: CoaTreeNode): void {
    this.isNewEntityMode = false;
    this.wizardTitle = `Add Entry under ${node.name}`;
    this.wizardSteps = [...this.allSteps];
    this.formData = this.getInitialFormData();
    this.formData.isNewEntityOnly = false;
    this.formData.editMode = false;
    this.formData.lockStep1 = true;
    this.formData.lockStep2 = true;
    this.formData.lockStep3 = false;
    this.filteredTransactionOptions = [...this.transactionOptions];
    this.accountExistsError = false;

    if (node.details) {
      this.formData.transaction = node.details['transactionName'] || node.name;
    } else {
      this.formData.transaction = node.name;
    }

    const parentAccount = this.findParentAccountOfNode(this.rawTreeData, node);
    if (parentAccount && parentAccount.details) {
      this.formData.accountNumber = parentAccount.details['accountNumber'] || '';
      this.formData.accountDescription = parentAccount.details['description'] || '';
      this.formData.existingAccountGuid = parentAccount.details['coaGuid'] || '';
    }

    this.goToFirstUnlockedStep();
    this.currentView = 'wizard';
  }

  private findParentAccountOfNode(nodes: CoaTreeNode[], targetNode: CoaTreeNode): CoaTreeNode | null {
    for (const n of nodes) {
      if (n.type === 'account' && n.children) {
        if (n.children.some(child => child.id === targetNode.id || child.name === targetNode.name)) {
          return n;
        }
      }
      if (n.children) {
        const parent = this.findParentAccountOfNode(n.children, targetNode);
        if (parent) return parent;
      }
    }
    return null;
  }

  onAccountSelect(guid: string): void {
    const acc = this.availableAccounts.find(a => a.guid === guid);
    if (acc) { this.formData.accountNumber = acc.accountNumber; this.formData.existingAccountGuid = acc.guid; }
  }

  openEditWizard(node?: CoaTreeNode): void {
    this.isNewEntityMode = false;
    const t = node || this.selectedNode;
    let entryId: string | null = null;
    if (t) {
      if (t.type === 'entry') {
        entryId = t.id || null;
      } else {
        entryId = t.children && t.children.length > 0 ? t.children[0].id || null : null;
      }
    }
    if (!entryId) {
      this.snackBar.open('No entry found to edit.', 'Close', { duration: 3000 });
      return;
    }
    
    this.isLoading = true;
    this.coaService.getFullConfig(entryId).subscribe({
      next: (config) => {
        this.isLoading = false;
        this.wizardTitle = t ? `Edit: ${t.name}` : 'Edit Configuration';
        this.wizardSteps = [...this.allSteps];
        this.formData = this.getInitialFormData();
        this.accountExistsError = false;
        
        // Map backend config to wizard form data
        this.formData.editMode = true;
        this.formData.lockStep1 = true;
        this.formData.lockStep2 = true;
        this.formData.lockStep3 = false;
        this.formData.entryGuid = config.entryGuid;
        this.formData.entityGuid = config.entityGuid;
        this.formData.coaGuid = config.coaGuid;
        
        this.formData.accountNumber = config.accountNumber;
        this.formData.accountDescription = config.accountDescription;
        this.formData.primaryCompany = 'Britam Holdings'; // Mock or map if available
        
        this.formData.transaction = config.transactionName;
        this.filteredTransactionOptions = [...this.transactionOptions];
        this.formData.suspense = config.linkSuspenseFlag === '1';
        
        this.formData.creditDebit = config.debitCreditLabel;
        this.formData.type = config.accountingTypeLabel;
        this.formData.accountingAmount = config.accountingAmountField || '';
        this.formData.entryDescription = config.entryDescription || '';
        this.formData.gainLoss = config.gainLossFlag === '1';
        this.formData.flipOnNegative = config.flipOnNegativeFlag === '1';
        this.formData.doReversalAccounting = config.doReversalAccountingFlag === '1';
        this.formData.originalDisbursementStatus = config.originalDisbursementStatusCode || '';
        this.formData.fundType = config.fundTypeCode || '';
        this.formData.effectiveFromDate = config.effectiveFromDate ? new Date(config.effectiveFromDate) : '';
        this.formData.effectiveToDate = config.effectiveToDate ? new Date(config.effectiveToDate) : '';
        
        const hasWriteAcc = config.criteriaList && config.criteriaList.some((c: any) => c.criteria === 'WriteAccounting' && c.value === '01');
        this.formData.writeAccounting = !!hasWriteAcc;
        
        // Results
        if (config.resultList) {
          const rList: string[] = config.resultList;
          this.formData.resultSelections.branchSection = rList.find((r: string) => r.includes('Branch')) || '';
          this.formData.resultSelections.departmentSection = rList.find((r: string) => r.includes('Department')) || '';
          this.formData.resultSelections.productSection = rList.find((r: string) => r.includes('Product')) || '';
          this.formData.resultSelections.channelSection = rList.find((r: string) => r.includes('Channel')) || '';
          this.formData.resultSelections.lobSection = rList.find((r: string) => r.includes('LOB')) || '';
          this.formData.resultSelections.company = rList.includes('Company');
          this.formData.resultSelections.defaultBranchID = rList.includes('DefaultBranchID');
        }
        
        this.goToFirstUnlockedStep();
        this.currentView = 'wizard';
      },
      error: () => {
        this.isLoading = false;
        this.snackBar.open('Failed to load configuration.', 'Close', { duration: 3000 });
      }
    });
  }

  goToFirstUnlockedStep(): void {
    let index = 0;
    for (let i = 0; i < this.wizardSteps.length; i++) {
      if (!this.isStepLocked(i)) {
        index = i;
        break;
      }
    }
    this.activeStepIndex = index;
  }

    backToHierarchy(): void { this.currentView = 'hierarchy'; }

  validateCurrentStep(callback: (isValid: boolean) => void): void {
    if (this.currentStepId === 1) {
      if (!this.formData.accountNumber?.trim()) {
        this.snackBar.open('Account Number is mandatory.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }
      if (!this.formData.accountDescription?.trim()) {
        this.snackBar.open('Account Description is mandatory.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }
      if (this.formData.lockStep1) {
        this.accountExistsError = false;
        callback(true);
        return;
      }

      const accNum = this.formData.accountNumber.trim();
      
      // Local check first
      if (this.existingAccountNumbers.has(accNum)) {
        this.accountExistsError = true;
        this.snackBar.open('Cannot proceed: Account Number already exists.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }

      this.isLoading = true;
      this.coaService.checkAccountExists(accNum).subscribe({
        next: (exists) => {
          this.isLoading = false;
          this.accountExistsError = exists;
          if (exists) {
            this.snackBar.open('Cannot proceed: Account Number already exists.', 'Close', { duration: 3000 });
            callback(false);
          } else {
            callback(true);
          }
        },
        error: () => {
          this.isLoading = false;
          const exists = this.existingAccountNumbers.has(accNum);
          this.accountExistsError = exists;
          if (exists) {
            this.snackBar.open('Cannot proceed: Account Number already exists.', 'Close', { duration: 3000 });
            callback(false);
          } else {
            callback(true);
          }
        }
      });
      return;
    }
    if (this.currentStepId === 2) {
      if (!this.formData.transaction?.trim()) {
        this.snackBar.open('Transaction selection is mandatory.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }
    }
    if (this.currentStepId === 3) {
      if (!this.formData.entryDescription?.trim()) {
        this.snackBar.open('Entry Description is mandatory.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }
      if (this.formData.type === 'MathVariable' && !this.formData.accountingAmount?.trim()) {
        this.snackBar.open('Accounting Amount is mandatory for MathVariable type.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }
      if (!this.formData.effectiveFromDate) {
        this.snackBar.open('Effective From date is mandatory.', 'Close', { duration: 3000 });
        callback(false);
        return;
      }
    }
    callback(true);
  }

  setStep(i: number): void {
    if (i >= 0 && i < this.wizardSteps.length) {
      if (i > this.activeStepIndex) {
        if (i === this.activeStepIndex + 1) {
          this.validateCurrentStep((isValid) => {
            if (isValid) {
              this.activeStepIndex = i;
            }
          });
        } else {
          this.snackBar.open('Please use the Next button to navigate forward step-by-step.', 'Close', { duration: 3000 });
        }
      } else {
        this.activeStepIndex = i;
      }
    }
  }

  nextStep(): void {
    this.setStep(this.activeStepIndex + 1);
  }

  prevStep(): void {
    if (this.activeStepIndex > 0) this.activeStepIndex--;
  }

  get currentStepId(): number { return this.wizardSteps[this.activeStepIndex]?.id ?? 1; }
  get isFirstStep(): boolean { return this.activeStepIndex === 0; }
  get isLastStep(): boolean { return this.wizardSteps.length > 0 && this.activeStepIndex === this.wizardSteps.length - 1; }
  isStepCompleted(i: number): boolean { return i < this.activeStepIndex; }
  isStepActive(i: number): boolean { return i === this.activeStepIndex; }
  isStepLocked(i: number): boolean {
    if (i === 0) return this.formData?.lockStep1 || false;
    if (i === 1) return this.formData?.lockStep2 || false;
    if (i === 2) return this.formData?.lockStep3 || false;
    return false;
  }

  getInitialFormData(): CoaWizardData {
    return {
      primaryCompany: 'Britam Holdings', accountNumber: '', accountDescription: '',
      transaction: '', suspense: false, effectiveFromDate: new Date(1990, 0, 1), effectiveToDate: '',
      entryDescription: '', creditDebit: 'Credit', type: 'MathVariable',
      gainLoss: false, flipOnNegative: false, accountingAmount: '',
      fundType: '', originalDisbursementStatus: '', doReversalAccounting: true,
      writeAccounting: true,
      resultSelections: { branchSection: 'Branch', departmentSection: 'Department', productSection: 'Product', channelSection: 'Channel', lobSection: 'LOB', company: true, defaultBranchID: false },
      isNewEntityOnly: false, existingAccountGuid: '', lockStep1: false, lockStep2: false, lockStep3: false
    };
  }

  saveConfiguration(): void {
    this.validateCurrentStep((isValid) => {
      if (!isValid) return;
      
      this.formData.lastConfiguredStep = this.currentStepId;
      this.isLoading = true;
      this.coaService.saveConfiguration(this.formData).subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res?.scripts?.length > 0) {
            const dialogRef = this.dialog.open(SqlConfirmDialogComponent, {
              width: '650px',
              data: { title: 'Confirm SQL Queries', subtitle: 'Review generated SQL before applying.', script: res.scripts.join('\n'), confirmLabel: 'Confirm & Apply' }
            });
            dialogRef.afterClosed().subscribe(confirm => {
              if (confirm) {
                this.isLoading = true;
                this.securityGroupService.executeScripts(res.scripts).subscribe({
                  next: () => {
                    this.isLoading = false;
                    this.snackBar.open(this.isNewEntityMode ? 'Entity added!' : 'Configuration saved!', 'Close', { duration: 4000 });
                    this.fetchTreeData();
                    this.currentView = 'hierarchy';
                  },
                  error: (err) => { this.isLoading = false; this.snackBar.open(err?.error?.message || 'Failed to execute.', 'Close', { duration: 4000 }); }
                });
              }
            });
          } else { this.snackBar.open('No SQL generated.', 'Close', { duration: 3000 }); }
        },
        error: () => { this.isLoading = false; this.snackBar.open('Failed to generate SQL.', 'Close', { duration: 4000 }); }
      });
    });
  }
}
