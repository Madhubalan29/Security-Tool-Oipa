import { Component, OnInit, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { LookupService } from '../../services/lookup.service';
import { SecurityGroupService } from '../../services/security-group.service';
import { SecurityStateService, PersistedConfigState } from '../../services/security-state.service';
import {
  SecurityGroupRequestDto,
  CompanyDto,
  CompanyPageDto,
  CompanyInquiryDto,
  CompanyWebServiceDto,
  ProductDto,
  ProductPageDto,
  ProductTransactionDto,
  PlanDto,
  PlanPageDto,
  PlanTransactionDto,
  ButtonDto,
  MigrationScriptDto
} from '../../models/security-group.model';
import {
  AsCompany, AsAuthPage, AsAuthButton, AsProduct, AsPlan,
  AsTransaction, AsInquiryScreen, AsWebService
} from '../../models/lookup.model';

interface CompanyConfig {
  company: AsCompany;
  selected: boolean;
  loaded: boolean;
  companyPages: CompanyPageDto[];
  companyInquiries: (CompanyInquiryDto & { name?: string })[];
  companyWebServices: (CompanyWebServiceDto & { name?: string })[];
  products: ProductConfig[];
  plans: PlanConfig[];
  availableProducts: AsProduct[];
  availablePlans: AsPlan[];
  pageFilter?: string;
  inquiryFilter?: string;
  webServiceFilter?: string;
  configured?: boolean;
}

interface ProductConfig {
  productGuid: string;
  name?: string;
  selected: boolean;
  productPages: CompanyPageDto[];
  productTransactions: (ProductTransactionDto & { name?: string })[];
  pageFilter?: string;
  txnFilter?: string;
  configured?: boolean;
}

interface PlanConfig {
  planGuid: string;
  name?: string;
  selected: boolean;
  planPages: CompanyPageDto[];
  planTransactions: (PlanTransactionDto & { name?: string })[];
  productPlanTransactions?: (PlanTransactionDto & { name?: string })[];
  planInquiries: (CompanyInquiryDto & { name?: string })[];
  pageFilter?: string;
  txnFilter?: string;
  configured?: boolean;
}

export interface DialogFilterNode {
  id: string;
  name: string;
  type: 'company' | 'company_level' | 'product' | 'plan' | 'company_level_pages' | 'product_pages' | 'product_transactions' | 'plan_pages' | 'plan_transactions' | 'page' | 'transaction' | 'button' | 'company_inquiries' | 'company_webservices' | 'plan_inquiries' | 'inquiry' | 'webservice';
  checked: boolean;
  expanded?: boolean;
  companyGuid: string;
  productGuid?: string;
  planGuid?: string;
  pageGuid?: string;
  transactionGuid?: string;
  buttonGuid?: string;
  inquiryGuid?: string;
  webserviceGuid?: string;
  children?: DialogFilterNode[];
}

export interface HierarchicalDiffNode {
  name: string;
  type?: 'add' | 'remove' | 'mixed';
  icon?: string;
  children?: HierarchicalDiffNode[];
}


/** Case-insensitive GUID comparison */
function guidEq(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  return a.toUpperCase() === b.toUpperCase();
}

@Component({
  selector: 'app-security-config',
  templateUrl: './security-config.component.html',
  styleUrls: ['./security-config.component.scss']
})
export class SecurityConfigComponent implements OnInit, OnDestroy {
  @ViewChild('inheritDialogTemplate') inheritDialogTemplate!: TemplateRef<any>;
  @ViewChild('scriptsDialogTemplate') scriptsDialogTemplate!: TemplateRef<any>;
  @ViewChild('statusDialogTemplate') statusDialogTemplate!: TemplateRef<any>;

  // Master data
  allCompanies: AsCompany[] = [];
  allPages: AsAuthPage[] = [];
  allButtons: AsAuthButton[] = [];
  allWebServices: AsWebService[] = [];

  // Company configs state
  companyConfigs: CompanyConfig[] = [];

  // State
  mode: string = 'create';
  groupName: string = '';
  groupGuid: string = '';
  isLoading = true;
  isSaving = false;
  isSubLoading = false;
  activeStep = 0; // 0 = company selection, 1 = configuration
  activeCompanyIndex = 0;
  activeTabIndex = 0;
  viewType: 'tree' | 'tabs' = 'tree';
  expandedNodes: { [key: string]: boolean } = {};

  // Selection state for add-entity dropdowns
  selectedProductToAdd: AsProduct | null = null;
  selectedPlanToAdd: AsPlan | null = null;

  // Existing config for modify mode
  existingPayload: SecurityGroupRequestDto | null = null;

  // Base configuration to filter available selections
  baseConfig: SecurityGroupRequestDto | null = null;

  // Flag to track if we restored from persisted state
  private restoredFromStorage = false;

  // Cached selected companies array (avoids recalculating on every CD cycle)
  private _selectedCompanies: CompanyConfig[] = [];

  // ── Feature 4: Search/filter state ──
  pageFilter = '';
  inquiryFilter = '';
  webServiceFilter = '';
  productPageFilter = '';
  productTxnFilter = '';
  planPageFilter = '';
  planTxnFilter = '';

  // ── Feature 6: Button filter & bulk button actions ──
  buttonFilter = '';

  // Company pages bulk button action
  bulkCompanyButtonGuid = '';
  bulkCompanyButtonTarget: 'pages' = 'pages';

  // Product bulk button action
  bulkProductButtonGuid = '';
  bulkProductButtonTarget: 'pages' | 'txns' | 'both' = 'both';

  // Plan bulk button action
  bulkPlanButtonGuid = '';
  bulkPlanButtonTarget: 'pages' | 'txns' | 'both' = 'both';

  productButtonSearchQuery = '';
  planButtonSearchQuery = '';
  companyButtonSearchQuery = '';

  // ── Feature 3: Clone source ──
  cloneSourceGuid = '';
  copied = false;
  sqlFilterText = '';
  dialogFilterNodes: DialogFilterNode[] = [];
  allDialogScripts: MigrationScriptDto[] = [];
  authTxnToTxnMap = new Map<string, string>();
  authPageToPageMap = new Map<string, string>();

  // Union maps and sets derived from IT Admin (baseConfig)
  unionCompanyPages = new Map<string, Set<string>>(); // pageGuid -> Set of buttonGuids
  unionProductPages = new Map<string, Set<string>>(); // pageGuid -> Set of buttonGuids
  unionPlanPages = new Map<string, Set<string>>(); // pageGuid -> Set of buttonGuids
  unionProductTxnButtons = new Map<string, Set<string>>(); // transactionGuid -> Set of buttonGuids
  unionPlanTxnButtons = new Map<string, Set<string>>(); // transactionGuid -> Set of buttonGuids
  unionAllPageButtons = new Set<string>(); // Set of all buttonGuids across all pages
  unionAllTxnButtons = new Set<string>();  // Set of all buttonGuids across all transactions

  computeBaseConfigUnions(): void {
    this.unionCompanyPages.clear();
    this.unionProductPages.clear();
    this.unionPlanPages.clear();
    this.unionProductTxnButtons.clear();
    this.unionPlanTxnButtons.clear();
    this.unionAllPageButtons.clear();
    this.unionAllTxnButtons.clear();

    if (!this.baseConfig || !this.baseConfig.securityGroup || !this.baseConfig.securityGroup.companies) {
      return;
    }

    this.baseConfig.securityGroup.companies.forEach(company => {
      // 1. Company Pages & Buttons
      if (company.companyPages) {
        company.companyPages.forEach(cp => {
          const pageGuid = cp.pageGuid.toUpperCase();
          if (!this.unionCompanyPages.has(pageGuid)) {
            this.unionCompanyPages.set(pageGuid, new Set<string>());
          }
          const buttonSet = this.unionCompanyPages.get(pageGuid)!;
          if (cp.buttons) {
            cp.buttons.forEach(b => {
              const bGuid = b.buttonGuid.toUpperCase();
              buttonSet.add(bGuid);
              this.unionAllPageButtons.add(bGuid);
            });
          }
        });
      }

      // 2. Product Pages & Transaction Buttons
      if (company.products) {
        company.products.forEach(prod => {
          if (prod.productPages) {
            prod.productPages.forEach(pp => {
              const pageGuid = pp.pageGuid.toUpperCase();
              if (!this.unionProductPages.has(pageGuid)) {
                this.unionProductPages.set(pageGuid, new Set<string>());
              }
              const buttonSet = this.unionProductPages.get(pageGuid)!;
              if (pp.buttons) {
                pp.buttons.forEach(b => {
                  const bGuid = b.buttonGuid.toUpperCase();
                  buttonSet.add(bGuid);
                  this.unionAllPageButtons.add(bGuid);
                });
              }
            });
          }

          if (prod.productTransactions) {
            prod.productTransactions.forEach(pt => {
              const txnGuid = pt.transactionGuid.toUpperCase();
              if (!this.unionProductTxnButtons.has(txnGuid)) {
                this.unionProductTxnButtons.set(txnGuid, new Set<string>());
              }
              const buttonSet = this.unionProductTxnButtons.get(txnGuid)!;
              if (pt.buttons) {
                pt.buttons.forEach(b => {
                  const bGuid = b.buttonGuid.toUpperCase();
                  buttonSet.add(bGuid);
                  this.unionAllTxnButtons.add(bGuid);
                });
              }
            });
          }
        });
      }

      // 3. Plan Pages & Transaction Buttons
      if (company.plans) {
        company.plans.forEach(plan => {
          if (plan.planPages) {
            plan.planPages.forEach(pp => {
              const pageGuid = pp.pageGuid.toUpperCase();
              if (!this.unionPlanPages.has(pageGuid)) {
                this.unionPlanPages.set(pageGuid, new Set<string>());
              }
              const buttonSet = this.unionPlanPages.get(pageGuid)!;
              if (pp.buttons) {
                pp.buttons.forEach(b => {
                  const bGuid = b.buttonGuid.toUpperCase();
                  buttonSet.add(bGuid);
                  this.unionAllPageButtons.add(bGuid);
                });
              }
            });
          }

          if (plan.planTransactions) {
            plan.planTransactions.forEach(pt => {
              const txnGuid = pt.transactionGuid.toUpperCase();
              if (!this.unionPlanTxnButtons.has(txnGuid)) {
                this.unionPlanTxnButtons.set(txnGuid, new Set<string>());
              }
              const buttonSet = this.unionPlanTxnButtons.get(txnGuid)!;
              if (pt.buttons) {
                pt.buttons.forEach(b => {
                  const bGuid = b.buttonGuid.toUpperCase();
                  buttonSet.add(bGuid);
                  this.unionAllTxnButtons.add(bGuid);
                });
              }
            });
          }
        });
      }
    });
  }

  constructor(
    private router: Router,
    private lookupService: LookupService,
    private securityGroupService: SecurityGroupService,
    private stateService: SecurityStateService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.mode = this.stateService.currentMode;
    this.groupGuid = this.stateService.currentGuid;
    this.groupName = this.stateService.currentGroupName;
    this.cloneSourceGuid = this.stateService.cloneSourceGuid || '';

    if (!this.groupGuid) {
      this.router.navigate(['/security-group']);
      return;
    }

    // Load master data
    forkJoin({
      companies: this.lookupService.getCompanies(),
      pages: this.lookupService.getPages(),
      buttons: this.lookupService.getButtons(),
      webServices: this.lookupService.getWebServices(),
      baseConfig: this.securityGroupService.getGroupConfig('C526D685-71B7-43B2-A99D-D3B76151A2AD').pipe(
        catchError(err => {
          console.error('Failed to load base configuration, proceeding without restriction:', err);
          return of(null);
        })
      )
    }).subscribe({
      next: (data) => {
        this.allCompanies = data.companies;
        this.allPages = data.pages;
        this.allButtons = data.buttons;
        this.allWebServices = data.webServices;
        this.baseConfig = data.baseConfig;
        this.computeBaseConfigUnions();

        // Try to restore persisted state first
        const persisted = this.stateService.loadConfigState();
        if (persisted && persisted.companyConfigs && persisted.companyConfigs.length > 0) {
          this.restoreFromPersistedState(persisted);
        } else {
          // Initialize company configs from scratch
          let companiesToUse = this.allCompanies;
          this.companyConfigs = companiesToUse.map(c => ({
            company: c,
            selected: false,
            loaded: false,
            companyPages: [],
            companyInquiries: [],
            companyWebServices: [],
            products: [],
            plans: [],
            availableProducts: [],
            availablePlans: []
          }));

          // If modify or view mode, fetch existing config
          if ((this.mode === 'modify' || this.mode === 'view') && this.groupGuid) {
            this.loadExistingConfig();
          } else if (this.mode === 'clone' && this.cloneSourceGuid) {
            this.loadCloneSourceConfig();
          } else {
            this.updateSelectedCompanies();
            this.isLoading = false;
          }
        }
      },
      error: (err) => {
        console.error('Failed to load master data:', err);
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy(): void {
  }

  /**
   * Restore the full UI state from sessionStorage-persisted data.
   * availableProducts / availablePlans are re-fetched from the API
   * since they are lookup data that doesn't need to be stored.
   */
  private restoreFromPersistedState(persisted: PersistedConfigState): void {
    this.restoredFromStorage = true;
    this.activeStep = persisted.activeStep;
    this.activeCompanyIndex = persisted.activeCompanyIndex;
    this.activeTabIndex = persisted.activeTabIndex;

    // Rebuild companyConfigs by merging master data with persisted selections
    let companiesToUse = this.allCompanies;

    this.companyConfigs = companiesToUse.map(company => {
      const saved = persisted.companyConfigs.find(
        (sc: any) => guidEq(sc.companyGuid, company.companyGuid)
      );

      if (saved) {
        const config: CompanyConfig = {
          company,
          selected: saved.selected || false,
          loaded: saved.loaded || false,
          companyPages: saved.companyPages || [],
          companyInquiries: saved.companyInquiries || [],
          companyWebServices: saved.companyWebServices || [],
          products: saved.products || [],
          plans: saved.plans || [],
          availableProducts: [],
          availablePlans: []
        };

        // Re-fetch available products & plans from the API for loaded companies
        if (config.selected || config.loaded) {
          this.lookupService.getProductsByCompany(company.companyGuid)
            .subscribe(products => config.availableProducts = products);

          this.lookupService.getPlansByCompany(company.companyGuid)
            .subscribe(plans => config.availablePlans = plans);
        }

        return config;
      }

      return {
        company,
        selected: false,
        loaded: false,
        companyPages: [],
        companyInquiries: [],
        companyWebServices: [],
        products: [],
        plans: [],
        availableProducts: [],
        availablePlans: []
      };
    });

    // Update the cached selectedCompanies
    this.updateSelectedCompanies();

    // If modify mode, also load the existing payload for reference
    if (this.mode === 'modify' && this.groupGuid) {
      this.securityGroupService.getGroupConfig(this.groupGuid).subscribe({
        next: (payload) => {
          this.existingPayload = payload;
          this.isLoading = false;
        },
        error: () => this.isLoading = false
      });
    } else {
      this.isLoading = false;
    }
  }

  private loadExistingConfig(): void {
    this.securityGroupService.getGroupConfig(this.groupGuid).subscribe({
      next: (payload) => {
        this.existingPayload = payload;
        this.groupName = payload.securityGroup.groupName;

        // Pre-select companies that exist in the payload
        if (payload.securityGroup.companies) {
          payload.securityGroup.companies.forEach(payloadCompany => {
            const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, payloadCompany.companyGuid));
            if (config) {
              config.selected = true;
            }
          });
        }
        this.updateSelectedCompanies();
        
        if (this.mode === 'view') {
          this.viewType = 'tree';
          this.proceedToConfiguration();
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load existing config:', err);
        this.isLoading = false;
      }
    });
  }

  // ── Step 1: Company Selection ──
  toggleCompany(config: CompanyConfig): void {
    config.selected = !config.selected;
    this.updateSelectedCompanies();

  }

  get selectedCompanies(): CompanyConfig[] {
    return this._selectedCompanies;
  }

  get viewCompanies(): CompanyConfig[] {
    if (this.mode === 'view') {
      return this.companyConfigs.filter(c => c.configured);
    }
    return this.selectedCompanies;
  }

  get activeConfig(): CompanyConfig | null {
    if (this._selectedCompanies && this._selectedCompanies.length > 0) {
      return this._selectedCompanies[this.activeCompanyIndex] || null;
    }
    return null;
  }

  switchCompany(index: number): void {
    this.activeCompanyIndex = index;
    this.clearAllFilters();

  }

  /** Recompute the cached selectedCompanies array. Call after any selection change. */
  private updateSelectedCompanies(): void {
    this._selectedCompanies = this.companyConfigs.filter(c => c.selected);
  }

  proceedToConfiguration(): void {
    if (this.selectedCompanies.length === 0) return;

    this.isSubLoading = true;

    // Collect companies that need initialization
    const toInit = this.selectedCompanies.filter(c => !c.loaded);

    if (toInit.length === 0) {
      this.isSubLoading = false;
      this.activeStep = 1;
      this.activeCompanyIndex = 0;
      if (this.mode === 'view') {
        this.deselectAllForMigration();
      }
      return;
    }

    // Track completion of all init API calls
    let completed = 0;
    toInit.forEach(config => {
      this.initCompanyConfig(config, () => {
        completed++;
        if (completed >= toInit.length) {
          this.isSubLoading = false;
          this.activeStep = 1;
          this.activeCompanyIndex = 0;
          if (this.mode === 'view') {
            this.deselectAllForMigration();
          }
        }
      });
    });
  }

  private initCompanyConfig(config: CompanyConfig, onComplete?: () => void): void {
    const companyGuid = config.company.companyGuid;
    const hasBase = !!this.baseConfig;

    // Init pages with buttons
    let pagesToMap = this.allPages;
    if (hasBase) {
      pagesToMap = this.allPages.filter(p => this.unionCompanyPages.has(p.pageGuid.toUpperCase()));
    }

    config.companyPages = pagesToMap.map(p => {
      const pageGuidUpper = p.pageGuid.toUpperCase();
      let buttonsToMap = this.allButtons;
      if (hasBase) {
        buttonsToMap = this.allButtons.filter(b => this.unionAllPageButtons.has(b.buttonGuid.toUpperCase()));
      }
      return {
        pageGuid: p.pageGuid,
        name: p.pageName,
        selected: false,
        buttons: buttonsToMap.map(b => ({
          buttonGuid: b.buttonGuid,
          name: b.buttonName,
          selected: false
        }))
      };
    });

    // Init web services
    let wsToMap = this.allWebServices;

    config.companyWebServices = wsToMap.map(ws => ({
      webServiceGuid: ws.webServiceGuid,
      name: ws.webServiceName,
      selected: false
    }));

    // Load inquiry screens + products + plans in parallel, then signal completion
    forkJoin({
      screens: this.lookupService.getInquiryScreens(companyGuid),
      products: this.lookupService.getProductsByCompany(companyGuid),
      plans: this.lookupService.getPlansByCompany(companyGuid)
    }).subscribe({
      next: (res) => {
        let screensToMap = res.screens;

        config.companyInquiries = screensToMap.map(s => ({
          inquiryScreenNameGuid: s.inquiryScreenGuid,
          name: s.screenName,
          selected: false
        }));

        config.availableProducts = res.products;
        config.availablePlans = res.plans;

        // Apply existing config if in modify mode
        if (this.existingPayload) {
          const existing = this.existingPayload.securityGroup.companies
            .find(c => guidEq(c.companyGuid, companyGuid));
          if (existing) {
            this.applyExistingCompanyConfig(config, existing);
          }
        }

        config.loaded = true;
    
        if (onComplete) onComplete();
      },
      error: () => {
        config.loaded = true;
        if (onComplete) onComplete();
      }
    });
  }

  private applyExistingCompanyConfig(config: CompanyConfig, existing: CompanyDto): void {
    config.configured = true;
    // Apply company pages — mark page as selected if it exists in the payload
    existing.companyPages?.forEach(ep => {
      const page = config.companyPages.find(p => guidEq(p.pageGuid, ep.pageGuid));
      if (page) {
        page.selected = true; // Page is granted access
        page.configured = true;
        ep.buttons?.forEach(eb => {
          const btn = page.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) {
            btn.selected = true;
            btn.configured = true;
          }
        });
      }
    });

    // Apply inquiries
    existing.companyInquiries?.forEach(ei => {
      const inq = config.companyInquiries.find(i => guidEq(i.inquiryScreenNameGuid, ei.inquiryScreenNameGuid));
      if (inq) {
        inq.selected = true;
        inq.configured = true;
      }
    });

    // Apply web services
    existing.companyWebServices?.forEach(ews => {
      const ws = config.companyWebServices.find(w => guidEq(w.webServiceGuid, ews.webServiceGuid));
      if (ws) {
        ws.selected = true;
        ws.configured = true;
      }
    });

    // Apply products
    existing.products?.forEach(ep => {
      const productMeta = config.availableProducts.find(p => guidEq(p.productGuid, ep.productGuid));
      if (productMeta) {
        this.loadProduct(config, productMeta);
      }
    });

    // Apply plans
    existing.plans?.forEach(ep => {
      const planMeta = config.availablePlans.find(p => guidEq(p.planGuid, ep.planGuid));
      if (planMeta) {
        const isProductSelected = planMeta.productGuid && existing.products?.some(p => guidEq(p.productGuid, planMeta.productGuid));
        if (!isProductSelected) {
          this.loadPlan(config, planMeta);
        }
      }
    });
  }

  // ── Product Management ──
  loadProduct(config: CompanyConfig, product: AsProduct): void {
    if (config.products.find(p => guidEq(p.productGuid, product.productGuid))) return;

    this.isSubLoading = true;

    this.lookupService.getTransactions(undefined, product.productGuid).subscribe({
      next: (txns) => {
        const hasBase = !!this.baseConfig;

        let pagesToMap = this.allPages;
        if (hasBase) {
          pagesToMap = this.allPages.filter(p => this.unionProductPages.has(p.pageGuid.toUpperCase()));
        }

        const productPages = pagesToMap.map(p => {
          const pageGuidUpper = p.pageGuid.toUpperCase();
          let buttonsToMap = this.allButtons;
          if (hasBase) {
            buttonsToMap = this.allButtons.filter(b => this.unionAllPageButtons.has(b.buttonGuid.toUpperCase()));
          }
          return {
            pageGuid: p.pageGuid,
            name: p.pageName,
            selected: false,
            buttons: buttonsToMap.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          };
        });

        let txnsToMap = txns;

        const productTransactions = txnsToMap.map(t => {
          const txnGuidUpper = t.transactionGuid.toUpperCase();
          let buttonsToMap = this.allButtons;
          if (hasBase) {
            buttonsToMap = this.allButtons.filter(b => this.unionAllTxnButtons.has(b.buttonGuid.toUpperCase()));
          }
          return {
            transactionGuid: t.transactionGuid,
            name: t.transactionName,
            selected: false,
            buttons: buttonsToMap.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          };
        });

        const newProduct: ProductConfig = {
          productGuid: product.productGuid,
          name: product.productName,
          selected: true,
          productPages,
          productTransactions
        };

        // Apply existing config if modify mode
        if (this.existingPayload) {
          const existingCompany = this.existingPayload.securityGroup.companies
            .find(c => guidEq(c.companyGuid, config.company.companyGuid));
          const existingProduct = existingCompany?.products?.find(p => guidEq(p.productGuid, product.productGuid));
          if (existingProduct) {
            this.applyExistingProductConfig(newProduct, existingProduct);
          }
        }

        config.products.push(newProduct);

        // Auto-initialize plans belonging to this product
        const productPlansMeta = config.availablePlans.filter(p => guidEq(p.productGuid, product.productGuid));
        productPlansMeta.forEach(planMeta => {
          let planConfig = config.plans.find(p => guidEq(p.planGuid, planMeta.planGuid));
          if (!planConfig) {
            let planPagesToMap = this.allPages;
            if (hasBase) {
              planPagesToMap = this.allPages.filter(p => this.unionPlanPages.has(p.pageGuid.toUpperCase()));
            }

            const planPages = planPagesToMap.map(p => {
              const pageGuidUpper = p.pageGuid.toUpperCase();
              let buttonsToMap = this.allButtons;
              if (hasBase) {
                buttonsToMap = this.allButtons.filter(b => this.unionAllPageButtons.has(b.buttonGuid.toUpperCase()));
              }
              return {
                pageGuid: p.pageGuid,
                name: p.pageName,
                selected: false,
                buttons: buttonsToMap.map(b => ({
                  buttonGuid: b.buttonGuid,
                  name: b.buttonName,
                  selected: false
                }))
              };
            });

            planConfig = {
              planGuid: planMeta.planGuid,
              name: planMeta.planName,
              selected: true,
              planPages,
              planTransactions: [],
              productPlanTransactions: [],
              planInquiries: []
            };
            config.plans.push(planConfig);

            // Fetch independent plan transactions and inquiries in parallel if they haven't been fetched yet
            forkJoin({
              pTxns: this.lookupService.getTransactions(planMeta.planGuid, undefined),
              inqs: this.lookupService.getInquiryScreens(undefined, planMeta.planGuid)
            }).subscribe({
              next: (res) => {
                let planTxnsToMap = res.pTxns;

                planConfig!.planTransactions = planTxnsToMap.map(pt => {
                  const txnGuidUpper = pt.transactionGuid.toUpperCase();
                  let buttonsToMap = this.allButtons;
                  if (hasBase) {
                    buttonsToMap = this.allButtons.filter(b => this.unionAllTxnButtons.has(b.buttonGuid.toUpperCase()));
                  }
                  return {
                    transactionGuid: pt.transactionGuid,
                    name: pt.transactionName,
                    selected: false,
                    buttons: buttonsToMap.map(b => ({
                      buttonGuid: b.buttonGuid,
                      name: b.buttonName,
                      selected: false
                    }))
                  };
                });

                let planInqsToMap = res.inqs;

                planConfig!.planInquiries = planInqsToMap.map(inq => ({
                  inquiryScreenNameGuid: inq.inquiryScreenGuid,
                  name: inq.screenName,
                  selected: false
                }));

                // Apply existing plan config again in case transactions/inquiries arrived late
                if (this.existingPayload) {
                  const existingCompany = this.existingPayload.securityGroup.companies
                    .find(c => guidEq(c.companyGuid, config.company.companyGuid));
                  const existingPlan = existingCompany?.plans?.find(p => guidEq(p.planGuid, planMeta.planGuid));
                  if (existingPlan) {
                    this.applyExistingPlanConfig(planConfig!, existingPlan);
                  }
                }
              }
            });
          }

          // Initialize/override productPlanTransactions with the product's transactions
          planConfig.productPlanTransactions = newProduct.productTransactions.map(pt => ({
            transactionGuid: pt.transactionGuid,
            name: pt.name,
            selected: false,
            buttons: pt.buttons.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.name,
              selected: false
            }))
          }));

          // Apply existing config for this plan if in modify mode
          if (this.existingPayload) {
            const existingCompany = this.existingPayload.securityGroup.companies
              .find(c => guidEq(c.companyGuid, config.company.companyGuid));
            const existingPlan = existingCompany?.plans?.find(p => guidEq(p.planGuid, planMeta.planGuid));
            if (existingPlan) {
              this.applyExistingPlanConfig(planConfig, existingPlan);
            }
          }
        });

        this.isSubLoading = false;
      },
      error: () => {
        this.isSubLoading = false;
      }
    });
  }

  private applyExistingProductConfig(productConfig: ProductConfig, existing: ProductDto): void {
    productConfig.configured = true;
    existing.productPages?.forEach(ep => {
      const page = productConfig.productPages.find(p => guidEq(p.pageGuid, ep.pageGuid));
      if (page) {
        page.selected = true; // Page is granted access
        page.configured = true;
        ep.buttons?.forEach(eb => {
          const btn = page.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) {
            btn.selected = true;
            btn.configured = true;
          }
        });
      }
    });

    existing.productTransactions?.forEach(et => {
      const txn = productConfig.productTransactions.find(t => guidEq(t.transactionGuid, et.transactionGuid));
      if (txn) {
        et.buttons?.forEach(eb => {
          const btn = txn.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) {
            btn.selected = true;
            btn.configured = true;
          }
        });
        txn.selected = true; // Txn is granted access
        txn.configured = true;
      }
    });
  }

  removeProduct(config: CompanyConfig, productGuid: string): void {
    config.products = config.products.filter(p => !guidEq(p.productGuid, productGuid));
    // Also remove the plans associated with this product
    config.plans = config.plans.filter(p => {
      const planMeta = config.availablePlans.find(meta => guidEq(meta.planGuid, p.planGuid));
      return !planMeta?.productGuid || !guidEq(planMeta.productGuid, productGuid);
    });
  }

  // Template-safe helpers (avoid arrow functions and assignments in templates)
  isProductAdded(config: CompanyConfig, product: AsProduct): boolean {
    return !!config.products.find(p => guidEq(p.productGuid, product.productGuid));
  }

  addProductFromSelect(config: CompanyConfig): void {
    if (this.selectedProductToAdd) {
      this.loadProduct(config, this.selectedProductToAdd);
      this.selectedProductToAdd = null;
    }
  }

  onRemoveProduct(event: Event, config: CompanyConfig, productGuid: string): void {
    event.stopPropagation();
    this.removeProduct(config, productGuid);
  }

  loadPlan(config: CompanyConfig, plan: AsPlan): void {
    if (config.plans.find(p => guidEq(p.planGuid, plan.planGuid))) return;

    this.isSubLoading = true;

    const fetches: any = {
      txns: this.lookupService.getTransactions(plan.planGuid, undefined),
      inqs: this.lookupService.getInquiryScreens(undefined, plan.planGuid)
    };

    if (plan.productGuid) {
      fetches.prodTxns = this.lookupService.getTransactions(undefined, plan.productGuid);
    }

    forkJoin(fetches).subscribe({
      next: (res: any) => {
        const hasBase = !!this.baseConfig;

        let pagesToMap = this.allPages;
        if (hasBase) {
          pagesToMap = this.allPages.filter(p => this.unionPlanPages.has(p.pageGuid.toUpperCase()));
        }

        const planPages = pagesToMap.map(p => {
          const pageGuidUpper = p.pageGuid.toUpperCase();
          let buttonsToMap = this.allButtons;
          if (hasBase) {
            buttonsToMap = this.allButtons.filter(b => this.unionAllPageButtons.has(b.buttonGuid.toUpperCase()));
          }
          return {
            pageGuid: p.pageGuid,
            name: p.pageName,
            selected: false,
            buttons: buttonsToMap.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          };
        });

        let txnsToMap = res.txns;

        const planTransactions = txnsToMap.map((t: any) => {
          const txnGuidUpper = t.transactionGuid.toUpperCase();
          let buttonsToMap = this.allButtons;
          if (hasBase) {
            buttonsToMap = this.allButtons.filter(b => this.unionAllTxnButtons.has(b.buttonGuid.toUpperCase()));
          }
          return {
            transactionGuid: t.transactionGuid,
            name: t.transactionName,
            selected: false,
            buttons: buttonsToMap.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          };
        });

        let prodTxnsToMap = res.prodTxns || [];

        const productPlanTransactions = prodTxnsToMap.map((pt: any) => {
          const txnGuidUpper = pt.transactionGuid.toUpperCase();
          let buttonsToMap = this.allButtons;
          if (hasBase) {
            buttonsToMap = this.allButtons.filter(b => this.unionAllTxnButtons.has(b.buttonGuid.toUpperCase()));
          }
          return {
            transactionGuid: pt.transactionGuid,
            name: pt.transactionName,
            selected: false,
            buttons: buttonsToMap.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          };
        });

        let inqsToMap = res.inqs;

        const planInquiries = inqsToMap.map((inq: any) => ({
          inquiryScreenNameGuid: inq.inquiryScreenGuid,
          name: inq.screenName,
          selected: false
        }));

        const newPlan: PlanConfig = {
          planGuid: plan.planGuid,
          name: plan.planName,
          selected: true,
          planPages,
          planTransactions,
          productPlanTransactions,
          planInquiries
        };

        // Apply existing config if modify mode
        if (this.existingPayload) {
          const existingCompany = this.existingPayload.securityGroup.companies
            .find(c => guidEq(c.companyGuid, config.company.companyGuid));
          const existingPlan = existingCompany?.plans?.find(p => guidEq(p.planGuid, plan.planGuid));
          if (existingPlan) {
            this.applyExistingPlanConfig(newPlan, existingPlan);
          }
        }

        config.plans.push(newPlan);
        this.isSubLoading = false;
      },
      error: () => {
        this.isSubLoading = false;
      }
    });
  }

  private applyExistingPlanConfig(planConfig: PlanConfig, existing: PlanDto): void {
    planConfig.configured = true;
    existing.planPages?.forEach(ep => {
      const page = planConfig.planPages.find(p => guidEq(p.pageGuid, ep.pageGuid));
      if (page) {
        page.selected = true; // Page is granted access
        page.configured = true;
        ep.buttons?.forEach(eb => {
          const btn = page.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) {
            btn.selected = true;
            btn.configured = true;
          }
        });
      }
    });

    planConfig.productPlanTransactions?.forEach(pt => {
      const et = existing.planTransactions?.find(e => guidEq(e.transactionGuid, pt.transactionGuid));
      if (et) {
        pt.selected = true;
        pt.configured = true;
        et.buttons?.forEach(eb => {
          const btn = pt.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) {
            btn.selected = true;
            btn.configured = true;
          }
        });
      }
    });

    existing.planTransactions?.forEach(et => {
      const txn = planConfig.planTransactions.find(t => guidEq(t.transactionGuid, et.transactionGuid));
      if (txn) {
        et.buttons?.forEach(eb => {
          const btn = txn.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) {
            btn.selected = true;
            btn.configured = true;
          }
        });
        txn.selected = true; // Txn is granted access
        txn.configured = true;
      }
    });

    existing.planInquiries?.forEach(ei => {
      const inq = planConfig.planInquiries.find(i => guidEq(i.inquiryScreenNameGuid, ei.inquiryScreenNameGuid));
      if (inq) {
        inq.selected = true;
        inq.configured = true;
      } else {
        // Fallback to preserve inquiry screen even if lookup metadata isn't populated
        planConfig.planInquiries.push({
          inquiryScreenNameGuid: ei.inquiryScreenNameGuid,
          name: ei.name || 'Unknown Screen',
          selected: true,
          configured: true
        });
      }
    });
  }

  removePlan(config: CompanyConfig, planGuid: string): void {
    config.plans = config.plans.filter(p => p.planGuid !== planGuid);

  }

  isPlanAdded(config: CompanyConfig | null | undefined, plan: AsPlan): boolean {
    if (!config || !config.plans) return false;
    return !!config.plans.find(p => guidEq(p.planGuid, plan.planGuid));
  }

  addPlanFromSelect(config: CompanyConfig | null | undefined): void {
    if (!config) return;
    if (this.selectedPlanToAdd) {
      this.loadPlan(config, this.selectedPlanToAdd);
      this.selectedPlanToAdd = null;
    }
  }

  onRemovePlan(event: Event, config: CompanyConfig | null | undefined, planGuid: string): void {
    event.stopPropagation();
    if (!config) return;
    this.removePlan(config, planGuid);
  }

  // ── Toggle Helpers ──
  togglePageAll(page: CompanyPageDto, checked: boolean): void {
    page.selected = checked;
  }

  toggleAllPageButtons(page: CompanyPageDto, checked: boolean): void {
    page.buttons.forEach(b => b.selected = checked);
  }

  onButtonChange(page: CompanyPageDto): void {
    // Button changes don't affect page.selected (page access is independent)
  }

  areAllButtonsSelected(page: CompanyPageDto): boolean {
    return page.buttons.length > 0 && page.buttons.every(b => b.selected);
  }

  areSomeButtonsSelected(page: CompanyPageDto): boolean {
    const count = page.buttons.filter(b => b.selected).length;
    return count > 0 && count < page.buttons.length;
  }

  toggleTxnAll(txn: any, checked: boolean): void {
    txn.selected = checked;
  }

  toggleAllTxnButtons(txn: any, checked: boolean): void {
    txn.buttons.forEach((b: ButtonDto) => b.selected = checked);
  }

  onTxnButtonChange(txn: any): void {
    // Button changes don't affect txn.selected (txn access is independent)
  }

  areAllTxnButtonsSelected(txn: any): boolean {
    return txn.buttons && txn.buttons.length > 0 && txn.buttons.every((b: ButtonDto) => b.selected);
  }

  areSomeTxnButtonsSelected(txn: any): boolean {
    if (!txn.buttons) return false;
    const count = txn.buttons.filter((b: ButtonDto) => b.selected).length;
    return count > 0 && count < txn.buttons.length;
  }

  isPageIndeterminate(page: CompanyPageDto): boolean {
    const selected = page.buttons.filter(b => b.selected).length;
    return selected > 0 && selected < page.buttons.length;
  }

  isTxnIndeterminate(txn: any): boolean {
    const selected = txn.buttons.filter((b: ButtonDto) => b.selected).length;
    return selected > 0 && selected < txn.buttons.length;
  }

  // ── Build Payload & Save ──
  buildPayload(): SecurityGroupRequestDto {
    const companies: CompanyDto[] = this.selectedCompanies.map(config => {
      // Include pages that are selected OR have at least one button selected
      const companyPages = config.companyPages
        .filter(p => p.selected || p.buttons.some(b => b.selected))
        .map(p => ({
          pageGuid: p.pageGuid,
          buttons: p.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
        }));

      const companyInquiries = config.companyInquiries
        .filter(i => i.selected)
        .map(i => ({ inquiryScreenNameGuid: i.inquiryScreenNameGuid }));

      const companyWebServices = config.companyWebServices
        .filter(w => w.selected)
        .map(w => ({ webServiceGuid: w.webServiceGuid }));

      const products = config.products
        .filter(prod => prod.selected)
        .map(prod => ({
          productGuid: prod.productGuid,
          productPages: prod.productPages
            .filter(p => p.selected || p.buttons.some(b => b.selected))
            .map(p => ({
              pageGuid: p.pageGuid,
              buttons: p.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
            })),
          productTransactions: prod.productTransactions
            .filter(t => t.selected || t.buttons.some(b => b.selected))
            .map(t => ({
              transactionGuid: t.transactionGuid,
              buttons: t.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
            }))
        }));

      const plans = config.plans
        .filter(plan => plan.selected)
        .map(plan => ({
          planGuid: plan.planGuid,
          planPages: plan.planPages
            .filter(p => p.selected || p.buttons.some(b => b.selected))
            .map(p => ({
              pageGuid: p.pageGuid,
              buttons: p.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
            })),
          // Merge both independent and product-derived plan transactions
          planTransactions: [
            ...plan.planTransactions,
            ...(plan.productPlanTransactions || [])
          ]
            .filter(t => t.selected || t.buttons.some(b => b.selected))
            .map(t => ({
              transactionGuid: t.transactionGuid,
              buttons: t.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
            })),
          planInquiries: plan.planInquiries
            .filter(i => i.selected)
            .map(i => ({ inquiryScreenNameGuid: i.inquiryScreenNameGuid }))
        }));

      return {
        companyGuid: config.company.companyGuid,
        companyPages,
        companyInquiries,
        companyWebServices,
        products,
        plans
      };
    });

    return {
      securityGroup: {
        securityGroupGuid: this.groupGuid || undefined,
        groupName: this.groupName,
        companies
      }
    };
  }

  getCompanyName(companyGuid: string): string {
    return this.allCompanies.find(c => guidEq(c.companyGuid, companyGuid))?.companyName || 'Unknown Company';
  }

  getPageName(pageGuid: string): string {
    return this.allPages.find(p => guidEq(p.pageGuid, pageGuid))?.pageName || 'Unknown Page';
  }

  getButtonName(buttonGuid: string): string {
    return this.allButtons.find(b => guidEq(b.buttonGuid, buttonGuid))?.buttonName || 'Unknown Button';
  }

  getWebServiceName(webServiceGuid: string): string {
    return this.allWebServices.find(w => guidEq(w.webServiceGuid, webServiceGuid))?.webServiceName || 'Unknown Web Service';
  }

  getInquiryName(companyGuid: string, screenGuid: string): string {
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    return config?.companyInquiries.find(i => guidEq(i.inquiryScreenNameGuid, screenGuid))?.name || 'Unknown Inquiry';
  }

  getProductName(companyGuid: string, productGuid: string): string {
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    return config?.availableProducts.find(p => guidEq(p.productGuid, productGuid))?.productName || 
           config?.products.find(p => guidEq(p.productGuid, productGuid))?.name || 'Unknown Product';
  }

  getPlanName(companyGuid: string, planGuid: string): string {
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    return config?.availablePlans.find(p => guidEq(p.planGuid, planGuid))?.planName || 
           config?.plans.find(p => guidEq(p.planGuid, planGuid))?.name || 'Unknown Plan';
  }

  getTransactionName(companyGuid: string, txnGuid: string): string {
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    for (const prod of config?.products || []) {
      const t = prod.productTransactions.find(x => guidEq(x.transactionGuid, txnGuid));
      if (t) return t.name || 'Unknown Transaction';
    }
    for (const plan of config?.plans || []) {
      const t = plan.planTransactions.find(x => guidEq(x.transactionGuid, txnGuid));
      if (t) return t.name || 'Unknown Transaction';
      const pt = plan.productPlanTransactions?.find(x => guidEq(x.transactionGuid, txnGuid));
      if (pt) return pt.name || 'Unknown Transaction';
    }
    return 'Unknown Transaction';
  }

  formatSql(sql: string): string {
    if (!sql) return '';
    return sql
      .split(';')
      .map(stmt => {
        const trimmed = stmt.trim();
        if (!trimmed) return '';
        return trimmed
          .replace(/\s+/g, ' ')
          .replace(/\b(VALUES|SET|WHERE|AND|OR)\b/g, '\n$1')
          .replace(/\(([^)]+)\)/g, (match: string, content: string) => {
            if (content.length > 50) {
              return '(\n  ' + content.split(',').map((s: string) => s.trim()).join(',\n  ') + '\n)';
            }
            return match;
          });
      })
      .filter(Boolean)
      .join(';\n\n') + ';';
  }

  copyScriptsToClipboard(scripts: string[]): void {
    if (!scripts || scripts.length === 0) return;
    navigator.clipboard.writeText(scripts.join('\n')).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    });
  }

  comparePayloads(existingPayload: SecurityGroupRequestDto | null, current: SecurityGroupRequestDto): HierarchicalDiffNode[] {
    const companyNodes: HierarchicalDiffNode[] = [];
    const existingCompanies = existingPayload?.securityGroup?.companies || [];
    const currentCompanies = current.securityGroup.companies || [];

    currentCompanies.forEach(currCompany => {
      const companyName = this.getCompanyName(currCompany.companyGuid);
      const existCompany = existingCompanies.find(c => guidEq(c.companyGuid, currCompany.companyGuid));

      if (!existCompany) {
        const companyNode: HierarchicalDiffNode = {
          name: companyName,
          type: 'add',
          icon: 'business',
          children: []
        };
        this.addCompanyDiffNodes(companyNode.children!, currCompany, currCompany.companyGuid);
        companyNodes.push(companyNode);
        return;
      }

      const categoryNodes: HierarchicalDiffNode[] = [];

      // 1. Company Pages
      const pageNodes: HierarchicalDiffNode[] = [];
      const currPages = currCompany.companyPages || [];
      const existPages = existCompany.companyPages || [];

      currPages.forEach(currPage => {
        const pageName = this.getPageName(currPage.pageGuid);
        const existPage = existPages.find(p => guidEq(p.pageGuid, currPage.pageGuid));

        if (!existPage) {
          const pNode: HierarchicalDiffNode = {
            name: pageName,
            type: 'add',
            icon: 'description',
            children: []
          };
          currPage.buttons?.forEach(b => {
            pNode.children!.push({
              name: this.getButtonName(b.buttonGuid),
              type: 'add',
              icon: 'radio_button_checked'
            });
          });
          pageNodes.push(pNode);
        } else {
          const buttonNodes: HierarchicalDiffNode[] = [];
          const currButtons = currPage.buttons || [];
          const existButtons = existPage.buttons || [];

          currButtons.forEach(cb => {
            if (!existButtons.some(eb => guidEq(eb.buttonGuid, cb.buttonGuid))) {
              buttonNodes.push({
                name: this.getButtonName(cb.buttonGuid),
                type: 'add',
                icon: 'radio_button_checked'
              });
            }
          });
          existButtons.forEach(eb => {
            if (!currButtons.some(cb => guidEq(cb.buttonGuid, eb.buttonGuid))) {
              buttonNodes.push({
                name: this.getButtonName(eb.buttonGuid),
                type: 'remove',
                icon: 'radio_button_checked'
              });
            }
          });

          if (buttonNodes.length > 0) {
            pageNodes.push({
              name: pageName,
              type: 'mixed',
              icon: 'description',
              children: buttonNodes
            });
          }
        }
      });

      existPages.forEach(existPage => {
        if (!currPages.some(cp => guidEq(cp.pageGuid, existPage.pageGuid))) {
          pageNodes.push({
            name: this.getPageName(existPage.pageGuid),
            type: 'remove',
            icon: 'description'
          });
        }
      });

      if (pageNodes.length > 0) {
        categoryNodes.push({
          name: 'Company Pages',
          icon: 'description',
          children: pageNodes
        });
      }

      // 2. Company Inquiries
      const inquiryNodes: HierarchicalDiffNode[] = [];
      const currInqs = currCompany.companyInquiries || [];
      const existInqs = existCompany.companyInquiries || [];

      currInqs.forEach(ci => {
        if (!existInqs.some(ei => guidEq(ei.inquiryScreenNameGuid, ci.inquiryScreenNameGuid))) {
          inquiryNodes.push({
            name: this.getInquiryName(currCompany.companyGuid, ci.inquiryScreenNameGuid),
            type: 'add',
            icon: 'search'
          });
        }
      });
      existInqs.forEach(ei => {
        if (!currInqs.some(ci => guidEq(ci.inquiryScreenNameGuid, ei.inquiryScreenNameGuid))) {
          inquiryNodes.push({
            name: this.getInquiryName(currCompany.companyGuid, ei.inquiryScreenNameGuid),
            type: 'remove',
            icon: 'search'
          });
        }
      });

      if (inquiryNodes.length > 0) {
        categoryNodes.push({
          name: 'Inquiry Screens',
          icon: 'web',
          children: inquiryNodes
        });
      }

      // 3. Company Web Services
      const wsNodes: HierarchicalDiffNode[] = [];
      const currWS = currCompany.companyWebServices || [];
      const existWS = existCompany.companyWebServices || [];

      currWS.forEach(cw => {
        if (!existWS.some(ew => guidEq(ew.webServiceGuid, cw.webServiceGuid))) {
          wsNodes.push({
            name: this.getWebServiceName(cw.webServiceGuid),
            type: 'add',
            icon: 'settings_ethernet'
          });
        }
      });
      existWS.forEach(ew => {
        if (!currWS.some(cw => guidEq(cw.webServiceGuid, ew.webServiceGuid))) {
          wsNodes.push({
            name: this.getWebServiceName(ew.webServiceGuid),
            type: 'remove',
            icon: 'settings_ethernet'
          });
        }
      });

      if (wsNodes.length > 0) {
        categoryNodes.push({
          name: 'Web Services',
          icon: 'settings_ethernet',
          children: wsNodes
        });
      }

      // 4. Products
      const productCategoryNodes: HierarchicalDiffNode[] = [];
      const currProds = currCompany.products || [];
      const existProds = existCompany.products || [];

      currProds.forEach(cp => {
        const prodName = this.getProductName(currCompany.companyGuid, cp.productGuid);
        const ep = existProds.find(p => guidEq(p.productGuid, cp.productGuid));

        if (!ep) {
          const prodNode: HierarchicalDiffNode = {
            name: prodName,
            type: 'add',
            icon: 'inventory_2',
            children: []
          };
          this.addProductDiffNodes(prodNode.children!, cp, prodName, currCompany.companyGuid);
          productCategoryNodes.push(prodNode);
        } else {
          const prodChildren: HierarchicalDiffNode[] = [];
          this.compareProductDetails(prodChildren, ep, cp, prodName, currCompany.companyGuid);
          if (prodChildren.length > 0) {
            productCategoryNodes.push({
              name: prodName,
              type: 'mixed',
              icon: 'inventory_2',
              children: prodChildren
            });
          }
        }
      });

      existProds.forEach(ep => {
        if (!currProds.some(cp => guidEq(cp.productGuid, ep.productGuid))) {
          productCategoryNodes.push({
            name: this.getProductName(currCompany.companyGuid, ep.productGuid),
            type: 'remove',
            icon: 'inventory_2'
          });
        }
      });

      if (productCategoryNodes.length > 0) {
        categoryNodes.push({
          name: 'Products',
          icon: 'inventory_2',
          children: productCategoryNodes
        });
      }

      // 5. Plans
      const planCategoryNodes: HierarchicalDiffNode[] = [];
      const currPlans = currCompany.plans || [];
      const existPlans = existCompany.plans || [];

      currPlans.forEach(cp => {
        const planName = this.getPlanName(currCompany.companyGuid, cp.planGuid);
        const ep = existPlans.find(p => guidEq(p.planGuid, cp.planGuid));

        if (!ep) {
          const planNode: HierarchicalDiffNode = {
            name: planName,
            type: 'add',
            icon: 'assignment',
            children: []
          };
          this.addPlanDiffNodes(planNode.children!, cp, planName, currCompany.companyGuid);
          planCategoryNodes.push(planNode);
        } else {
          const planChildren: HierarchicalDiffNode[] = [];
          this.comparePlanDetails(planChildren, ep, cp, planName, currCompany.companyGuid);
          if (planChildren.length > 0) {
            planCategoryNodes.push({
              name: planName,
              type: 'mixed',
              icon: 'assignment',
              children: planChildren
            });
          }
        }
      });

      existPlans.forEach(ep => {
        if (!currPlans.some(cp => guidEq(cp.planGuid, ep.planGuid))) {
          planCategoryNodes.push({
            name: this.getPlanName(currCompany.companyGuid, ep.planGuid),
            type: 'remove',
            icon: 'assignment'
          });
        }
      });

      if (planCategoryNodes.length > 0) {
        categoryNodes.push({
          name: 'Plans',
          icon: 'assignment',
          children: planCategoryNodes
        });
      }

      if (categoryNodes.length > 0) {
        companyNodes.push({
          name: companyName,
          icon: 'business',
          children: categoryNodes
        });
      }
    });

    existingCompanies.forEach(existCompany => {
      if (!currentCompanies.some(c => guidEq(c.companyGuid, existCompany.companyGuid))) {
        companyNodes.push({
          name: this.getCompanyName(existCompany.companyGuid),
          type: 'remove',
          icon: 'business'
        });
      }
    });

    return this.filterUnknownNodes(companyNodes);
  }

  private filterUnknownNodes(nodes: HierarchicalDiffNode[]): HierarchicalDiffNode[] {
    return nodes
      .filter(node => !node.name || !node.name.startsWith('Unknown'))
      .map(node => {
        if (node.children) {
          return {
            ...node,
            children: this.filterUnknownNodes(node.children)
          };
        }
        return node;
      })
      .filter(node => {
        if (node.children) {
          if (node.children.length === 0) {
            return (node.type === 'add' || node.type === 'remove');
          }
        }
        return true;
      });
  }

  private addCompanyDiffNodes(nodes: HierarchicalDiffNode[], company: CompanyDto, companyGuid: string): void {
    const pageNodes: HierarchicalDiffNode[] = [];
    company.companyPages?.forEach(p => {
      const pageName = this.getPageName(p.pageGuid);
      const pNode: HierarchicalDiffNode = {
        name: pageName,
        type: 'add',
        icon: 'description',
        children: []
      };
      p.buttons?.forEach(b => {
        pNode.children!.push({
          name: this.getButtonName(b.buttonGuid),
          type: 'add',
          icon: 'radio_button_checked'
        });
      });
      pageNodes.push(pNode);
    });
    if (pageNodes.length > 0) {
      nodes.push({ name: 'Company Pages', icon: 'description', children: pageNodes });
    }

    const inquiryNodes: HierarchicalDiffNode[] = [];
    company.companyInquiries?.forEach(i => {
      inquiryNodes.push({
        name: this.getInquiryName(companyGuid, i.inquiryScreenNameGuid),
        type: 'add',
        icon: 'search'
      });
    });
    if (inquiryNodes.length > 0) {
      nodes.push({ name: 'Inquiry Screens', icon: 'web', children: inquiryNodes });
    }

    const wsNodes: HierarchicalDiffNode[] = [];
    company.companyWebServices?.forEach(ws => {
      wsNodes.push({
        name: this.getWebServiceName(ws.webServiceGuid),
        type: 'add',
        icon: 'settings_ethernet'
      });
    });
    if (wsNodes.length > 0) {
      nodes.push({ name: 'Web Services', icon: 'settings_ethernet', children: wsNodes });
    }

    const prodNodes: HierarchicalDiffNode[] = [];
    company.products?.forEach(p => {
      const prodName = this.getProductName(companyGuid, p.productGuid);
      const pNode: HierarchicalDiffNode = {
        name: prodName,
        type: 'add',
        icon: 'inventory_2',
        children: []
      };
      this.addProductDiffNodes(pNode.children!, p, prodName, companyGuid);
      prodNodes.push(pNode);
    });
    if (prodNodes.length > 0) {
      nodes.push({ name: 'Products', icon: 'inventory_2', children: prodNodes });
    }

    const planNodes: HierarchicalDiffNode[] = [];
    company.plans?.forEach(p => {
      const planName = this.getPlanName(companyGuid, p.planGuid);
      const pNode: HierarchicalDiffNode = {
        name: planName,
        type: 'add',
        icon: 'assignment',
        children: []
      };
      this.addPlanDiffNodes(pNode.children!, p, planName, companyGuid);
      planNodes.push(pNode);
    });
    if (planNodes.length > 0) {
      nodes.push({ name: 'Plans', icon: 'assignment', children: planNodes });
    }
  }

  private addProductDiffNodes(nodes: HierarchicalDiffNode[], prod: ProductDto, prodName: string, companyGuid: string): void {
    const pageNodes: HierarchicalDiffNode[] = [];
    prod.productPages?.forEach(p => {
      const pageName = this.getPageName(p.pageGuid);
      const pNode: HierarchicalDiffNode = {
        name: pageName,
        type: 'add',
        icon: 'description',
        children: []
      };
      p.buttons?.forEach(b => {
        pNode.children!.push({
          name: this.getButtonName(b.buttonGuid),
          type: 'add',
          icon: 'radio_button_checked'
        });
      });
      pageNodes.push(pNode);
    });
    if (pageNodes.length > 0) {
      nodes.push({ name: 'Product Pages', icon: 'description', children: pageNodes });
    }

    const txnNodes: HierarchicalDiffNode[] = [];
    prod.productTransactions?.forEach(t => {
      const txnName = this.getTransactionName(companyGuid, t.transactionGuid);
      const tNode: HierarchicalDiffNode = {
        name: txnName,
        type: 'add',
        icon: 'sync',
        children: []
      };
      t.buttons?.forEach(b => {
        tNode.children!.push({
          name: this.getButtonName(b.buttonGuid),
          type: 'add',
          icon: 'radio_button_checked'
        });
      });
      txnNodes.push(tNode);
    });
    if (txnNodes.length > 0) {
      nodes.push({ name: 'Product Transactions', icon: 'sync', children: txnNodes });
    }
  }

  private addPlanDiffNodes(nodes: HierarchicalDiffNode[], plan: PlanDto, planName: string, companyGuid: string): void {
    const pageNodes: HierarchicalDiffNode[] = [];
    plan.planPages?.forEach(p => {
      const pageName = this.getPageName(p.pageGuid);
      const pNode: HierarchicalDiffNode = {
        name: pageName,
        type: 'add',
        icon: 'description',
        children: []
      };
      p.buttons?.forEach(b => {
        pNode.children!.push({
          name: this.getButtonName(b.buttonGuid),
          type: 'add',
          icon: 'radio_button_checked'
        });
      });
      pageNodes.push(pNode);
    });
    if (pageNodes.length > 0) {
      nodes.push({ name: 'Plan Pages', icon: 'description', children: pageNodes });
    }

    const txnNodes: HierarchicalDiffNode[] = [];
    plan.planTransactions?.forEach(t => {
      const txnName = this.getTransactionName(companyGuid, t.transactionGuid);
      const tNode: HierarchicalDiffNode = {
        name: txnName,
        type: 'add',
        icon: 'sync',
        children: []
      };
      t.buttons?.forEach(b => {
        tNode.children!.push({
          name: this.getButtonName(b.buttonGuid),
          type: 'add',
          icon: 'radio_button_checked'
        });
      });
      txnNodes.push(tNode);
    });
    if (txnNodes.length > 0) {
      nodes.push({ name: 'Plan Transactions', icon: 'sync', children: txnNodes });
    }

    const inquiryNodes: HierarchicalDiffNode[] = [];
    plan.planInquiries?.forEach(i => {
      inquiryNodes.push({
        name: this.getInquiryName(companyGuid, i.inquiryScreenNameGuid),
        type: 'add',
        icon: 'search'
      });
    });
    if (inquiryNodes.length > 0) {
      nodes.push({ name: 'Plan Inquiry Screens', icon: 'web', children: inquiryNodes });
    }
  }

  private compareProductDetails(nodes: HierarchicalDiffNode[], exist: ProductDto, curr: ProductDto, prodName: string, companyGuid: string): void {
    const pageNodes: HierarchicalDiffNode[] = [];
    const currPages = curr.productPages || [];
    const existPages = exist.productPages || [];

    currPages.forEach(cp => {
      const pageName = this.getPageName(cp.pageGuid);
      const ep = existPages.find(p => guidEq(p.pageGuid, cp.pageGuid));

      if (!ep) {
        const pNode: HierarchicalDiffNode = {
          name: pageName,
          type: 'add',
          icon: 'description',
          children: []
        };
        cp.buttons?.forEach(b => {
          pNode.children!.push({
            name: this.getButtonName(b.buttonGuid),
            type: 'add',
            icon: 'radio_button_checked'
          });
        });
        pageNodes.push(pNode);
      } else {
        const buttonNodes: HierarchicalDiffNode[] = [];
        const currBtns = cp.buttons || [];
        const existBtns = ep.buttons || [];

        currBtns.forEach(cb => {
          if (!existBtns.some(eb => guidEq(eb.buttonGuid, cb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(cb.buttonGuid),
              type: 'add',
              icon: 'radio_button_checked'
            });
          }
        });
        existBtns.forEach(eb => {
          if (!currBtns.some(cb => guidEq(cb.buttonGuid, eb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(eb.buttonGuid),
              type: 'remove',
              icon: 'radio_button_checked'
            });
          }
        });

        if (buttonNodes.length > 0) {
          pageNodes.push({
            name: pageName,
            type: 'mixed',
            icon: 'description',
            children: buttonNodes
          });
        }
      }
    });

    existPages.forEach(ep => {
      if (!currPages.some(cp => guidEq(cp.pageGuid, ep.pageGuid))) {
        pageNodes.push({
          name: this.getPageName(ep.pageGuid),
          type: 'remove',
          icon: 'description'
        });
      }
    });

    if (pageNodes.length > 0) {
      nodes.push({ name: 'Product Pages', icon: 'description', children: pageNodes });
    }

    const txnNodes: HierarchicalDiffNode[] = [];
    const currTxns = curr.productTransactions || [];
    const existTxns = exist.productTransactions || [];

    currTxns.forEach(ct => {
      const txnName = this.getTransactionName(companyGuid, ct.transactionGuid);
      const et = existTxns.find(t => guidEq(t.transactionGuid, ct.transactionGuid));

      if (!et) {
        const tNode: HierarchicalDiffNode = {
          name: txnName,
          type: 'add',
          icon: 'sync',
          children: []
        };
        ct.buttons?.forEach(b => {
          tNode.children!.push({
            name: this.getButtonName(b.buttonGuid),
            type: 'add',
            icon: 'radio_button_checked'
          });
        });
        txnNodes.push(tNode);
      } else {
        const buttonNodes: HierarchicalDiffNode[] = [];
        const currBtns = ct.buttons || [];
        const existBtns = et.buttons || [];

        currBtns.forEach(cb => {
          if (!existBtns.some(eb => guidEq(eb.buttonGuid, cb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(cb.buttonGuid),
              type: 'add',
              icon: 'radio_button_checked'
            });
          }
        });
        existBtns.forEach(eb => {
          if (!currBtns.some(cb => guidEq(cb.buttonGuid, eb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(eb.buttonGuid),
              type: 'remove',
              icon: 'radio_button_checked'
            });
          }
        });

        if (buttonNodes.length > 0) {
          txnNodes.push({
            name: txnName,
            type: 'mixed',
            icon: 'sync',
            children: buttonNodes
          });
        }
      }
    });

    existTxns.forEach(et => {
      if (!currTxns.some(ct => guidEq(ct.transactionGuid, et.transactionGuid))) {
        txnNodes.push({
          name: this.getTransactionName(companyGuid, et.transactionGuid),
          type: 'remove',
          icon: 'sync'
        });
      }
    });

    if (txnNodes.length > 0) {
      nodes.push({ name: 'Product Transactions', icon: 'sync', children: txnNodes });
    }
  }

  private comparePlanDetails(nodes: HierarchicalDiffNode[], exist: PlanDto, curr: PlanDto, planName: string, companyGuid: string): void {
    const pageNodes: HierarchicalDiffNode[] = [];
    const currPages = curr.planPages || [];
    const existPages = exist.planPages || [];

    currPages.forEach(cp => {
      const pageName = this.getPageName(cp.pageGuid);
      const ep = existPages.find(p => guidEq(p.pageGuid, cp.pageGuid));

      if (!ep) {
        const pNode: HierarchicalDiffNode = {
          name: pageName,
          type: 'add',
          icon: 'description',
          children: []
        };
        cp.buttons?.forEach(b => {
          pNode.children!.push({
            name: this.getButtonName(b.buttonGuid),
            type: 'add',
            icon: 'radio_button_checked'
          });
        });
        pageNodes.push(pNode);
      } else {
        const buttonNodes: HierarchicalDiffNode[] = [];
        const currBtns = cp.buttons || [];
        const existBtns = ep.buttons || [];

        currBtns.forEach(cb => {
          if (!existBtns.some(eb => guidEq(eb.buttonGuid, cb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(cb.buttonGuid),
              type: 'add',
              icon: 'radio_button_checked'
            });
          }
        });
        existBtns.forEach(eb => {
          if (!currBtns.some(cb => guidEq(cb.buttonGuid, eb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(eb.buttonGuid),
              type: 'remove',
              icon: 'radio_button_checked'
            });
          }
        });

        if (buttonNodes.length > 0) {
          pageNodes.push({
            name: pageName,
            type: 'mixed',
            icon: 'description',
            children: buttonNodes
          });
        }
      }
    });

    existPages.forEach(ep => {
      if (!currPages.some(cp => guidEq(cp.pageGuid, ep.pageGuid))) {
        pageNodes.push({
          name: this.getPageName(ep.pageGuid),
          type: 'remove',
          icon: 'description'
        });
      }
    });

    if (pageNodes.length > 0) {
      nodes.push({ name: 'Plan Pages', icon: 'description', children: pageNodes });
    }

    const txnNodes: HierarchicalDiffNode[] = [];
    const currTxns = curr.planTransactions || [];
    const existTxns = exist.planTransactions || [];

    currTxns.forEach(ct => {
      const txnName = this.getTransactionName(companyGuid, ct.transactionGuid);
      const et = existTxns.find(t => guidEq(t.transactionGuid, ct.transactionGuid));

      if (!et) {
        const tNode: HierarchicalDiffNode = {
          name: txnName,
          type: 'add',
          icon: 'sync',
          children: []
        };
        ct.buttons?.forEach(b => {
          tNode.children!.push({
            name: this.getButtonName(b.buttonGuid),
            type: 'add',
            icon: 'radio_button_checked'
          });
        });
        txnNodes.push(tNode);
      } else {
        const buttonNodes: HierarchicalDiffNode[] = [];
        const currBtns = ct.buttons || [];
        const existBtns = et.buttons || [];

        currBtns.forEach(cb => {
          if (!existBtns.some(eb => guidEq(eb.buttonGuid, cb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(cb.buttonGuid),
              type: 'add',
              icon: 'radio_button_checked'
            });
          }
        });
        existBtns.forEach(eb => {
          if (!currBtns.some(cb => guidEq(cb.buttonGuid, eb.buttonGuid))) {
            buttonNodes.push({
              name: this.getButtonName(eb.buttonGuid),
              type: 'remove',
              icon: 'radio_button_checked'
            });
          }
        });

        if (buttonNodes.length > 0) {
          txnNodes.push({
            name: txnName,
            type: 'mixed',
            icon: 'sync',
            children: buttonNodes
          });
        }
      }
    });

    existTxns.forEach(et => {
      if (!currTxns.some(ct => guidEq(ct.transactionGuid, et.transactionGuid))) {
        txnNodes.push({
          name: this.getTransactionName(companyGuid, et.transactionGuid),
          type: 'remove',
          icon: 'sync'
        });
      }
    });

    if (txnNodes.length > 0) {
      nodes.push({ name: 'Plan Transactions', icon: 'sync', children: txnNodes });
    }

    const inquiryNodes: HierarchicalDiffNode[] = [];
    const currInqs = curr.planInquiries || [];
    const existInqs = exist.planInquiries || [];

    currInqs.forEach(ci => {
      if (!existInqs.some(ei => guidEq(ei.inquiryScreenNameGuid, ci.inquiryScreenNameGuid))) {
        inquiryNodes.push({
          name: this.getInquiryName(companyGuid, ci.inquiryScreenNameGuid),
          type: 'add',
          icon: 'search'
        });
      }
    });
    existInqs.forEach(ei => {
      if (!currInqs.some(ci => guidEq(ci.inquiryScreenNameGuid, ei.inquiryScreenNameGuid))) {
        inquiryNodes.push({
          name: this.getInquiryName(companyGuid, ei.inquiryScreenNameGuid),
          type: 'remove',
          icon: 'search'
        });
      }
    });

    if (inquiryNodes.length > 0) {
      nodes.push({ name: 'Plan Inquiry Screens', icon: 'web', children: inquiryNodes });
    }
  }

  // ── Tree View Interaction Methods ──

  toggleNode(key: string): void {
    this.expandedNodes[key] = !this.expandedNodes[key];
  }

  isNodeExpanded(key: string, defaultExpanded = false): boolean {
    if (this.expandedNodes[key] === undefined) {
      return defaultExpanded;
    }
    return this.expandedNodes[key];
  }

  expandAll(): void {
    this.viewCompanies.forEach(c => {
      const cKey = `company_${c.company.companyGuid}`;
      this.expandedNodes[cKey] = true;
      this.expandedNodes[`${cKey}_pages`] = true;
      
      c.companyPages.forEach(p => {
        if (p.selected || p.buttons.some(b => b.selected)) {
          this.expandedNodes[`page_${c.company.companyGuid}_${p.pageGuid}`] = true;
        }
      });

      this.expandedNodes[`${cKey}_inqs`] = true;
      this.expandedNodes[`${cKey}_ws`] = true;
      this.expandedNodes[`${cKey}_prods`] = true;

      c.products.forEach(p => {
        if (p.selected) {
          const pKey = `prod_${c.company.companyGuid}_${p.productGuid}`;
          this.expandedNodes[pKey] = true;
          this.expandedNodes[`${pKey}_pages`] = true;
          p.productPages.forEach(pg => {
            if (pg.selected || pg.buttons.some(b => b.selected)) {
              this.expandedNodes[`page_${c.company.companyGuid}_${p.productGuid}_${pg.pageGuid}`] = true;
            }
          });
          this.expandedNodes[`${pKey}_txns`] = true;
          p.productTransactions.forEach(t => {
            if (t.selected || t.buttons.some(b => b.selected)) {
              this.expandedNodes[`txn_${c.company.companyGuid}_${p.productGuid}_${t.transactionGuid}`] = true;
            }
          });
        }
      });

      this.expandedNodes[`${cKey}_plans`] = true;
      c.plans.forEach(pl => {
        if (pl.selected) {
          const plKey = `plan_${c.company.companyGuid}_${pl.planGuid}`;
          this.expandedNodes[plKey] = true;
          this.expandedNodes[`${plKey}_pages`] = true;
          pl.planPages.forEach(pg => {
            if (pg.selected || pg.buttons.some(b => b.selected)) {
              this.expandedNodes[`page_${c.company.companyGuid}_${pl.planGuid}_${pg.pageGuid}`] = true;
            }
          });
          this.expandedNodes[`${plKey}_txns`] = true;
          const allTxns = [...pl.planTransactions, ...(pl.productPlanTransactions || [])];
          allTxns.forEach(t => {
            if (t.selected || t.buttons.some(b => b.selected)) {
              this.expandedNodes[`txn_${c.company.companyGuid}_${pl.planGuid}_${t.transactionGuid}`] = true;
            }
          });
          this.expandedNodes[`${plKey}_inqs`] = true;
        }
      });
    });
  }

  collapseAll(): void {
    this.expandedNodes = {};
  }

  // ── Selected Config Helper Queries for Tree Rendering ──

  hasSelectedPages(pages: CompanyPageDto[] | undefined): boolean {
    return !!pages && pages.some(p => p.selected || (p.buttons && p.buttons.some(b => b.selected)));
  }

  getSelectedPages(pages: CompanyPageDto[] | undefined): CompanyPageDto[] {
    if (!pages) return [];
    return pages.filter(p => p.selected || (p.buttons && p.buttons.some(b => b.selected)));
  }

  getSelectedButtons(buttons: ButtonDto[] | undefined): ButtonDto[] {
    if (!buttons) return [];
    return buttons.filter(b => b.selected);
  }

  hasSelectedInquiries(inquiries: any[] | undefined): boolean {
    return !!inquiries && inquiries.some(i => i.selected);
  }

  getSelectedInquiries(inquiries: any[] | undefined): any[] {
    if (!inquiries) return [];
    return inquiries.filter(i => i.selected);
  }

  hasSelectedWebServices(webServices: any[] | undefined): boolean {
    return !!webServices && webServices.some(w => w.selected);
  }

  getSelectedWebServices(webServices: any[] | undefined): any[] {
    if (!webServices) return [];
    return webServices.filter(w => w.selected);
  }

  hasSelectedProducts(products: ProductConfig[] | undefined): boolean {
    return !!products && products.some(p => p.selected);
  }

  getSelectedProducts(products: ProductConfig[] | undefined): ProductConfig[] {
    if (!products) return [];
    return products.filter(p => p.selected);
  }

  hasSelectedTransactions(txns: any[] | undefined): boolean {
    return !!txns && txns.some(t => t.selected || (t.buttons && t.buttons.some((b: any) => b.selected)));
  }

  getSelectedTransactions(txns: any[] | undefined): any[] {
    if (!txns) return [];
    return txns.filter(t => t.selected || (t.buttons && t.buttons.some((b: any) => b.selected)));
  }

  getMergedSelectedTransactions(plan: PlanConfig): any[] {
    const txns = [...plan.planTransactions, ...(plan.productPlanTransactions || [])];
    return this.getSelectedTransactions(txns);
  }

  hasSelectedPlans(plans: PlanConfig[] | undefined): boolean {
    return !!plans && plans.some(p => p.selected);
  }

  getSelectedPlans(plans: PlanConfig[] | undefined): PlanConfig[] {
    if (!plans) return [];
    return plans.filter(p => p.selected);
  }

  hasAnySelectedPermissions(): boolean {
    return this.selectedCompanies.some(config => 
      this.hasSelectedPages(config.companyPages) ||
      this.hasSelectedInquiries(config.companyInquiries) ||
      this.hasSelectedWebServices(config.companyWebServices) ||
      this.hasSelectedProducts(config.products) ||
      this.hasSelectedPlans(config.plans)
    );
  }

  // ── Configured Config Helper Queries for Tree Rendering ──

  hasConfiguredPages(pages: CompanyPageDto[] | undefined): boolean {
    return !!pages && pages.some(p => p.configured);
  }

  getConfiguredPages(pages: CompanyPageDto[] | undefined): CompanyPageDto[] {
    if (!pages) return [];
    return pages.filter(p => p.configured);
  }

  getConfiguredButtons(buttons: ButtonDto[] | undefined): ButtonDto[] {
    if (!buttons) return [];
    return buttons.filter(b => b.configured);
  }

  hasConfiguredInquiries(inquiries: any[] | undefined): boolean {
    return !!inquiries && inquiries.some(i => i.configured);
  }

  getConfiguredInquiries(inquiries: any[] | undefined): any[] {
    if (!inquiries) return [];
    return inquiries.filter(i => i.configured);
  }

  hasConfiguredWebServices(webServices: any[] | undefined): boolean {
    return !!webServices && webServices.some(w => w.configured);
  }

  getConfiguredWebServices(webServices: any[] | undefined): any[] {
    if (!webServices) return [];
    return webServices.filter(w => w.configured);
  }

  hasConfiguredProducts(products: ProductConfig[] | undefined): boolean {
    return !!products && products.some(p => p.configured);
  }

  getConfiguredProducts(products: ProductConfig[] | undefined): ProductConfig[] {
    if (!products) return [];
    return products.filter(p => p.configured);
  }

  hasConfiguredTransactions(txns: any[] | undefined): boolean {
    return !!txns && txns.some(t => t.configured);
  }

  getConfiguredTransactions(txns: any[] | undefined): any[] {
    if (!txns) return [];
    return txns.filter(t => t.configured);
  }

  getMergedConfiguredTransactions(plan: PlanConfig): any[] {
    const txns = [...plan.planTransactions, ...(plan.productPlanTransactions || [])];
    return this.getConfiguredTransactions(txns);
  }

  hasConfiguredPlans(plans: PlanConfig[] | undefined): boolean {
    return !!plans && plans.some(p => p.configured);
  }

  getConfiguredPlans(plans: PlanConfig[] | undefined): PlanConfig[] {
    if (!plans) return [];
    return plans.filter(p => p.configured);
  }

  hasAnyConfiguredPermissions(): boolean {
    return this.viewCompanies.some(config => 
      this.hasConfiguredPages(config.companyPages) ||
      this.hasConfiguredInquiries(config.companyInquiries) ||
      this.hasConfiguredWebServices(config.companyWebServices) ||
      this.hasConfiguredProducts(config.products) ||
      this.hasConfiguredPlans(config.plans)
    );
  }

  openStatusDialog(success: boolean, message: string, callback?: () => void): void {
    const dialogRef = this.dialog.open(this.statusDialogTemplate, {
      width: '450px',
      disableClose: true,
      data: { success, message }
    });

    dialogRef.afterClosed().subscribe(() => {
      if (callback) callback();
    });
  }

  save(): void {
    this.isSaving = true;
    const payload = this.buildPayload();

    console.log('Saving Payload:', JSON.stringify(payload, null, 2));

    // Update central state
    this.stateService.updatePayload(payload);

    this.securityGroupService.saveGroupConfig(payload).subscribe({
      next: (result) => {
        this.isSaving = false;
        console.log('Scripts generation successful:', result);
        
        const diffs = this.comparePayloads(
          (this.mode === 'clone' || this.mode === 'create') ? null : this.existingPayload,
          payload
        );

        // Open the dialog to display generated scripts and ask for confirmation
        const dialogRef = this.dialog.open(this.scriptsDialogTemplate, {
          width: '950px',
          maxHeight: '90vh',
          data: {
            scripts: result.scripts || [],
            formattedScript: (result.scripts || []).map((s: string) => this.formatSql(s)).join('\n\n'),
            diffs: diffs
          }
        });

        dialogRef.afterClosed().subscribe(confirm => {
          if (confirm) {
            this.isSaving = true;
            this.securityGroupService.executeScripts(result.scripts || []).subscribe({
              next: () => {
                this.isSaving = false;
                // Clear persisted config state after successful save
                this.stateService.clearConfigState();
                
                this.openStatusDialog(
                  true,
                  'The SQL scripts have been successfully executed, and the security group configuration is updated in the database.',
                  () => {
                    // Navigate to view screen (reloads page in view mode)
                    this.stateService.setMode('view');
                    this.stateService.setGroupGuid(this.groupGuid);
                    this.stateService.setGroupName(this.groupName);
                    this.mode = 'view';
                    this.restoredFromStorage = false;
                    this.ngOnInit();
                  }
                );
              },
              error: (err) => {
                this.isSaving = false;
                console.error('Execution error:', err);
                const errMsg = err?.error?.message || 'An error occurred while executing the SQL scripts. Please check the logs.';
                this.openStatusDialog(false, errMsg);
              }
            });
          }
        });
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Save error:', err);
        const errMsg = err?.error?.message || 'Failed to generate save scripts. Please check the logs.';
        this.openStatusDialog(false, errMsg);
      }
    });
  }

  generateMigrationScripts(): void {
    this.isSaving = true;
    this.sqlFilterText = '';
    const payload = this.buildMigrationPayload();

    this.securityGroupService.generateMigrationScripts(payload).subscribe({
      next: (result) => {
        this.isSaving = false;
        console.log('Migration scripts generation successful:', result);

        this.buildDialogFilterTree(result.migrationScripts || []);

        // Open the dialog to display generated migration scripts (with no diffs and execute disabled)
        const dialogRef = this.dialog.open(this.scriptsDialogTemplate, {
          width: '950px',
          maxHeight: '90vh',
          data: {
            isViewMode: true,
            scripts: result.scripts || [],
            migrationScripts: result.migrationScripts || []
          }
        });
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Migration script generation error:', err);
        const errMsg = err?.error?.message || 'Failed to generate migration scripts. Please check the logs.';
        this.openStatusDialog(false, errMsg);
      }
    });
  }

  expandAllDialogNodes(): void {
    const traverse = (node: DialogFilterNode) => {
      node.expanded = true;
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    this.dialogFilterNodes.forEach(traverse);
  }

  selectAllDialogNodes(checked: boolean): void {
    const traverse = (node: DialogFilterNode) => {
      node.checked = checked;
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    this.dialogFilterNodes.forEach(traverse);
  }

  collapseAllDialogNodes(): void {
    const traverse = (node: DialogFilterNode) => {
      node.expanded = false;
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    this.dialogFilterNodes.forEach(traverse);
  }

  extractSqlValues(script: string): string[] {
    if (!script) return [];
    const valuesMatch = script.match(/VALUES\s*\(([^)]+)\)/i);
    if (!valuesMatch) return [];
    const content = valuesMatch[1];
    const regex = /'([^']*)'/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  }

  findCompanyPageGuidForButton(companyGuid: string, buttonGuid: string, script?: string): string | null {
    if (script) {
      const values = this.extractSqlValues(script);
      if (values.length >= 2) {
        const authPageGuid = values[1];
        const realGuid = this.authPageToPageMap.get(authPageGuid.toUpperCase());
        if (realGuid) return realGuid;
      }
    }
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    if (!config) return null;
    const page = config.companyPages.find(p => p.buttons && p.buttons.some(b => guidEq(b.buttonGuid, buttonGuid)));
    return page ? page.pageGuid : null;
  }

  findProductPageGuidForButton(companyGuid: string, productGuid: string, buttonGuid: string, script?: string): string | null {
    if (script) {
      const values = this.extractSqlValues(script);
      if (values.length >= 2) {
        const authPageGuid = values[0];
        const realGuid = this.authPageToPageMap.get(authPageGuid.toUpperCase());
        if (realGuid) return realGuid;
      }
    }
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    if (!config) return null;
    const prod = config.products.find(p => guidEq(p.productGuid, productGuid));
    if (!prod) return null;
    const page = prod.productPages.find(p => p.buttons && p.buttons.some(b => guidEq(b.buttonGuid, buttonGuid)));
    return page ? page.pageGuid : null;
  }

  findProductTxnGuidForButton(companyGuid: string, productGuid: string, buttonGuid: string, script?: string): string | null {
    if (script) {
      const values = this.extractSqlValues(script);
      if (values.length >= 2) {
        const authTxnGuid = values[0];
        const realGuid = this.authTxnToTxnMap.get(authTxnGuid.toUpperCase());
        if (realGuid) return realGuid;
      }
    }
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    if (!config) return null;
    const prod = config.products.find(p => guidEq(p.productGuid, productGuid));
    if (!prod) return null;
    const txn = prod.productTransactions.find(t => t.buttons && t.buttons.some(b => guidEq(b.buttonGuid, buttonGuid)));
    return txn ? txn.transactionGuid : null;
  }

  findPlanPageGuidForButton(companyGuid: string, planGuid: string, buttonGuid: string, script?: string): string | null {
    if (script) {
      const values = this.extractSqlValues(script);
      if (values.length >= 2) {
        const authPageGuid = values[0];
        const realGuid = this.authPageToPageMap.get(authPageGuid.toUpperCase());
        if (realGuid) return realGuid;
      }
    }
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    if (!config) return null;
    const plan = config.plans.find(p => guidEq(p.planGuid, planGuid));
    if (!plan) return null;
    const page = plan.planPages.find(p => p.buttons && p.buttons.some(b => guidEq(b.buttonGuid, buttonGuid)));
    return page ? page.pageGuid : null;
  }

  findPlanTxnGuidForButton(companyGuid: string, planGuid: string, buttonGuid: string, script?: string): string | null {
    if (script) {
      const values = this.extractSqlValues(script);
      if (values.length >= 2) {
        const authTxnGuid = values[0];
        const realGuid = this.authTxnToTxnMap.get(authTxnGuid.toUpperCase());
        if (realGuid) return realGuid;
      }
    }
    const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, companyGuid));
    if (!config) return null;
    const plan = config.plans.find(p => guidEq(p.planGuid, planGuid));
    if (!plan) return null;
    const txn = plan.planTransactions.find(t => t.buttons && t.buttons.some(b => guidEq(b.buttonGuid, buttonGuid)));
    if (txn) return txn.transactionGuid;
    const prodTxn = plan.productPlanTransactions?.find(t => t.buttons && t.buttons.some(b => guidEq(b.buttonGuid, buttonGuid)));
    return prodTxn ? prodTxn.transactionGuid : null;
  }

  getFilterNodeIcon(type: string): string {
    switch (type) {
      case 'company': return 'business';
      case 'company_level': return 'settings';
      case 'product': return 'shopping_bag';
      case 'plan': return 'view_agenda';
      case 'company_level_pages':
      case 'product_pages':
      case 'plan_pages':
        return 'folder';
      case 'product_transactions':
      case 'plan_transactions':
        return 'folder_special';
      case 'page': return 'description';
      case 'transaction': return 'receipt_long';
      case 'button': return 'radio_button_checked';
      case 'company_inquiries':
      case 'plan_inquiries':
        return 'search';
      case 'company_webservices':
        return 'dns';
      case 'inquiry': return 'find_in_page';
      case 'webservice': return 'cloud_queue';
      default: return 'help_outline';
    }
  }

  getFilterNodeIconClass(type: string): string {
    switch (type) {
      case 'company': return 'company';
      case 'company_level': return 'level';
      case 'product': return 'product';
      case 'plan': return 'plan';
      case 'page': return 'page';
      case 'transaction': return 'transaction';
      case 'button': return 'button';
      default: return 'default-icon';
    }
  }

  getScriptNodeId(s: MigrationScriptDto): string | null {
    if (s.entityType === 'SECURITY_GROUP') {
      return 'security_group';
    }
    if (s.entityType === 'COMPANY') {
      return `company_${s.companyGuid}`;
    }
    if (s.entityType === 'COMPANY_PAGE') {
      return `company_${s.companyGuid}_page_${s.entityGuid}`;
    }
    if (s.entityType === 'COMPANY_BUTTON') {
      const pageGuid = this.findCompanyPageGuidForButton(s.companyGuid, s.entityGuid, s.script);
      return pageGuid ? `company_${s.companyGuid}_page_${pageGuid}_button_${s.entityGuid}` : null;
    }
    if (s.entityType === 'COMPANY_INQUIRY') {
      return `company_${s.companyGuid}_inquiry_${s.entityGuid}`;
    }
    if (s.entityType === 'COMPANY_WEBSERVICE') {
      return `company_${s.companyGuid}_webservice_${s.entityGuid}`;
    }
    if (s.entityType === 'PRODUCT') {
      return `company_${s.companyGuid}_product_${s.productGuid}`;
    }
    if (s.entityType === 'PRODUCT_PAGE') {
      return `company_${s.companyGuid}_product_${s.productGuid}_page_${s.entityGuid}`;
    }
    if (s.entityType === 'PRODUCT_BUTTON') {
      const pageGuid = this.findProductPageGuidForButton(s.companyGuid, s.productGuid, s.entityGuid, s.script);
      return pageGuid ? `company_${s.companyGuid}_product_${s.productGuid}_page_${pageGuid}_button_${s.entityGuid}` : null;
    }
    if (s.entityType === 'PRODUCT_TRANSACTION') {
      return `company_${s.companyGuid}_product_${s.productGuid}_txn_${s.entityGuid}`;
    }
    if (s.entityType === 'PRODUCT_TRANSACTION_BUTTON') {
      const txnGuid = this.findProductTxnGuidForButton(s.companyGuid, s.productGuid, s.entityGuid, s.script);
      return txnGuid ? `company_${s.companyGuid}_product_${s.productGuid}_txn_${txnGuid}_button_${s.entityGuid}` : null;
    }
    if (s.entityType === 'PLAN') {
      return `company_${s.companyGuid}_plan_${s.planGuid}`;
    }
    if (s.entityType === 'PLAN_PAGE') {
      return `company_${s.companyGuid}_plan_${s.planGuid}_page_${s.entityGuid}`;
    }
    if (s.entityType === 'PLAN_PAGE_BUTTON') {
      const pageGuid = this.findPlanPageGuidForButton(s.companyGuid, s.planGuid, s.entityGuid, s.script);
      return pageGuid ? `company_${s.companyGuid}_plan_${s.planGuid}_page_${pageGuid}_button_${s.entityGuid}` : null;
    }
    if (s.entityType === 'PLAN_TRANSACTION') {
      return `company_${s.companyGuid}_plan_${s.planGuid}_txn_${s.entityGuid}`;
    }
    if (s.entityType === 'PLAN_TRANSACTION_BUTTON') {
      const txnGuid = this.findPlanTxnGuidForButton(s.companyGuid, s.planGuid, s.entityGuid, s.script);
      return txnGuid ? `company_${s.companyGuid}_plan_${s.planGuid}_txn_${txnGuid}_button_${s.entityGuid}` : null;
    }
    if (s.entityType === 'PLAN_INQUIRY') {
      return `company_${s.companyGuid}_plan_${s.planGuid}_inquiry_${s.entityGuid}`;
    }
    return null;
  }

  buildDialogFilterTree(migrationScripts: MigrationScriptDto[]): void {
    this.allDialogScripts = migrationScripts;
    const tree: DialogFilterNode[] = [];

    // Clear and build parent-child maps from insert scripts
    this.authTxnToTxnMap.clear();
    this.authPageToPageMap.clear();

    migrationScripts.forEach(s => {
      if (!s.script) return;
      const match = s.script.match(/INSERT\s+INTO\s+(\w+)/i);
      if (match) {
        const tableName = match[1].toUpperCase();
        const values = this.extractSqlValues(s.script);
        if (values.length >= 3) {
          if (tableName === 'ASAUTHCOMPANYPAGE' || tableName === 'ASAUTHPLANPAGE' || tableName === 'ASAUTHPRODUCTPAGE') {
            this.authPageToPageMap.set(values[0].toUpperCase(), values[2]);
          } else if (tableName === 'ASAUTHTRANSACTION' || tableName === 'ASAUTHPRODUCTTRANSACTION') {
            this.authTxnToTxnMap.set(values[0].toUpperCase(), values[2]);
          }
        }
      }
    });

    const companyGuids = Array.from(new Set(migrationScripts.map(s => s.companyGuid).filter(Boolean)));

    companyGuids.forEach(companyGuid => {
      const companyNode: DialogFilterNode = {
        id: `company_${companyGuid}`,
        name: this.getCompanyName(companyGuid),
        type: 'company',
        checked: true,
        expanded: true,
        companyGuid: companyGuid!,
        children: []
      };

      // 1. Company Level node
      const companyLevelNode: DialogFilterNode = {
        id: `company_${companyGuid}_level`,
        name: 'Company-level Configuration',
        type: 'company_level',
        checked: true,
        expanded: true,
        companyGuid: companyGuid!,
        children: []
      };

      // Pages under Company Level
      const companyPageScripts = migrationScripts.filter(s => 
        guidEq(s.companyGuid, companyGuid) && !s.productGuid && !s.planGuid && s.entityType === 'COMPANY_PAGE'
      );
      const companyButtonScripts = migrationScripts.filter(s => 
        guidEq(s.companyGuid, companyGuid) && !s.productGuid && !s.planGuid && s.entityType === 'COMPANY_BUTTON'
      );

      const companyPageGuids = new Set<string>();
      companyPageScripts.forEach(s => companyPageGuids.add(s.entityGuid));
      companyButtonScripts.forEach(s => {
        const pageGuid = this.findCompanyPageGuidForButton(companyGuid, s.entityGuid, s.script);
        if (pageGuid) companyPageGuids.add(pageGuid);
      });

      if (companyPageGuids.size > 0) {
        const pagesFolder: DialogFilterNode = {
          id: `company_${companyGuid}_level_pages_folder`,
          name: 'Pages',
          type: 'company_level_pages',
          checked: true,
          expanded: false,
          companyGuid: companyGuid!,
          children: []
        };

        companyPageGuids.forEach(pageGuid => {
          const pageNode: DialogFilterNode = {
            id: `company_${companyGuid}_page_${pageGuid}`,
            name: this.getPageName(pageGuid),
            type: 'page',
            checked: true,
            expanded: false,
            companyGuid: companyGuid!,
            pageGuid: pageGuid,
            children: []
          };

          const btnScripts = companyButtonScripts.filter(s => {
            const pgGuid = this.findCompanyPageGuidForButton(companyGuid, s.entityGuid, s.script);
            return guidEq(pgGuid, pageGuid);
          });

          btnScripts.forEach(s => {
            pageNode.children!.push({
              id: `company_${companyGuid}_page_${pageGuid}_button_${s.entityGuid}`,
              name: this.getButtonName(s.entityGuid),
              type: 'button',
              checked: true,
              companyGuid: companyGuid!,
              pageGuid: pageGuid,
              buttonGuid: s.entityGuid
            });
          });

          pagesFolder.children!.push(pageNode);
        });

        companyLevelNode.children!.push(pagesFolder);
      }

      // Inquiries under Company Level
      const companyInqScripts = migrationScripts.filter(s => 
        guidEq(s.companyGuid, companyGuid) && !s.productGuid && !s.planGuid && s.entityType === 'COMPANY_INQUIRY'
      );
      if (companyInqScripts.length > 0) {
        const inqsFolder: DialogFilterNode = {
          id: `company_${companyGuid}_level_inqs_folder`,
          name: 'Inquiries',
          type: 'company_inquiries',
          checked: true,
          expanded: false,
          companyGuid: companyGuid!,
          children: []
        };
        companyInqScripts.forEach(s => {
          inqsFolder.children!.push({
            id: `company_${companyGuid}_inquiry_${s.entityGuid}`,
            name: this.getInquiryName(companyGuid, s.entityGuid),
            type: 'inquiry',
            checked: true,
            companyGuid: companyGuid!,
            inquiryGuid: s.entityGuid
          });
        });
        companyLevelNode.children!.push(inqsFolder);
      }

      // Web Services under Company Level
      const companyWsScripts = migrationScripts.filter(s => 
        guidEq(s.companyGuid, companyGuid) && !s.productGuid && !s.planGuid && s.entityType === 'COMPANY_WEBSERVICE'
      );
      if (companyWsScripts.length > 0) {
        const wsFolder: DialogFilterNode = {
          id: `company_${companyGuid}_level_ws_folder`,
          name: 'Web Services',
          type: 'company_webservices',
          checked: true,
          expanded: false,
          companyGuid: companyGuid!,
          children: []
        };
        companyWsScripts.forEach(s => {
          wsFolder.children!.push({
            id: `company_${companyGuid}_webservice_${s.entityGuid}`,
            name: this.getWebServiceName(s.entityGuid),
            type: 'webservice',
            checked: true,
            companyGuid: companyGuid!,
            webserviceGuid: s.entityGuid
          });
        });
        companyLevelNode.children!.push(wsFolder);
      }

      if (companyLevelNode.children!.length > 0) {
        companyNode.children!.push(companyLevelNode);
      }

      // Helper to build Plan nodes
      const buildPlanNode = (planGuid: string, productGuid?: string): DialogFilterNode => {
        const planNode: DialogFilterNode = {
          id: `company_${companyGuid}_plan_${planGuid}`,
          name: this.getPlanName(companyGuid, planGuid),
          type: 'plan',
          checked: true,
          expanded: true,
          companyGuid: companyGuid!,
          planGuid: planGuid,
          children: []
        };
        if (productGuid) {
          planNode.productGuid = productGuid;
        }

        // Plan Pages
        const planPageScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.planGuid, planGuid) && s.entityType === 'PLAN_PAGE'
        );
        const planButtonScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.planGuid, planGuid) && s.entityType === 'PLAN_PAGE_BUTTON'
        );
        const planPageGuids = new Set<string>();
        planPageScripts.forEach(s => planPageGuids.add(s.entityGuid));
        planButtonScripts.forEach(s => {
          const pageGuid = this.findPlanPageGuidForButton(companyGuid, planGuid, s.entityGuid, s.script);
          if (pageGuid) planPageGuids.add(pageGuid);
        });

        if (planPageGuids.size > 0) {
          const pagesFolder: DialogFilterNode = {
            id: `company_${companyGuid}_plan_${planGuid}_pages_folder`,
            name: 'Pages',
            type: 'plan_pages',
            checked: true,
            expanded: false,
            companyGuid: companyGuid!,
            planGuid: planGuid,
            children: []
          };

          planPageGuids.forEach(pageGuid => {
            const pageNode: DialogFilterNode = {
              id: `company_${companyGuid}_plan_${planGuid}_page_${pageGuid}`,
              name: this.getPageName(pageGuid),
              type: 'page',
              checked: true,
              expanded: false,
              companyGuid: companyGuid!,
              planGuid: planGuid,
              pageGuid: pageGuid,
              children: []
            };

            const btnScripts = planButtonScripts.filter(s => {
              const pgGuid = this.findPlanPageGuidForButton(companyGuid, planGuid, s.entityGuid, s.script);
              return guidEq(pgGuid, pageGuid);
            });

            btnScripts.forEach(s => {
              pageNode.children!.push({
                id: `company_${companyGuid}_plan_${planGuid}_page_${pageGuid}_button_${s.entityGuid}`,
                name: this.getButtonName(s.entityGuid),
                type: 'button',
                checked: true,
                companyGuid: companyGuid!,
                planGuid: planGuid,
                pageGuid: pageGuid,
                buttonGuid: s.entityGuid
              });
            });

            pagesFolder.children!.push(pageNode);
          });

          planNode.children!.push(pagesFolder);
        }

        // Plan Transactions
        const planTxnScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.planGuid, planGuid) && s.entityType === 'PLAN_TRANSACTION'
        );
        const planTxnButtonScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.planGuid, planGuid) && s.entityType === 'PLAN_TRANSACTION_BUTTON'
        );
        const planTxnGuids = new Set<string>();
        planTxnScripts.forEach(s => planTxnGuids.add(s.entityGuid));
        planTxnButtonScripts.forEach(s => {
          const txnGuid = this.findPlanTxnGuidForButton(companyGuid, planGuid, s.entityGuid, s.script);
          if (txnGuid) planTxnGuids.add(txnGuid);
        });

        if (planTxnGuids.size > 0) {
          const txnsFolder: DialogFilterNode = {
            id: `company_${companyGuid}_plan_${planGuid}_txns_folder`,
            name: 'Transactions',
            type: 'plan_transactions',
            checked: true,
            expanded: false,
            companyGuid: companyGuid!,
            planGuid: planGuid,
            children: []
          };

          planTxnGuids.forEach(txnGuid => {
            const txnNode: DialogFilterNode = {
              id: `company_${companyGuid}_plan_${planGuid}_txn_${txnGuid}`,
              name: this.getTransactionName(companyGuid, txnGuid),
              type: 'transaction',
              checked: true,
              expanded: false,
              companyGuid: companyGuid!,
              planGuid: planGuid,
              transactionGuid: txnGuid,
              children: []
            };

            const btnScripts = planTxnButtonScripts.filter(s => {
              const tGuid = this.findPlanTxnGuidForButton(companyGuid, planGuid, s.entityGuid, s.script);
              return guidEq(tGuid, txnGuid);
            });

            btnScripts.forEach(s => {
              txnNode.children!.push({
                id: `company_${companyGuid}_plan_${planGuid}_txn_${txnGuid}_button_${s.entityGuid}`,
                name: this.getButtonName(s.entityGuid),
                type: 'button',
                checked: true,
                companyGuid: companyGuid!,
                planGuid: planGuid,
                transactionGuid: txnGuid,
                buttonGuid: s.entityGuid
              });
            });

            txnsFolder.children!.push(txnNode);
          });

          planNode.children!.push(txnsFolder);
        }

        // Plan Inquiries
        const planInqScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.planGuid, planGuid) && s.entityType === 'PLAN_INQUIRY'
        );
        if (planInqScripts.length > 0) {
          const inqsFolder: DialogFilterNode = {
            id: `company_${companyGuid}_plan_${planGuid}_inqs_folder`,
            name: 'Inquiries',
            type: 'plan_inquiries',
            checked: true,
            expanded: false,
            companyGuid: companyGuid!,
            planGuid: planGuid,
            children: []
          };
          planInqScripts.forEach(s => {
            inqsFolder.children!.push({
              id: `company_${companyGuid}_plan_${planGuid}_inquiry_${s.entityGuid}`,
              name: this.getInquiryName(companyGuid, s.entityGuid),
              type: 'inquiry',
              checked: true,
              companyGuid: companyGuid!,
              planGuid: planGuid,
              inquiryGuid: s.entityGuid
            });
          });
          planNode.children!.push(inqsFolder);
        }

        return planNode;
      };

      // 2. Products
      const productGuids = Array.from(new Set(
        migrationScripts
          .filter(s => guidEq(s.companyGuid, companyGuid) && s.productGuid)
          .map(s => s.productGuid)
      ));

      productGuids.forEach(productGuid => {
        const productNode: DialogFilterNode = {
          id: `company_${companyGuid}_product_${productGuid}`,
          name: this.getProductName(companyGuid, productGuid!),
          type: 'product',
          checked: true,
          expanded: true,
          companyGuid: companyGuid!,
          productGuid: productGuid!,
          children: []
        };

        // Product Pages
        const prodPageScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.productGuid, productGuid) && !s.planGuid && s.entityType === 'PRODUCT_PAGE'
        );
        const prodButtonScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.productGuid, productGuid) && !s.planGuid && s.entityType === 'PRODUCT_BUTTON'
        );
        const prodPageGuids = new Set<string>();
        prodPageScripts.forEach(s => prodPageGuids.add(s.entityGuid));
        prodButtonScripts.forEach(s => {
          const pageGuid = this.findProductPageGuidForButton(companyGuid, productGuid!, s.entityGuid, s.script);
          if (pageGuid) prodPageGuids.add(pageGuid);
        });

        if (prodPageGuids.size > 0) {
          const pagesFolder: DialogFilterNode = {
            id: `company_${companyGuid}_product_${productGuid}_pages_folder`,
            name: 'Pages',
            type: 'product_pages',
            checked: true,
            expanded: false,
            companyGuid: companyGuid!,
            productGuid: productGuid!,
            children: []
          };

          prodPageGuids.forEach(pageGuid => {
            const pageNode: DialogFilterNode = {
              id: `company_${companyGuid}_product_${productGuid}_page_${pageGuid}`,
              name: this.getPageName(pageGuid),
              type: 'page',
              checked: true,
              expanded: false,
              companyGuid: companyGuid!,
              productGuid: productGuid!,
              pageGuid: pageGuid,
              children: []
            };

            const btnScripts = prodButtonScripts.filter(s => {
              const pgGuid = this.findProductPageGuidForButton(companyGuid, productGuid!, s.entityGuid, s.script);
              return guidEq(pgGuid, pageGuid);
            });

            btnScripts.forEach(s => {
              pageNode.children!.push({
                id: `company_${companyGuid}_product_${productGuid}_page_${pageGuid}_button_${s.entityGuid}`,
                name: this.getButtonName(s.entityGuid),
                type: 'button',
                checked: true,
                companyGuid: companyGuid!,
                productGuid: productGuid!,
                pageGuid: pageGuid,
                buttonGuid: s.entityGuid
              });
            });

            pagesFolder.children!.push(pageNode);
          });

          productNode.children!.push(pagesFolder);
        }

        // Product Transactions
        const prodTxnScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.productGuid, productGuid) && !s.planGuid && s.entityType === 'PRODUCT_TRANSACTION'
        );
        const prodTxnButtonScripts = migrationScripts.filter(s => 
          guidEq(s.companyGuid, companyGuid) && guidEq(s.productGuid, productGuid) && !s.planGuid && s.entityType === 'PRODUCT_TRANSACTION_BUTTON'
        );
        const prodTxnGuids = new Set<string>();
        prodTxnScripts.forEach(s => prodTxnGuids.add(s.entityGuid));
        prodTxnButtonScripts.forEach(s => {
          const txnGuid = this.findProductTxnGuidForButton(companyGuid, productGuid!, s.entityGuid, s.script);
          if (txnGuid) prodTxnGuids.add(txnGuid);
        });

        if (prodTxnGuids.size > 0) {
          const txnsFolder: DialogFilterNode = {
            id: `company_${companyGuid}_product_${productGuid}_txns_folder`,
            name: 'Transactions',
            type: 'product_transactions',
            checked: true,
            expanded: false,
            companyGuid: companyGuid!,
            productGuid: productGuid!,
            children: []
          };

          prodTxnGuids.forEach(txnGuid => {
            const txnNode: DialogFilterNode = {
              id: `company_${companyGuid}_product_${productGuid}_txn_${txnGuid}`,
              name: this.getTransactionName(companyGuid, txnGuid),
              type: 'transaction',
              checked: true,
              expanded: false,
              companyGuid: companyGuid!,
              productGuid: productGuid!,
              transactionGuid: txnGuid,
              children: []
            };

            const btnScripts = prodTxnButtonScripts.filter(s => {
              const tGuid = this.findProductTxnGuidForButton(companyGuid, productGuid!, s.entityGuid, s.script);
              return guidEq(tGuid, txnGuid);
            });

            btnScripts.forEach(s => {
              txnNode.children!.push({
                id: `company_${companyGuid}_product_${productGuid}_txn_${txnGuid}_button_${s.entityGuid}`,
                name: this.getButtonName(s.entityGuid),
                type: 'button',
                checked: true,
                companyGuid: companyGuid!,
                productGuid: productGuid!,
                transactionGuid: txnGuid,
                buttonGuid: s.entityGuid
              });
            });

            txnsFolder.children!.push(txnNode);
          });

          productNode.children!.push(txnsFolder);
        }

        // 3. Plans belonging to this product
        const planGuids = Array.from(new Set(
          migrationScripts
            .filter(s => guidEq(s.companyGuid, companyGuid) && guidEq(s.productGuid, productGuid) && s.planGuid)
            .map(s => s.planGuid)
        ));

        planGuids.forEach(planGuid => {
          productNode.children!.push(buildPlanNode(planGuid!, productGuid!));
        });

        companyNode.children!.push(productNode);
      });

      // 4. Independent Plans
      const independentPlanGuids = Array.from(new Set(
        migrationScripts
          .filter(s => guidEq(s.companyGuid, companyGuid) && !s.productGuid && s.planGuid)
          .map(s => s.planGuid)
      ));

      independentPlanGuids.forEach(planGuid => {
        companyNode.children!.push(buildPlanNode(planGuid!));
      });

      tree.push(companyNode);
    });

    this.dialogFilterNodes = tree;
  }

  onDialogNodeCheckChange(node: DialogFilterNode, checked: boolean): void {
    node.checked = checked;
    
    const setChildrenChecked = (n: DialogFilterNode, val: boolean) => {
      n.checked = val;
      if (n.children) {
        n.children.forEach(c => setChildrenChecked(c, val));
      }
    };
    if (node.children) {
      node.children.forEach(c => setChildrenChecked(c, checked));
    }

    this.updateDialogFilterTreeParentCheckedState();
  }

  isDialogNodeIndeterminate(node: DialogFilterNode): boolean {
    if (!node.children || node.children.length === 0) return false;
    return !node.checked && this.hasAnyCheckedDescendant(node);
  }

  private hasAnyCheckedDescendant(node: DialogFilterNode): boolean {
    if (!node.children) return false;
    return node.children.some(c => c.checked || this.hasAnyCheckedDescendant(c));
  }

  private updateDialogFilterTreeParentCheckedState(): void {
    const updateChecked = (node: DialogFilterNode): boolean => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(updateChecked);
        node.checked = node.children.every(c => c.checked);
      }
      return node.checked;
    };
    this.dialogFilterNodes.forEach(updateChecked);
  }

  getDialogFilteredScripts(): string[] {
    if (!this.allDialogScripts) return [];

    const checkedIds = new Set<string>();

    const traverse = (node: DialogFilterNode) => {
      if (node.checked) {
        checkedIds.add(node.id);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    this.dialogFilterNodes.forEach(traverse);

    const checkedCompanyNodes = this.dialogFilterNodes.filter(n => n.checked || n.children?.some(c => c.checked));

    const filtered = this.allDialogScripts.filter(s => {
      if (s.entityType === 'SECURITY_GROUP') {
        return checkedCompanyNodes.length > 0;
      }
      const nodeId = this.getScriptNodeId(s);
      if (!nodeId) {
        return true;
      }
      return checkedIds.has(nodeId);
    });

    const textFilter = (this.sqlFilterText || '').trim().toLowerCase();
    if (!textFilter) {
      return filtered.map(s => s.script);
    }
    return filtered
      .filter(s => s.script.toLowerCase().includes(textFilter))
      .map(s => s.script);
  }

  getFilteredScripts(scripts: string[]): string[] {
    return this.getDialogFilteredScripts();
  }

  getFormattedFilteredScripts(scripts: string[]): string {
    const filtered = this.getDialogFilteredScripts();
    return filtered.map((s: string) => this.formatSql(s)).join('\n\n');
  }

  backToCompanySelection(): void {
    this.activeStep = 0;

  }

  // Track by functions for ngFor performance
  trackByGuid(index: number, item: any): string {
    return item.pageGuid || item.buttonGuid || item.productGuid || item.planGuid || item.transactionGuid || index;
  }

  trackByCompanyGuid(index: number, item: CompanyConfig): string {
    return item.company.companyGuid;
  }

  // ══════════════════════════════════════════
  // Feature 1: Select All / Deselect All
  // ══════════════════════════════════════════

  selectAllCompanyPages(checked: boolean): void {
    if (!this.activeConfig) return;
    this.activeConfig.companyPages.forEach(page => {
      page.selected = checked;
      page.buttons.forEach(b => b.selected = checked);
    });

  }

  get areAllCompanyPagesSelected(): boolean {
    if (!this.activeConfig || this.activeConfig.companyPages.length === 0) return false;
    return this.activeConfig.companyPages.every(p => p.selected);
  }

  get areSomeCompanyPagesSelected(): boolean {
    if (!this.activeConfig) return false;
    const anySelected = this.activeConfig.companyPages.some(p => p.selected || p.buttons.some(b => b.selected));
    return anySelected && !this.areAllCompanyPagesSelected;
  }

  selectAllInquiries(checked: boolean): void {
    if (!this.activeConfig) return;
    this.activeConfig.companyInquiries.forEach(i => i.selected = checked);

  }

  get areAllInquiriesSelected(): boolean {
    if (!this.activeConfig || this.activeConfig.companyInquiries.length === 0) return false;
    return this.activeConfig.companyInquiries.every(i => i.selected);
  }

  selectAllWebServices(checked: boolean): void {
    if (!this.activeConfig) return;
    this.activeConfig.companyWebServices.forEach(w => w.selected = checked);

  }

  get areAllWebServicesSelected(): boolean {
    if (!this.activeConfig || this.activeConfig.companyWebServices.length === 0) return false;
    return this.activeConfig.companyWebServices.every(w => w.selected);
  }

  selectAllProductPages(product: ProductConfig, checked: boolean): void {
    product.productPages.forEach(page => {
      page.selected = checked;
      page.buttons.forEach(b => b.selected = checked);
    });

  }

  selectAllProductTxns(product: ProductConfig, checked: boolean): void {
    product.productTransactions.forEach(txn => {
      txn.selected = checked;
      (txn as any).buttons?.forEach((b: ButtonDto) => b.selected = checked);
    });

  }

  selectAllPlanPages(plan: PlanConfig, checked: boolean): void {
    plan.planPages.forEach(page => {
      page.selected = checked;
      page.buttons.forEach(b => b.selected = checked);
    });

  }

  selectAllPlanTxns(plan: PlanConfig, checked: boolean): void {
    plan.planTransactions.forEach(txn => {
      txn.selected = checked;
      (txn as any).buttons?.forEach((b: ButtonDto) => b.selected = checked);
    });
  }

  selectAllProductPlanTxns(plan: PlanConfig, checked: boolean): void {
    if (!plan.productPlanTransactions) return;
    plan.productPlanTransactions.forEach(txn => {
      txn.selected = checked;
      (txn as any).buttons?.forEach((b: ButtonDto) => b.selected = checked);
    });
  }



  // ══════════════════════════════════════════
  // Feature 2: Product → Plan Inheritance
  // ══════════════════════════════════════════

  getProductForPlan(config: CompanyConfig, plan: PlanConfig): ProductConfig | null {
    if (!config || !plan) return null;
    // Find the available plan metadata to get its productGuid
    const planMeta = config.availablePlans.find(p => guidEq(p.planGuid, plan.planGuid));
    if (!planMeta) return null;
    return config.products.find(p => guidEq(p.productGuid, planMeta.productGuid)) || null;
  }

  inheritProductConfigToPlan(config: CompanyConfig, product: ProductConfig, plan: PlanConfig): void {
    // Copy page selections from product to plan
    product.productPages.forEach(prodPage => {
      const planPage = plan.planPages.find(pp => guidEq(pp.pageGuid, prodPage.pageGuid));
      if (planPage) {
        planPage.selected = prodPage.selected;
        prodPage.buttons.forEach(prodBtn => {
          const planBtn = planPage.buttons.find(pb => guidEq(pb.buttonGuid, prodBtn.buttonGuid));
          if (planBtn) planBtn.selected = prodBtn.selected;
        });
      }
    });
    // Copy transaction selections where GUIDs match, writing into productPlanTransactions
    product.productTransactions.forEach(prodTxn => {
      if (!plan.productPlanTransactions) return;
      const planTxn = plan.productPlanTransactions.find(pt => guidEq(pt.transactionGuid, (prodTxn as any).transactionGuid));
      if (planTxn) {
        planTxn.selected = (prodTxn as any).selected;
        (prodTxn as any).buttons?.forEach((prodBtn: ButtonDto) => {
          const planBtn = (planTxn as any).buttons?.find((pb: ButtonDto) => guidEq(pb.buttonGuid, prodBtn.buttonGuid));
          if (planBtn) planBtn.selected = prodBtn.selected;
        });
      }
    });

  }

  openInheritDialog(config: CompanyConfig, product: ProductConfig): void {
    const productPlans = config.availablePlans.filter(p => guidEq(p.productGuid, product.productGuid));
    
    const dialogData = {
      product: product,
      availablePlans: productPlans.map(p => ({
        planMeta: p,
        name: p.planName,
        selected: false
      }))
    };

    const dialogRef = this.dialog.open(this.inheritDialogTemplate, {
      width: '400px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const selectedPlans = result.filter((p: any) => p.selected).map((p: any) => p.planMeta);
        if (selectedPlans.length === 0) return;

        this.isSubLoading = true;

        const loadObservables = selectedPlans.map((planMeta: AsPlan) => {
          const existingPlan = config.plans.find(p => guidEq(p.planGuid, planMeta.planGuid));
          if (existingPlan) {
            return of(existingPlan);
          } else {
            return this.lookupService.getTransactions(planMeta.planGuid, undefined).pipe(map(txns => {
              const newPlan: PlanConfig = {
                planGuid: planMeta.planGuid,
                name: planMeta.planName,
                selected: true,
                planPages: this.allPages.map(p => ({
                  pageGuid: p.pageGuid,
                  name: p.pageName,
                  selected: false,
                  buttons: this.allButtons.map(b => ({
                    buttonGuid: b.buttonGuid,
                    name: b.buttonName,
                    selected: false
                  }))
                })),
                planTransactions: txns.map(t => ({
                  transactionGuid: t.transactionGuid,
                  name: t.transactionName,
                  selected: false,
                  buttons: this.allButtons.map(b => ({
                    buttonGuid: b.buttonGuid,
                    name: b.buttonName,
                    selected: false
                  }))
                })),
                planInquiries: []
              };
              config.plans.push(newPlan);
              return newPlan;
            }));
          }
        });

        forkJoin(loadObservables).subscribe({
          next: (loadedPlans: any) => {
            loadedPlans.forEach((planConfig: any) => {
              this.inheritProductConfigToPlan(config, product, planConfig);
            });
            this.isSubLoading = false;
        
          },
          error: (err) => {
            console.error('Failed to apply inheritance to some plans', err);
            this.isSubLoading = false;
          }
        });
      }
    });
  }

  // ══════════════════════════════════════════
  // Feature 3: Clone — load source config
  // ══════════════════════════════════════════

  private loadCloneSourceConfig(): void {
    this.securityGroupService.getGroupConfig(this.cloneSourceGuid).subscribe({
      next: (payload) => {
        this.existingPayload = payload;

        // Pre-select companies that exist in the source
        if (payload.securityGroup.companies) {
          payload.securityGroup.companies.forEach(payloadCompany => {
            const config = this.companyConfigs.find(c => guidEq(c.company.companyGuid, payloadCompany.companyGuid));
            if (config) {
              config.selected = true;
            }
          });
        }
        this.isLoading = false;
        this.updateSelectedCompanies();
    
      },
      error: (err) => {
        console.error('Failed to load clone source config:', err);
        this.isLoading = false;
      }
    });
  }

  // ══════════════════════════════════════════
  // Feature 4: Filtered getters
  // ══════════════════════════════════════════

  get filteredCompanyPages(): CompanyPageDto[] {
    if (!this.activeConfig) return [];
    const filter = this.activeConfig.pageFilter || '';
    if (!filter) return this.activeConfig.companyPages;
    const q = filter.toLowerCase();
    return this.activeConfig.companyPages.filter(p => (p.name || '').toLowerCase().includes(q));
  }

  get filteredInquiries(): (CompanyInquiryDto & { name?: string })[] {
    if (!this.activeConfig) return [];
    const filter = this.activeConfig.inquiryFilter || '';
    if (!filter) return this.activeConfig.companyInquiries;
    const q = filter.toLowerCase();
    return this.activeConfig.companyInquiries.filter(i => (i.name || '').toLowerCase().includes(q));
  }

  get filteredWebServices(): (CompanyWebServiceDto & { name?: string })[] {
    if (!this.activeConfig) return [];
    const filter = this.activeConfig.webServiceFilter || '';
    if (!filter) return this.activeConfig.companyWebServices;
    const q = filter.toLowerCase();
    return this.activeConfig.companyWebServices.filter(w => (w.name || '').toLowerCase().includes(q));
  }

  filterProductPages(product: ProductConfig): CompanyPageDto[] {
    const filter = product.pageFilter || '';
    if (!filter) return product.productPages;
    const q = filter.toLowerCase();
    return product.productPages.filter(p => (p.name || '').toLowerCase().includes(q));
  }

  filterProductTxns(product: ProductConfig): (ProductTransactionDto & { name?: string })[] {
    const filter = product.txnFilter || '';
    if (!filter) return product.productTransactions;
    const q = filter.toLowerCase();
    return product.productTransactions.filter(t => (t.name || '').toLowerCase().includes(q));
  }

  filterPlanPages(plan: PlanConfig): CompanyPageDto[] {
    const filter = plan.pageFilter || '';
    if (!filter) return plan.planPages;
    const q = filter.toLowerCase();
    return plan.planPages.filter(p => (p.name || '').toLowerCase().includes(q));
  }

  filterPlanTxns(plan: PlanConfig): (PlanTransactionDto & { name?: string })[] {
    const filter = plan.txnFilter || '';
    if (!filter) return plan.planTransactions;
    const q = filter.toLowerCase();
    return plan.planTransactions.filter(t => (t.name || '').toLowerCase().includes(q));
  }

  filterProductPlanTxns(plan: PlanConfig): (PlanTransactionDto & { name?: string })[] {
    if (!plan.productPlanTransactions) return [];
    const filter = plan.txnFilter || '';
    if (!filter) return plan.productPlanTransactions;
    const q = filter.toLowerCase();
    return plan.productPlanTransactions.filter(t => (t.name || '').toLowerCase().includes(q));
  }



  // Reset all filters when switching tabs/companies
  clearAllFilters(): void {
    this.pageFilter = '';
    this.inquiryFilter = '';
    this.webServiceFilter = '';
    this.productPageFilter = '';
    this.productTxnFilter = '';
    this.planPageFilter = '';
    this.planTxnFilter = '';
    this.buttonFilter = '';
    this.bulkCompanyButtonGuid = '';
    this.bulkProductButtonGuid = '';
    this.bulkPlanButtonGuid = '';

    // Clear localized filters recursively
    this.companyConfigs.forEach(config => {
      config.pageFilter = '';
      config.inquiryFilter = '';
      config.webServiceFilter = '';
      config.companyPages.forEach(p => p.buttonFilter = '');
      config.products.forEach(p => {
        p.pageFilter = '';
        p.txnFilter = '';
        p.productPages.forEach(pg => pg.buttonFilter = '');
        p.productTransactions.forEach(t => t.buttonFilter = '');
      });
      config.plans.forEach(p => {
        p.pageFilter = '';
        p.txnFilter = '';
        p.planPages.forEach(pg => pg.buttonFilter = '');
        p.planTransactions.forEach(t => t.buttonFilter = '');
        p.productPlanTransactions?.forEach(t => t.buttonFilter = '');
      });
    });
  }

  // ══════════════════════════════════════════
  // Feature 5: Navigation helpers
  // ══════════════════════════════════════════

  getConfiguredCount(config: CompanyConfig): number {
    let count = 0;
    // Count selected pages
    config.companyPages.forEach(p => { if (p.selected) count++; });
    // Count selected page buttons
    config.companyPages.forEach(p => p.buttons.forEach(b => { if (b.selected) count++; }));
    // Count selected inquiries
    config.companyInquiries.forEach(i => { if (i.selected) count++; });
    // Count selected web services
    config.companyWebServices.forEach(w => { if (w.selected) count++; });
    // Count product selections
    config.products.forEach(prod => {
      prod.productPages.forEach(p => { if (p.selected) count++; });
      prod.productPages.forEach(p => p.buttons.forEach(b => { if (b.selected) count++; }));
      prod.productTransactions.forEach(t => (t as any).buttons?.forEach((b: ButtonDto) => { if (b.selected) count++; }));
    });
    // Count plan selections
    config.plans.forEach(plan => {
      plan.planPages.forEach(p => { if (p.selected) count++; });
      plan.planPages.forEach(p => p.buttons.forEach(b => { if (b.selected) count++; }));
      plan.planTransactions.forEach(t => (t as any).buttons?.forEach((b: ButtonDto) => { if (b.selected) count++; }));
    });
    return count;
  }

  getDirectPlansLookup(config: CompanyConfig | null | undefined): AsPlan[] {
    if (!config || !config.availablePlans) return [];
    return config.availablePlans.filter(p => !p.productGuid || !config.products.some(prod => guidEq(prod.productGuid, p.productGuid)));
  }

  getDirectPlans(config: CompanyConfig | null | undefined): PlanConfig[] {
    if (!config || !config.plans || !config.availablePlans) return [];
    return config.plans.filter(p => {
      const planMeta = config.availablePlans.find(meta => guidEq(meta.planGuid, p.planGuid));
      return !planMeta?.productGuid || !config.products.some(prod => guidEq(prod.productGuid, planMeta.productGuid));
    });
  }

  getProductPlans(config: CompanyConfig | null | undefined): PlanConfig[] {
    if (!config || !config.plans || !config.availablePlans) return [];
    return config.plans.filter(p => {
      const planMeta = config.availablePlans.find(meta => guidEq(meta.planGuid, p.planGuid));
      return !!planMeta?.productGuid;
    });
  }

  // ══════════════════════════════════════════
  // Feature 6: Button Filter & Bulk Button Actions
  // ══════════════════════════════════════════

  /** Filter buttons inside a page/transaction by a localized filter text. */
  filterButtons(buttons: ButtonDto[], filterText?: string): ButtonDto[] {
    const filter = filterText || '';
    if (!filter) return buttons;
    const q = filter.toLowerCase();
    return buttons.filter(b => (b.name || '').toLowerCase().includes(q));
  }

  /** Get all distinct buttons available across the active company's pages and transactions. */
  getAvailableButtons(): ButtonDto[] {
    if (!this.activeConfig) return this.allButtons;
    const seen = new Set<string>();
    const result: ButtonDto[] = [];
    const addBtn = (b: ButtonDto) => {
      if (!seen.has(b.buttonGuid.toUpperCase())) {
        seen.add(b.buttonGuid.toUpperCase());
        result.push(b);
      }
    };
    this.activeConfig.companyPages.forEach(p => p.buttons.forEach(addBtn));
    this.activeConfig.products.forEach(prod => {
      prod.productPages.forEach(p => p.buttons.forEach(addBtn));
      prod.productTransactions.forEach(t => (t as any).buttons?.forEach(addBtn));
    });
    this.activeConfig.plans.forEach(plan => {
      plan.planPages.forEach(p => p.buttons.forEach(addBtn));
      plan.planTransactions.forEach(t => (t as any).buttons?.forEach(addBtn));
      plan.productPlanTransactions?.forEach(t => (t as any).buttons?.forEach(addBtn));
    });
    return result.length > 0 ? result : this.allButtons;
  }

  getFilteredAvailableButtons(query: string): ButtonDto[] {
    const buttons = this.getAvailableButtons();
    if (!query) return buttons;
    const q = query.toLowerCase().trim();
    return buttons.filter(b => (b.name || '').toLowerCase().includes(q));
  }

  // ── Company Pages: Bulk Button Toggle ──
  bulkToggleCompanyPageButtons(buttonGuid: string, selected: boolean): void {
    if (!this.activeConfig || !buttonGuid) return;
    this.activeConfig.companyPages.forEach(page => {
      const btn = page.buttons.find(b => guidEq(b.buttonGuid, buttonGuid));
      if (btn) btn.selected = selected;
    });
  }

  // ── Products: Bulk Button Toggle ──
  bulkToggleProductButtons(
    product: ProductConfig,
    buttonGuid: string,
    target: 'pages' | 'txns' | 'both',
    selected: boolean
  ): void {
    if (!buttonGuid) return;
    if (target === 'pages' || target === 'both') {
      product.productPages.forEach(page => {
        const btn = page.buttons.find(b => guidEq(b.buttonGuid, buttonGuid));
        if (btn) btn.selected = selected;
      });
    }
    if (target === 'txns' || target === 'both') {
      product.productTransactions.forEach(txn => {
        const btn = (txn as any).buttons?.find((b: ButtonDto) => guidEq(b.buttonGuid, buttonGuid));
        if (btn) btn.selected = selected;
      });
    }
  }

  bulkToggleAllProductsButtons(
    buttonGuid: string,
    target: 'pages' | 'txns' | 'both',
    selected: boolean
  ): void {
    if (!this.activeConfig || !buttonGuid) return;
    this.activeConfig.products.forEach(prod =>
      this.bulkToggleProductButtons(prod, buttonGuid, target, selected)
    );
  }

  // ── Plans: Bulk Button Toggle ──
  bulkTogglePlanButtons(
    plan: PlanConfig,
    buttonGuid: string,
    target: 'pages' | 'txns' | 'both',
    selected: boolean
  ): void {
    if (!buttonGuid) return;
    if (target === 'pages' || target === 'both') {
      plan.planPages.forEach(page => {
        const btn = page.buttons.find(b => guidEq(b.buttonGuid, buttonGuid));
        if (btn) btn.selected = selected;
      });
    }
    if (target === 'txns' || target === 'both') {
      plan.planTransactions.forEach(txn => {
        const btn = (txn as any).buttons?.find((b: ButtonDto) => guidEq(b.buttonGuid, buttonGuid));
        if (btn) btn.selected = selected;
      });
      plan.productPlanTransactions?.forEach(txn => {
        const btn = (txn as any).buttons?.find((b: ButtonDto) => guidEq(b.buttonGuid, buttonGuid));
        if (btn) btn.selected = selected;
      });
    }
  }

  bulkToggleAllPlansButtons(
    buttonGuid: string,
    target: 'pages' | 'txns' | 'both',
    selected: boolean
  ): void {
    if (!this.activeConfig || !buttonGuid) return;
    this.activeConfig.plans.forEach(plan =>
      this.bulkTogglePlanButtons(plan, buttonGuid, target, selected)
    );
  }

  isAllCompanyPagesSelected(config: CompanyConfig): boolean {
    return config.companyPages.length > 0 && config.companyPages.every(p => p.selected);
  }
  isSomeCompanyPagesSelected(config: CompanyConfig): boolean {
    const anySelected = config.companyPages.some(p => p.selected || p.buttons.some(b => b.selected));
    return anySelected && !this.isAllCompanyPagesSelected(config);
  }
  toggleAllCompanyPages(config: CompanyConfig, checked: boolean): void {
    config.companyPages.forEach(p => {
      p.selected = checked;
      p.buttons.forEach(b => b.selected = checked);
    });
  }

  isAllInquiriesSelected(config: CompanyConfig): boolean {
    return config.companyInquiries.length > 0 && config.companyInquiries.every(i => i.selected);
  }
  isSomeInquiriesSelected(config: CompanyConfig): boolean {
    const anySelected = config.companyInquiries.some(i => i.selected);
    return anySelected && !this.isAllInquiriesSelected(config);
  }
  toggleAllInquiries(config: CompanyConfig, checked: boolean): void {
    config.companyInquiries.forEach(i => i.selected = checked);
  }

  isAllWebServicesSelected(config: CompanyConfig): boolean {
    return config.companyWebServices.length > 0 && config.companyWebServices.every(w => w.selected);
  }
  isSomeWebServicesSelected(config: CompanyConfig): boolean {
    const anySelected = config.companyWebServices.some(w => w.selected);
    return anySelected && !this.isAllWebServicesSelected(config);
  }
  toggleAllWebServices(config: CompanyConfig, checked: boolean): void {
    config.companyWebServices.forEach(w => w.selected = checked);
  }

  isAllProductPagesSelected(product: ProductConfig): boolean {
    return product.productPages.length > 0 && product.productPages.every(p => p.selected);
  }
  isSomeProductPagesSelected(product: ProductConfig): boolean {
    const anySelected = product.productPages.some(p => p.selected || p.buttons.some(b => b.selected));
    return anySelected && !this.isAllProductPagesSelected(product);
  }
  toggleAllProductPages(product: ProductConfig, checked: boolean): void {
    product.productPages.forEach(p => {
      p.selected = checked;
      p.buttons.forEach(b => b.selected = checked);
    });
  }

  isAllProductTxnsSelected(product: ProductConfig): boolean {
    return product.productTransactions.length > 0 && product.productTransactions.every(t => t.selected);
  }
  isSomeProductTxnsSelected(product: ProductConfig): boolean {
    const anySelected = product.productTransactions.some(t => t.selected || t.buttons.some(b => b.selected));
    return anySelected && !this.isAllProductTxnsSelected(product);
  }
  toggleAllProductTxns(product: ProductConfig, checked: boolean): void {
    product.productTransactions.forEach(t => {
      t.selected = checked;
      t.buttons.forEach(b => b.selected = checked);
    });
  }

  isAllPlanPagesSelected(plan: PlanConfig): boolean {
    return plan.planPages.length > 0 && plan.planPages.every(p => p.selected);
  }
  isSomePlanPagesSelected(plan: PlanConfig): boolean {
    const anySelected = plan.planPages.some(p => p.selected || p.buttons.some(b => b.selected));
    return anySelected && !this.isAllPlanPagesSelected(plan);
  }
  toggleAllPlanPages(plan: PlanConfig, checked: boolean): void {
    plan.planPages.forEach(p => {
      p.selected = checked;
      p.buttons.forEach(b => b.selected = checked);
    });
  }

  isAllPlanTxnsSelected(plan: PlanConfig): boolean {
    const allTxns = [...plan.planTransactions, ...(plan.productPlanTransactions || [])];
    return allTxns.length > 0 && allTxns.every(t => t.selected);
  }
  isSomePlanTxnsSelected(plan: PlanConfig): boolean {
    const allTxns = [...plan.planTransactions, ...(plan.productPlanTransactions || [])];
    const anySelected = allTxns.some(t => t.selected || t.buttons.some(b => b.selected));
    return anySelected && !this.isAllPlanTxnsSelected(plan);
  }
  toggleAllPlanTxns(plan: PlanConfig, checked: boolean): void {
    plan.planTransactions.forEach(t => {
      t.selected = checked;
      t.buttons.forEach(b => b.selected = checked);
    });
    plan.productPlanTransactions?.forEach(t => {
      t.selected = checked;
      t.buttons.forEach(b => b.selected = checked);
    });
  }

  isAllPlanInquiriesSelected(plan: PlanConfig): boolean {
    return plan.planInquiries.length > 0 && plan.planInquiries.every(i => i.selected);
  }
  isSomePlanInquiriesSelected(plan: PlanConfig): boolean {
    const anySelected = plan.planInquiries.some(i => i.selected);
    return anySelected && !this.isAllPlanInquiriesSelected(plan);
  }
  toggleAllPlanInquiries(plan: PlanConfig, checked: boolean): void {
    plan.planInquiries.forEach(i => i.selected = checked);
  }

  deselectAllForMigration(): void {
    this.companyConfigs.forEach(c => {
      c.selected = false;
      c.companyPages.forEach(p => {
        p.selected = false;
        p.buttons.forEach(b => b.selected = false);
      });
      c.companyInquiries.forEach(i => i.selected = false);
      c.companyWebServices.forEach(w => w.selected = false);
      c.products.forEach(p => {
        p.selected = false;
        p.productPages.forEach(pg => {
          pg.selected = false;
          pg.buttons.forEach(b => b.selected = false);
        });
        p.productTransactions.forEach(t => {
          t.selected = false;
          t.buttons.forEach(b => b.selected = false);
        });
      });
      c.plans.forEach(p => {
        p.selected = false;
        p.planPages.forEach(pg => {
          pg.selected = false;
          pg.buttons.forEach(b => b.selected = false);
        });
        p.planTransactions.forEach(t => {
          t.selected = false;
          t.buttons.forEach(b => b.selected = false);
        });
        p.productPlanTransactions?.forEach(t => {
          t.selected = false;
          t.buttons.forEach(b => b.selected = false);
        });
        p.planInquiries.forEach(i => i.selected = false);
      });
    });
  }

  selectAllForMigration(): void {
    this.companyConfigs.forEach(c => {
      c.selected = true;
      c.companyPages.forEach(p => {
        p.selected = true;
        p.buttons.forEach(b => b.selected = true);
      });
      c.companyInquiries.forEach(i => i.selected = true);
      c.companyWebServices.forEach(w => w.selected = true);
      c.products.forEach(p => {
        p.selected = true;
        p.productPages.forEach(pg => {
          pg.selected = true;
          pg.buttons.forEach(b => b.selected = true);
        });
        p.productTransactions.forEach(t => {
          t.selected = true;
          t.buttons.forEach(b => b.selected = true);
        });
      });
      c.plans.forEach(p => {
        p.selected = true;
        p.planPages.forEach(pg => {
          pg.selected = true;
          pg.buttons.forEach(b => b.selected = true);
        });
        p.planTransactions.forEach(t => {
          t.selected = true;
          t.buttons.forEach(b => b.selected = true);
        });
        p.productPlanTransactions?.forEach(t => {
          t.selected = true;
          t.buttons.forEach(b => b.selected = true);
        });
        p.planInquiries.forEach(i => i.selected = true);
      });
    });
  }

  buildMigrationPayload(): SecurityGroupRequestDto {
    const companies: CompanyDto[] = this.viewCompanies.map(config => {
      const companyPages = config.companyPages
        .filter(p => p.configured)
        .map(p => ({
          pageGuid: p.pageGuid,
          selected: true,
          buttons: p.buttons.filter(b => b.configured).map(b => ({ buttonGuid: b.buttonGuid, selected: true }))
        }));

      const companyInquiries = config.companyInquiries
        .filter(i => i.configured)
        .map(i => ({
          inquiryScreenNameGuid: i.inquiryScreenNameGuid,
          selected: true
        }));

      const companyWebServices = config.companyWebServices
        .filter(w => w.configured)
        .map(w => ({
          webServiceGuid: w.webServiceGuid,
          selected: true
        }));

      const products = config.products
        .filter(prod => prod.configured)
        .map(prod => ({
          productGuid: prod.productGuid,
          selected: true,
          productPages: prod.productPages
            .filter(p => p.configured)
            .map(p => ({
              pageGuid: p.pageGuid,
              selected: true,
              buttons: p.buttons.filter(b => b.configured).map(b => ({ buttonGuid: b.buttonGuid, selected: true }))
            })),
          productTransactions: prod.productTransactions
            .filter(t => t.configured)
            .map(t => ({
              transactionGuid: t.transactionGuid,
              selected: true,
              buttons: t.buttons.filter(b => b.configured).map(b => ({ buttonGuid: b.buttonGuid, selected: true }))
            }))
        }));

      const plans = config.plans
        .filter(plan => plan.configured)
        .map(plan => ({
          planGuid: plan.planGuid,
          selected: true,
          planPages: plan.planPages
            .filter(p => p.configured)
            .map(p => ({
              pageGuid: p.pageGuid,
              selected: true,
              buttons: p.buttons.filter(b => b.configured).map(b => ({ buttonGuid: b.buttonGuid, selected: true }))
            })),
          planTransactions: [
            ...plan.planTransactions,
            ...(plan.productPlanTransactions || [])
          ]
            .filter(t => t.configured)
            .map(t => ({
              transactionGuid: t.transactionGuid,
              selected: true,
              buttons: t.buttons.filter(b => b.configured).map(b => ({ buttonGuid: b.buttonGuid, selected: true }))
            })),
          planInquiries: plan.planInquiries
            .filter(i => i.configured)
            .map(i => ({
              inquiryScreenNameGuid: i.inquiryScreenNameGuid,
              selected: true
            }))
        }));

      return {
        companyGuid: config.company.companyGuid,
        selected: true,
        companyPages,
        companyInquiries,
        companyWebServices,
        products,
        plans
      };
    });

    return {
      securityGroup: {
        securityGroupGuid: this.groupGuid || undefined,
        groupName: this.groupName,
        companies
      }
    };
  }
}
