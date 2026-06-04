import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LookupService } from '../../services/lookup.service';
import { SecurityGroupService } from '../../services/security-group.service';
import {
  SecurityGroupRequestDto,
  SecurityGroupDto,
  CompanyDto,
  CompanyPageDto,
  ButtonDto,
  ProductDto,
  PlanDto,
  PlanPageDto,
  PlanTransactionDto,
  ProductPageDto,
  ProductTransactionDto
} from '../../models/security-group.model';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AsCompany, AsProduct, AsPlan, AsAuthPage, AsAuthButton, AsInquiryScreen, AsWebService, AsTransaction } from '../../models/lookup.model';

@Component({
  selector: 'app-security-group-wizard',
  templateUrl: './security-group-wizard.component.html',
  styleUrls: ['./security-group-wizard.component.scss']
})
export class SecurityGroupWizardComponent implements OnInit {
  isLinear = true;

  // Master Data
  companies: AsCompany[] = [];
  pages: AsAuthPage[] = [];
  buttons: AsAuthButton[] = [];
  webServices: AsWebService[] = [];

  // Working Data (State)
  securityGroupGuid: string = '';
  groupName: string = '';

  selectedCompany: string = '';
  selectedProduct: string = '';
  selectedPlan: string = '';

  // Form Groups
  step1Form: FormGroup;
  step2Form: FormGroup;
  step3Form: FormGroup;
  step4Form: FormGroup;
  step5Form: FormGroup;

  // State Management for the Current Selections
  companyPagesState: CompanyPageDto[] = [];
  companyInquiriesState: any[] = [];
  companyWebServicesState: any[] = [];

  productsState: ProductDto[] = [];
  plansState: PlanDto[] = [];

  // Dropdown data for current selections
  availableProducts: AsProduct[] = [];
  availablePlans: AsPlan[] = [];
  companyInquiryScreens: AsInquiryScreen[] = [];
  productTransactions: AsTransaction[] = [];
  planTransactions: AsTransaction[] = [];
  planInquiryScreens: AsInquiryScreen[] = [];

  // Result messages
  generatedQueries: string[] = [];

  constructor(
    private fb: FormBuilder,
    private lookupService: LookupService,
    private securityGroupService: SecurityGroupService
  ) {
    this.step1Form = this.fb.group({
      groupName: ['', Validators.required],
      securityGroupGuid: [''] // Optional for Modify
    });
    this.step2Form = this.fb.group({ companyGuid: ['', Validators.required] });
    this.step3Form = this.fb.group({}); // Validation can be added if required
    this.step4Form = this.fb.group({});
    this.step5Form = this.fb.group({});
  }

  ngOnInit(): void {
    // Fetch initial master data
    forkJoin({
      companies: this.lookupService.getCompanies(),
      pages: this.lookupService.getPages(),
      buttons: this.lookupService.getButtons(),
      webServices: this.lookupService.getWebServices()
    }).subscribe(res => {
      this.companies = res.companies;
      this.pages = res.pages;
      this.buttons = res.buttons;
      this.webServices = res.webServices;
    });
  }

  // --- Step 2: Company Selection & Pages ---
  onCompanySelected(companyGuid: string) {
    this.selectedCompany = companyGuid;
    this.companyPagesState = this.pages.map(p => ({
      pageGuid: p.pageGuid,
      name: p.pageName,
      selected: false,
      buttons: this.buttons.map(b => ({
        buttonGuid: b.buttonGuid,
        name: b.buttonName,
        selected: false
      }))
    }));

    // Fetch related data for later steps
    this.lookupService.getProductsByCompany(companyGuid).subscribe(res => this.availableProducts = res);
    this.lookupService.getInquiryScreens(companyGuid).subscribe(res => {
      this.companyInquiryScreens = res;
      this.companyInquiriesState = res.map(inq => ({
        inquiryScreenNameGuid: inq.inquiryScreenGuid,
        name: inq.screenName,
        selected: false
      }));
    });
    this.companyWebServicesState = this.webServices.map(ws => ({
      webServiceGuid: ws.webServiceGuid,
      name: ws.webServiceName,
      selected: false
    }));
  }

  toggleCompanyPageAll(page: CompanyPageDto, checked: boolean) {
    page.selected = checked;
    page.buttons.forEach(b => b.selected = checked);
  }

  toggleCompanyPageButton(page: CompanyPageDto) {
    page.selected = page.buttons.every(b => b.selected);
  }

  // --- Step 4: Products ---
  onProductSelected(productGuid: string) {
    this.selectedProduct = productGuid;

    // Check if we already have this product in state
    if (!this.productsState.find(p => p.productGuid === productGuid)) {
      this.lookupService.getTransactions(undefined, productGuid).subscribe(txns => {
        const newProduct: ProductDto = {
          productGuid: productGuid,
          name: this.availableProducts.find(p => p.productGuid === productGuid)?.productName,
          productPages: this.pages.map(p => ({
            pageGuid: p.pageGuid,
            name: p.pageName,
            selected: false,
            buttons: this.buttons.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          })),
          productTransactions: txns.map(t => ({
            transactionGuid: t.transactionGuid,
            name: t.transactionName,
            selected: false,
            buttons: this.buttons.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          }))
        };
        this.productsState.push(newProduct);
      });
    }

    // Fetch plans for next step
    if (this.selectedCompany && productGuid) {
      this.lookupService.getPlans(this.selectedCompany, productGuid).subscribe(res => this.availablePlans = res);
    }
  }

  toggleProductPageAll(page: ProductPageDto, checked: boolean) {
    page.selected = checked;
    page.buttons.forEach(b => b.selected = checked);
  }

