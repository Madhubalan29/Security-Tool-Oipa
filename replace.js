const fs = require('fs');
const path = 'd:/security-tool-ui/src/app/components/security-config/security-config.component.html';

const html = fs.readFileSync(path, 'utf8');

// Find start of replacement:
let startIndex = html.indexOf('<!-- ──── COMPARTMENT 1: PLAN PAGES (All Plans) ──── -->');
if (startIndex === -1) {
    startIndex = html.indexOf('<!-- Compartment 1: Direct/Company Plans -->');
}

// Find end of replacement:
const endMarker = '          </ng-template>\n        </mat-tab>\n      </mat-tab-group>\n\n      <!-- Save bar -->';
const endIndex = html.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find markers');
  process.exit(1);
}

const replacement = `<!-- ──── COMPARTMENT 1: PLAN PAGES (All Plans) ──── -->
            <div class="compartment-section plan-pages-section">
              <div class="compartment-header">
                <mat-icon class="compartment-icon company">description</mat-icon>
                <div>
                  <h3 class="compartment-title">Plan Pages Configuration</h3>
                  <p class="compartment-desc">Configure pages for all selected plans (direct and product-inherited)</p>
                </div>
              </div>

              <!-- Add Plan selector -->
              <div class="add-entity-bar">
                <mat-form-field appearance="outline" class="entity-select">
                  <mat-label>Add Direct Plan</mat-label>
                  <mat-select [(value)]="selectedPlanToAdd">
                    <mat-option
                      *ngFor="let plan of getDirectPlansLookup(activeConfig)"
                      [value]="plan"
                      [disabled]="isPlanAdded(activeConfig, plan)"
                    >
                      {{ plan.planName }}
                      <span *ngIf="isPlanAdded(activeConfig, plan)"> (added)</span>
                    </mat-option>
                  </mat-select>
                </mat-form-field>
                <button mat-raised-button color="primary" (click)="addPlanFromSelect(activeConfig)" [disabled]="!selectedPlanToAdd || isSubLoading" class="add-btn">
                  <mat-spinner *ngIf="isSubLoading" diameter="18" class="btn-spinner"></mat-spinner>
                  <mat-icon *ngIf="!isSubLoading">add</mat-icon>
                  {{ isSubLoading ? 'Loading...' : 'Add' }}
                </button>
              </div>

              <!-- Plan Pages Expansion Panels -->
              <mat-accordion multi class="entity-accordion">
                <mat-expansion-panel *ngFor="let plan of activeConfig.plans">
                  <mat-expansion-panel-header>
                    <mat-panel-title class="entity-panel-title">
                      <mat-icon class="entity-icon plan">assignment</mat-icon>
                      <span>{{ plan.name }}</span>
                      <span class="product-badge" *ngIf="getProductForPlan(activeConfig, plan)">
                        <mat-icon>inventory_2</mat-icon>
                        {{ getProductForPlan(activeConfig, plan)?.name }}
                      </span>
                    </mat-panel-title>
                    <mat-panel-description>
                      <button *ngIf="!getProductForPlan(activeConfig, plan)" mat-icon-button (click)="onRemovePlan($event, activeConfig, plan.planGuid)" matTooltip="Remove direct plan" class="remove-btn">
                        <mat-icon>close</mat-icon>
                      </button>
                    </mat-panel-description>
                  </mat-expansion-panel-header>

                  <div class="section-header-row compact nested">
                    <h4 class="sub-section-title">Plan Pages</h4>
                    <div class="bulk-actions-bar">
                      <button mat-stroked-button class="bulk-btn select sm" (click)="selectAllPlanPages(plan, true)">
                        <mat-icon>done_all</mat-icon> All
                      </button>
                      <button mat-stroked-button class="bulk-btn deselect sm" (click)="selectAllPlanPages(plan, false)">
                        <mat-icon>remove_done</mat-icon> None
                      </button>
                    </div>
                  </div>
                  <mat-form-field appearance="outline" class="filter-field compact nested">
                    <mat-icon matPrefix>filter_list</mat-icon>
                    <input matInput [(ngModel)]="planPageFilter" [ngModelOptions]="{standalone: true}" placeholder="Filter pages...">
                    <button *ngIf="planPageFilter" mat-icon-button matSuffix (click)="planPageFilter = ''">
                      <mat-icon>close</mat-icon>
                    </button>
                  </mat-form-field>
                  <mat-accordion multi class="nested-accordion">
                    <mat-expansion-panel *ngFor="let page of filterPlanPages(plan); trackBy: trackByGuid">
                      <mat-expansion-panel-header>
                        <mat-panel-title>
                          <mat-checkbox
                            [checked]="page.selected"
                            [indeterminate]="isPageIndeterminate(page)"
                            (change)="togglePageAll(page, $event.checked)"
                            (click)="$event.stopPropagation()"
                          >
                            {{ page.name }}
                          </mat-checkbox>
                        </mat-panel-title>
                      </mat-expansion-panel-header>
                      <ng-template matExpansionPanelContent>
                        <div class="page-buttons-actions" *ngIf="page.buttons.length > 0">
                          <button mat-stroked-button class="bulk-btn select sm" (click)="toggleAllPageButtons(page, true)" [disabled]="areAllButtonsSelected(page)">Select All Buttons</button>
                          <button mat-stroked-button class="bulk-btn deselect sm" (click)="toggleAllPageButtons(page, false)" [disabled]="!areSomeButtonsSelected(page) && !areAllButtonsSelected(page)">Deselect All</button>
                        </div>
                        <div class="button-grid">
                          <mat-checkbox *ngFor="let btn of page.buttons" [checked]="btn.selected" (change)="btn.selected = $event.checked; onButtonChange(page)" class="button-check">
                            {{ btn.name }}
                          </mat-checkbox>
                        </div>
                      </ng-template>
                    </mat-expansion-panel>
                  </mat-accordion>
                </mat-expansion-panel>
              </mat-accordion>
              <p *ngIf="activeConfig.plans.length === 0" class="empty-text">No plans added yet. Use the selector above or add a product to include plans.</p>
            </div>

            <!-- ──── COMPARTMENT 2: INDEPENDENT PLAN LEVEL TRANSACTIONS ──── -->
            <div class="compartment-section direct-plans-section">
              <div class="compartment-header">
                <mat-icon class="compartment-icon company">business</mat-icon>
                <div>
                  <h3 class="compartment-title">Independent Plan Level Transactions</h3>
                  <p class="compartment-desc">Configure transactions for plans that are linked directly to the company</p>
                </div>
              </div>

              <!-- Direct Plan expansion panels (Transactions ONLY) -->
              <mat-accordion multi class="entity-accordion">
                <mat-expansion-panel *ngFor="let plan of getDirectPlans(activeConfig)">
                  <mat-expansion-panel-header>
                    <mat-panel-title class="entity-panel-title">
                      <mat-icon class="entity-icon plan">assignment</mat-icon>
                      <span>{{ plan.name }}</span>
                    </mat-panel-title>
                  </mat-expansion-panel-header>

                  <div class="section-header-row compact nested">
                    <h4 class="sub-section-title">Plan Transactions</h4>
                    <div class="bulk-actions-bar">
                      <button mat-stroked-button class="bulk-btn select sm" (click)="selectAllPlanTxns(plan, true)">
                        <mat-icon>done_all</mat-icon> All
                      </button>
                      <button mat-stroked-button class="bulk-btn deselect sm" (click)="selectAllPlanTxns(plan, false)">
                        <mat-icon>remove_done</mat-icon> None
                      </button>
                    </div>
                  </div>
                  <mat-form-field appearance="outline" class="filter-field compact nested">
                    <mat-icon matPrefix>filter_list</mat-icon>
                    <input matInput [(ngModel)]="planTxnFilter" [ngModelOptions]="{standalone: true}" placeholder="Filter transactions...">
                    <button *ngIf="planTxnFilter" mat-icon-button matSuffix (click)="planTxnFilter = ''">
                      <mat-icon>close</mat-icon>
                    </button>
                  </mat-form-field>
                  <mat-accordion multi class="nested-accordion">
                    <mat-expansion-panel *ngFor="let txn of filterPlanTxns(plan)">
                      <mat-expansion-panel-header>
                        <mat-panel-title>
                          <mat-checkbox
                            [checked]="txn.selected"
                            [indeterminate]="isTxnIndeterminate(txn)"
                            (change)="toggleTxnAll(txn, $event.checked)"
                            (click)="$event.stopPropagation()"
                          >
                            {{ txn.name }}
                          </mat-checkbox>
                        </mat-panel-title>
                      </mat-expansion-panel-header>
                      <ng-template matExpansionPanelContent>
                        <div class="page-buttons-actions" *ngIf="txn.buttons.length > 0">
                          <button mat-stroked-button class="bulk-btn select sm" (click)="toggleAllTxnButtons(txn, true)" [disabled]="areAllTxnButtonsSelected(txn)">Select All Buttons</button>
                          <button mat-stroked-button class="bulk-btn deselect sm" (click)="toggleAllTxnButtons(txn, false)" [disabled]="!areSomeTxnButtonsSelected(txn) && !areAllTxnButtonsSelected(txn)">Deselect All</button>
                        </div>
                        <div class="button-grid">
                          <mat-checkbox *ngFor="let btn of txn.buttons" [checked]="btn.selected" (change)="btn.selected = $event.checked; onTxnButtonChange(txn)" class="button-check">
                            {{ btn.name }}
                          </mat-checkbox>
                        </div>
                      </ng-template>
                    </mat-expansion-panel>
                  </mat-accordion>
                </mat-expansion-panel>
              </mat-accordion>
              <p *ngIf="getDirectPlans(activeConfig).length === 0" class="empty-text">No direct plans added yet.</p>
            </div>

            <!-- ──── COMPARTMENT 3: PRODUCT LEVEL TRANSACTIONS FOR PLANS ──── -->
            <div class="compartment-section product-plans-section">
              <div class="compartment-header">
                <mat-icon class="compartment-icon link">link</mat-icon>
                <div>
                  <h3 class="compartment-title">Product Level Transactions for Plans</h3>
                  <p class="compartment-desc">Configure product-level transactions for plans whose parent products are selected</p>
                </div>
              </div>

              <!-- Product Plan expansion panels (Transactions ONLY) -->
              <mat-accordion multi class="entity-accordion">
                <mat-expansion-panel *ngFor="let plan of getProductPlans(activeConfig)">
                  <mat-expansion-panel-header>
                    <mat-panel-title class="entity-panel-title">
                      <mat-icon class="entity-icon plan">assignment</mat-icon>
                      <span>{{ plan.name }}</span>
                      <span class="product-badge">
                        <mat-icon>inventory_2</mat-icon>
                        {{ getProductForPlan(activeConfig, plan)?.name }}
                      </span>
                    </mat-panel-title>
                    <mat-panel-description>
                      <button mat-stroked-button color="accent" class="inherit-btn"
                        *ngIf="getProductForPlan(activeConfig, plan)"
                        (click)="inheritProductConfigToPlan(activeConfig, getProductForPlan(activeConfig, plan)!, plan); $event.stopPropagation()"
                        matTooltip="Copy transaction selections from the parent product">
                        <mat-icon>content_copy</mat-icon>
                        Inherit Product Config
                      </button>
                    </mat-panel-description>
                  </mat-expansion-panel-header>

                  <div class="section-header-row compact nested">
                    <h4 class="sub-section-title">Product-Level Transactions</h4>
                    <div class="bulk-actions-bar">
                      <button mat-stroked-button class="bulk-btn select sm" (click)="selectAllPlanTxns(plan, true)">
                        <mat-icon>done_all</mat-icon> All
                      </button>
                      <button mat-stroked-button class="bulk-btn deselect sm" (click)="selectAllPlanTxns(plan, false)">
                        <mat-icon>remove_done</mat-icon> None
                      </button>
                    </div>
                  </div>
                  <mat-form-field appearance="outline" class="filter-field compact nested">
                    <mat-icon matPrefix>filter_list</mat-icon>
                    <input matInput [(ngModel)]="planTxnFilter" [ngModelOptions]="{standalone: true}" placeholder="Filter transactions...">
                    <button *ngIf="planTxnFilter" mat-icon-button matSuffix (click)="planTxnFilter = ''">
                      <mat-icon>close</mat-icon>
                    </button>
                  </mat-form-field>
                  <mat-accordion multi class="nested-accordion">
                    <mat-expansion-panel *ngFor="let txn of filterPlanTxns(plan)">
                      <mat-expansion-panel-header>
                        <mat-panel-title>
                          <mat-checkbox
                            [checked]="txn.selected"
                            [indeterminate]="isTxnIndeterminate(txn)"
                            (change)="toggleTxnAll(txn, $event.checked)"
                            (click)="$event.stopPropagation()"
                          >
                            {{ txn.name }}
                          </mat-checkbox>
                        </mat-panel-title>
                      </mat-expansion-panel-header>
                      <ng-template matExpansionPanelContent>
                        <div class="page-buttons-actions" *ngIf="txn.buttons.length > 0">
                          <button mat-stroked-button class="bulk-btn select sm" (click)="toggleAllTxnButtons(txn, true)" [disabled]="areAllTxnButtonsSelected(txn)">Select All Buttons</button>
                          <button mat-stroked-button class="bulk-btn deselect sm" (click)="toggleAllTxnButtons(txn, false)" [disabled]="!areSomeTxnButtonsSelected(txn) && !areAllTxnButtonsSelected(txn)">Deselect All</button>
                        </div>
                        <div class="button-grid">
                          <mat-checkbox *ngFor="let btn of txn.buttons" [checked]="btn.selected" (change)="btn.selected = $event.checked; onTxnButtonChange(txn)" class="button-check">
                            {{ btn.name }}
                          </mat-checkbox>
                        </div>
                      </ng-template>
                    </mat-expansion-panel>
                  </mat-accordion>

                  <p *ngIf="plan.planTransactions.length === 0" class="empty-text nested">No product-level transactions available. Ensure the parent product's transactions are loaded.</p>
                </mat-expansion-panel>
              </mat-accordion>
              <p *ngIf="getProductPlans(activeConfig).length === 0" class="empty-text">No product plans available. Select products under the "Products" tab to see them here.</p>
            </div>

          </div>
`;

const newHtml = html.substring(0, startIndex) + replacement + html.substring(endIndex);

fs.writeFileSync(path, newHtml);
console.log('Replaced successfully');
