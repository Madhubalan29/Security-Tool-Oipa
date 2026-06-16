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
  ButtonDto
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
}

interface ProductConfig {
  productGuid: string;
  name?: string;
  selected: boolean;
  productPages: CompanyPageDto[];
  productTransactions: (ProductTransactionDto & { name?: string })[];
  pageFilter?: string;
  txnFilter?: string;
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

  // ── Feature 3: Clone source ──
  cloneSourceGuid = '';
  copied = false;

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

        // Try to restore persisted state first
        const persisted = this.stateService.loadConfigState();
        if (persisted && persisted.companyConfigs && persisted.companyConfigs.length > 0) {
          this.restoreFromPersistedState(persisted);
        } else {
          // Initialize company configs from scratch
          let companiesToUse = this.allCompanies;
          if (this.baseConfig && this.baseConfig.securityGroup && this.baseConfig.securityGroup.companies) {
            companiesToUse = this.allCompanies.filter(c =>
              this.baseConfig!.securityGroup.companies.some(bc => guidEq(bc.companyGuid, c.companyGuid))
            );
          }
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

          // If modify mode, fetch existing config
          if (this.mode === 'modify' && this.groupGuid) {
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
    if (this.baseConfig && this.baseConfig.securityGroup && this.baseConfig.securityGroup.companies) {
      companiesToUse = this.allCompanies.filter(c =>
        this.baseConfig!.securityGroup.companies.some(bc => guidEq(bc.companyGuid, c.companyGuid))
      );
    }

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
        this.isLoading = false;
        this.updateSelectedCompanies();
    
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
      
        }
      });
    });
  }

  private initCompanyConfig(config: CompanyConfig, onComplete?: () => void): void {
    const companyGuid = config.company.companyGuid;

    // Get the base company config
    const baseCompany = this.baseConfig?.securityGroup?.companies?.find(c => guidEq(c.companyGuid, companyGuid));

    // Init pages with buttons
    let pagesToMap = this.allPages;
    if (baseCompany && baseCompany.companyPages) {
      pagesToMap = this.allPages.filter(p => baseCompany.companyPages.some(bp => guidEq(bp.pageGuid, p.pageGuid)));
    }

    config.companyPages = pagesToMap.map(p => {
      const basePage = baseCompany?.companyPages?.find(bp => guidEq(bp.pageGuid, p.pageGuid));
      let buttonsToMap = this.allButtons;
      if (basePage && basePage.buttons) {
        buttonsToMap = this.allButtons.filter(b => basePage.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
    if (baseCompany && baseCompany.companyWebServices) {
      wsToMap = this.allWebServices.filter(ws => baseCompany.companyWebServices.some(bws => guidEq(bws.webServiceGuid, ws.webServiceGuid)));
    }

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
        if (baseCompany && baseCompany.companyInquiries) {
          screensToMap = res.screens.filter(s => baseCompany.companyInquiries.some(bi => guidEq(bi.inquiryScreenNameGuid, s.inquiryScreenGuid)));
        }

        config.companyInquiries = screensToMap.map(s => ({
          inquiryScreenNameGuid: s.inquiryScreenGuid,
          name: s.screenName,
          selected: false
        }));

        let productsToMap = res.products;
        if (baseCompany && baseCompany.products) {
          productsToMap = res.products.filter(p => baseCompany.products.some(bp => guidEq(bp.productGuid, p.productGuid)));
        }
        config.availableProducts = productsToMap;

        let plansToMap = res.plans;
        if (baseCompany && baseCompany.plans) {
          plansToMap = res.plans.filter(p => baseCompany.plans.some(bp => guidEq(bp.planGuid, p.planGuid)));
        }
        config.availablePlans = plansToMap;

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
    // Apply company pages — mark page as selected if it exists in the payload
    existing.companyPages?.forEach(ep => {
      const page = config.companyPages.find(p => guidEq(p.pageGuid, ep.pageGuid));
      if (page) {
        page.selected = true; // Page is granted access
        ep.buttons?.forEach(eb => {
          const btn = page.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) btn.selected = true;
        });
      }
    });

    // Apply inquiries
    existing.companyInquiries?.forEach(ei => {
      const inq = config.companyInquiries.find(i => guidEq(i.inquiryScreenNameGuid, ei.inquiryScreenNameGuid));
      if (inq) inq.selected = true;
    });

    // Apply web services
    existing.companyWebServices?.forEach(ews => {
      const ws = config.companyWebServices.find(w => guidEq(w.webServiceGuid, ews.webServiceGuid));
      if (ws) ws.selected = true;
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
        const baseCompany = this.baseConfig?.securityGroup?.companies?.find(c => guidEq(c.companyGuid, config.company.companyGuid));
        const baseProduct = baseCompany?.products?.find(p => guidEq(p.productGuid, product.productGuid));

        let pagesToMap = this.allPages;
        if (baseProduct && baseProduct.productPages) {
          pagesToMap = this.allPages.filter(p => baseProduct.productPages.some(bp => guidEq(bp.pageGuid, p.pageGuid)));
        }

        const productPages = pagesToMap.map(p => {
          const basePage = baseProduct?.productPages?.find(bp => guidEq(bp.pageGuid, p.pageGuid));
          let buttonsToMap = this.allButtons;
          if (basePage && basePage.buttons) {
            buttonsToMap = this.allButtons.filter(b => basePage.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
        if (baseProduct && baseProduct.productTransactions) {
          txnsToMap = txns.filter(t => baseProduct.productTransactions.some(bt => guidEq(bt.transactionGuid, t.transactionGuid)));
        }

        const productTransactions = txnsToMap.map(t => {
          const baseTxn = baseProduct?.productTransactions?.find(bt => guidEq(bt.transactionGuid, t.transactionGuid));
          let buttonsToMap = this.allButtons;
          if (baseTxn && baseTxn.buttons) {
            buttonsToMap = this.allButtons.filter(b => baseTxn.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
            const basePlan = baseCompany?.plans?.find(bp => guidEq(bp.planGuid, planMeta.planGuid));
            let planPagesToMap = this.allPages;
            if (basePlan && basePlan.planPages) {
              planPagesToMap = this.allPages.filter(p => basePlan.planPages.some(bp => guidEq(bp.pageGuid, p.pageGuid)));
            }

            const planPages = planPagesToMap.map(p => {
              const basePage = basePlan?.planPages?.find(bp => guidEq(bp.pageGuid, p.pageGuid));
              let buttonsToMap = this.allButtons;
              if (basePage && basePage.buttons) {
                buttonsToMap = this.allButtons.filter(b => basePage.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
                if (basePlan && basePlan.planTransactions) {
                  planTxnsToMap = res.pTxns.filter(t => basePlan.planTransactions.some(bt => guidEq(bt.transactionGuid, t.transactionGuid)));
                }

                planConfig!.planTransactions = planTxnsToMap.map(pt => {
                  const baseTxn = basePlan?.planTransactions?.find(bt => guidEq(bt.transactionGuid, pt.transactionGuid));
                  let buttonsToMap = this.allButtons;
                  if (baseTxn && baseTxn.buttons) {
                    buttonsToMap = this.allButtons.filter(b => baseTxn.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
                if (basePlan && basePlan.planInquiries) {
                  planInqsToMap = res.inqs.filter(inq => basePlan.planInquiries.some(bi => guidEq(bi.inquiryScreenNameGuid, inq.inquiryScreenGuid)));
                }

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
    existing.productPages?.forEach(ep => {
      const page = productConfig.productPages.find(p => guidEq(p.pageGuid, ep.pageGuid));
      if (page) {
        page.selected = true; // Page is granted access
        ep.buttons?.forEach(eb => {
          const btn = page.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) btn.selected = true;
        });
      }
    });

    existing.productTransactions?.forEach(et => {
      const txn = productConfig.productTransactions.find(t => guidEq(t.transactionGuid, et.transactionGuid));
      if (txn) {
        et.buttons?.forEach(eb => {
          const btn = txn.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) btn.selected = true;
        });
        txn.selected = true; // Txn is granted access
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
        const baseCompany = this.baseConfig?.securityGroup?.companies?.find(c => guidEq(c.companyGuid, config.company.companyGuid));
        const basePlan = baseCompany?.plans?.find(p => guidEq(p.planGuid, plan.planGuid));

        let pagesToMap = this.allPages;
        if (basePlan && basePlan.planPages) {
          pagesToMap = this.allPages.filter(p => basePlan.planPages.some(bp => guidEq(bp.pageGuid, p.pageGuid)));
        }

        const planPages = pagesToMap.map(p => {
          const basePage = basePlan?.planPages?.find(bp => guidEq(bp.pageGuid, p.pageGuid));
          let buttonsToMap = this.allButtons;
          if (basePage && basePage.buttons) {
            buttonsToMap = this.allButtons.filter(b => basePage.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
        if (basePlan && basePlan.planTransactions) {
          txnsToMap = res.txns.filter((t: any) => basePlan.planTransactions.some(bt => guidEq(bt.transactionGuid, t.transactionGuid)));
        }

        const planTransactions = txnsToMap.map((t: any) => {
          const baseTxn = basePlan?.planTransactions?.find(bt => guidEq(bt.transactionGuid, t.transactionGuid));
          let buttonsToMap = this.allButtons;
          if (baseTxn && baseTxn.buttons) {
            buttonsToMap = this.allButtons.filter(b => baseTxn.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
        const baseProduct = baseCompany?.products?.find(p => guidEq(p.productGuid, plan.productGuid));
        if (baseProduct && baseProduct.productTransactions) {
          prodTxnsToMap = prodTxnsToMap.filter((pt: any) => baseProduct.productTransactions.some(bpt => guidEq(bpt.transactionGuid, pt.transactionGuid)));
        }

        const productPlanTransactions = prodTxnsToMap.map((pt: any) => {
          const baseTxn = baseProduct?.productTransactions?.find(bpt => guidEq(bpt.transactionGuid, pt.transactionGuid));
          let buttonsToMap = this.allButtons;
          if (baseTxn && baseTxn.buttons) {
            buttonsToMap = this.allButtons.filter(b => baseTxn.buttons.some(bb => guidEq(bb.buttonGuid, b.buttonGuid)));
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
        if (basePlan && basePlan.planInquiries) {
          inqsToMap = res.inqs.filter((inq: any) => basePlan.planInquiries.some(bi => guidEq(bi.inquiryScreenNameGuid, inq.inquiryScreenGuid)));
        }

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
    existing.planPages?.forEach(ep => {
      const page = planConfig.planPages.find(p => guidEq(p.pageGuid, ep.pageGuid));
      if (page) {
        page.selected = true; // Page is granted access
        ep.buttons?.forEach(eb => {
          const btn = page.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) btn.selected = true;
        });
      }
    });

    planConfig.productPlanTransactions?.forEach(pt => {
      const et = existing.planTransactions?.find(e => guidEq(e.transactionGuid, pt.transactionGuid));
      if (et) {
        pt.selected = true;
        et.buttons?.forEach(eb => {
          const btn = pt.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) btn.selected = true;
        });
      }
    });

    existing.planTransactions?.forEach(et => {
      const txn = planConfig.planTransactions.find(t => guidEq(t.transactionGuid, et.transactionGuid));
      if (txn) {
        et.buttons?.forEach(eb => {
          const btn = txn.buttons.find(b => guidEq(b.buttonGuid, eb.buttonGuid));
          if (btn) btn.selected = true;
        });
        txn.selected = true; // Txn is granted access
      }
    });

    existing.planInquiries?.forEach(ei => {
      const inq = planConfig.planInquiries.find(i => guidEq(i.inquiryScreenNameGuid, ei.inquiryScreenNameGuid));
      if (inq) {
        inq.selected = true;
      } else {
        // Fallback to preserve inquiry screen even if lookup metadata isn't populated
        planConfig.planInquiries.push({
          inquiryScreenNameGuid: ei.inquiryScreenNameGuid,
          name: ei.name || 'Unknown Screen',
          selected: true
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

    return companyNodes;
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
        
        const diffs = this.comparePayloads(this.existingPayload, payload);

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
                // Navigate back
                this.router.navigate(['/security-group']);
              },
              error: (err) => {
                this.isSaving = false;
                console.error('Execution error:', err);
                alert('An error occurred while executing the SQL scripts. Please check the logs.');
              }
            });
          }
        });
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Save error:', err);
      }
    });
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
}