  toggleProductPageButton(page: ProductPageDto) {
    page.selected = page.buttons.every(b => b.selected);
  }

  toggleProductTxnAll(txn: ProductTransactionDto, checked: boolean) {
    txn.selected = checked;
    txn.buttons.forEach(b => b.selected = checked);
  }

  toggleProductTxnButton(txn: ProductTransactionDto) {
    txn.selected = txn.buttons.every(b => b.selected);
  }

  // --- Step 5: Plans ---
  onPlanSelected(planGuid: string) {
    this.selectedPlan = planGuid;

    if (!this.plansState.find(p => p.planGuid === planGuid)) {
      forkJoin({
        txns: this.lookupService.getTransactions(planGuid, undefined),
        inqs: this.lookupService.getInquiryScreens(undefined, planGuid)
      }).subscribe(res => {
        const newPlan: PlanDto = {
          planGuid: planGuid,
          name: this.availablePlans.find(p => p.planGuid === planGuid)?.planName,
          planPages: this.pages.map(p => ({
            pageGuid: p.pageGuid,
            name: p.pageName,
            selected: false,
            buttons: this.buttons.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          })),
          planTransactions: res.txns.map(t => ({
            transactionGuid: t.transactionGuid,
            name: t.transactionName,
            selected: false,
            buttons: this.buttons.map(b => ({
              buttonGuid: b.buttonGuid,
              name: b.buttonName,
              selected: false
            }))
          })),
          planInquiries: res.inqs.map(inq => ({
            inquiryScreenNameGuid: inq.inquiryScreenGuid,
            name: inq.screenName,
            selected: false
          }))
        };
        this.plansState.push(newPlan);
      });
    }
  }

  togglePlanPageAll(page: PlanPageDto, checked: boolean) {
    page.selected = checked;
    page.buttons.forEach(b => b.selected = checked);
  }

  togglePlanPageButton(page: PlanPageDto) {
    page.selected = page.buttons.every(b => b.selected);
  }

  togglePlanTxnAll(txn: PlanTransactionDto, checked: boolean) {
    txn.selected = checked;
    txn.buttons.forEach(b => b.selected = checked);
  }

  togglePlanTxnButton(txn: PlanTransactionDto) {
    txn.selected = txn.buttons.every(b => b.selected);
  }


  // --- Submission ---
  submit() {
    // 1. Filter out only selected items to build the payload
    const companyPagesPayload = this.companyPagesState
      .filter(p => p.buttons.some(b => b.selected))
      .map(p => ({
        pageGuid: p.pageGuid,
        buttons: p.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
      }));

    const companyInquiriesPayload = this.companyInquiriesState
      .filter(i => i.selected)
      .map(i => ({ inquiryScreenNameGuid: i.inquiryScreenNameGuid }));

    const companyWSPayload = this.companyWebServicesState
      .filter(w => w.selected)
      .map(w => ({ webServiceGuid: w.webServiceGuid }));

    const productsPayload = this.productsState.map(prod => {
      return {
        productGuid: prod.productGuid,
        productPages: prod.productPages
          .filter(p => p.buttons.some(b => b.selected))
          .map(p => ({
            pageGuid: p.pageGuid,
            buttons: p.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
          })),
        productTransactions: prod.productTransactions
          .filter(t => t.buttons.some(b => b.selected))
          .map(t => ({
            transactionGuid: t.transactionGuid,
            buttons: t.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
          }))
      };
    }).filter(prod => prod.productPages.length > 0 || prod.productTransactions.length > 0);

    const plansPayload = this.plansState.map(plan => {
      return {
        planGuid: plan.planGuid,
        planPages: plan.planPages
          .filter(p => p.buttons.some(b => b.selected))
          .map(p => ({
            pageGuid: p.pageGuid,
            buttons: p.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
          })),
        planTransactions: plan.planTransactions
          .filter(t => t.buttons.some(b => b.selected))
          .map(t => ({
            transactionGuid: t.transactionGuid,
            buttons: t.buttons.filter(b => b.selected).map(b => ({ buttonGuid: b.buttonGuid }))
          })),
        planInquiries: plan.planInquiries
          .filter(i => i.selected)
          .map(i => ({ inquiryScreenNameGuid: i.inquiryScreenNameGuid }))
      };
    }).filter(plan => plan.planPages.length > 0 || plan.planTransactions.length > 0 || plan.planInquiries.length > 0);

    const companyPayload: CompanyDto = {
      companyGuid: this.selectedCompany,
      companyPages: companyPagesPayload,
      companyInquiries: companyInquiriesPayload,
      companyWebServices: companyWSPayload,
      products: productsPayload,
      plans: plansPayload
    };

    const request: SecurityGroupRequestDto = {
      securityGroup: {
        securityGroupGuid: this.step1Form.value.securityGroupGuid || undefined,
        groupName: this.step1Form.value.groupName,
        companies: [companyPayload]
      }
    };

    console.log('Final Payload:', JSON.stringify(request, null, 2));

    this.securityGroupService.generateInsertQueries(request).subscribe({
      next: (queries) => {
        this.generatedQueries = queries;
        console.log('Queries generated:', queries);
      },
      error: (err) => {
        console.error('Error generating queries:', err);
      }
    });
  }

  // --- Utility View Helpers ---
  getCurrentProduct(): ProductDto | undefined {
    return this.productsState.find(p => p.productGuid === this.selectedProduct);
  }

  getCurrentPlan(): PlanDto | undefined {
    return this.plansState.find(p => p.planGuid === this.selectedPlan);
  }
}
