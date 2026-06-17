import { Component, OnInit, ViewChild, ElementRef, Inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';

interface TargetColumn {
  name: string;
  mandatory: boolean;
}

interface SheetMapping {
  sheetName: string;
  sourceColumns: string[];
  columnMappings: { [key: string]: string };
  criteriaLabels?: { [key: string]: string };
}

@Component({
  selector: 'app-rate-loader',
  templateUrl: './rate-loader.component.html',
  styleUrls: ['./rate-loader.component.scss']
})
export class RateLoaderComponent implements OnInit {
  isSubmitted = false;
  fileName = '';
  fileObj: File | null = null;
  uploadSessionId = '';
  isUploadingFile = false;
  sheetNames: string[] = [];
  mappings: SheetMapping[] = [];
  workbook: any = null;
  availableRateGroupDescriptions: string[] = [];
  availableAsRateDescriptions: string[] = [];
  @ViewChild('exportSearchInput') exportSearchInput!: ElementRef;
  @ViewChild('deleteSearchInput') deleteSearchInput!: ElementRef;
  
  exportSearchTerm: string = '';
  deleteSearchTerm: string = '';
  mappingSearchTerms: string[] = [];
  columnMappingSearchTerms: { [mappingIndex: number]: { [targetName: string]: string } } = {};
  selectedDescriptionsForExport: string[] = [];
  selectedDescriptionsForDelete: string[] = [];
  generatedScripts: string = '';
  executeStatus: string = '';
  isExecuting = false;
  isGenerating = false;
  executionSuccess = false;

  targetColumns: TargetColumn[] = [
    { name: 'RATEDESCRIPTION', mandatory: true },
    { name: 'DATECRITERIA', mandatory: true },
    { name: 'CRITERIA1', mandatory: false },
    { name: 'CRITERIA2', mandatory: false },
    { name: 'CRITERIA3', mandatory: false },
    { name: 'CRITERIA4', mandatory: false },
    { name: 'CRITERIA5', mandatory: false },
    { name: 'CRITERIA6', mandatory: false },
    { name: 'CRITERIA7', mandatory: false },
    { name: 'CRITERIA8', mandatory: false },
    { name: 'CRITERIA9', mandatory: false },
    { name: 'CRITERIA10', mandatory: false },
    { name: 'INTEGERCRITERIA', mandatory: false },
    { name: 'RATE', mandatory: true },
  ];

  constructor(private http: HttpClient, private router: Router, private dialog: MatDialog, private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.fetchDescriptions();
  }

  fetchDescriptions() {
    this.http.get<string[]>('https://localhost:8015/api/rates/descriptions').subscribe(
      res => this.availableRateGroupDescriptions = res || [],
      err => console.error('Failed to load group descriptions', err)
    );
    this.http.get<string[]>('https://localhost:8015/api/rates/asrate-descriptions').subscribe(
      res => this.availableAsRateDescriptions = res || [],
      err => console.error('Failed to load asrate descriptions', err)
    );
  }

  getFilteredDescriptions(val: string | undefined): string[] {
    if (!val) {
      return this.availableRateGroupDescriptions;
    }
    const lowerVal = val.toLowerCase();
    return this.availableRateGroupDescriptions.filter(desc => desc.toLowerCase().includes(lowerVal));
  }

  getFilteredColumns(sourceColumns: string[], val: string | undefined): string[] {
    if (!val) {
      return sourceColumns;
    }
    const lowerVal = val.toLowerCase();
    return sourceColumns.filter(col => col.toLowerCase().includes(lowerVal));
  }

  getColumnMappingSearchTerm(mappingIndex: number, targetName: string): string {
    if (!this.columnMappingSearchTerms[mappingIndex]) {
      this.columnMappingSearchTerms[mappingIndex] = {};
    }
    return this.columnMappingSearchTerms[mappingIndex][targetName] || '';
  }

  setColumnMappingSearchTerm(mappingIndex: number, targetName: string, val: string) {
    if (!this.columnMappingSearchTerms[mappingIndex]) {
      this.columnMappingSearchTerms[mappingIndex] = {};
    }
    this.columnMappingSearchTerms[mappingIndex][targetName] = val;
  }

  createNewRateDescription(mapping: SheetMapping, desc: string) {
    const dialogRef = this.dialog.open(CreateRateGroupDialogComponent, {
      width: '600px',
      data: { 
        rateDescription: desc || '', 
        integerCriteria: '1',
        statusCode: '',
        typeCode: '',
        criteria1: '',
        criteria2: '',
        criteria3: '',
        criteria4: '',
        criteria5: '',
        criteria6: '',
        criteria7: '',
        criteria8: '',
        criteria9: '',
        criteria10: '',
        effectiveDate: new Date(), 
        activeFromDate: new Date(),
        activeToDate: null,
        expirationDate: null,
        tableFormat: 'Aggregate',
        secondaryIndex: ''
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const payload = {
          ...result,
          effectiveDate: result.effectiveDate ? new Date(result.effectiveDate).getTime() : null,
          activeFromDate: result.activeFromDate ? new Date(result.activeFromDate).getTime() : null,
          activeToDate: result.activeToDate ? new Date(result.activeToDate).getTime() : null,
          expirationDate: result.expirationDate ? new Date(result.expirationDate).getTime() : null
        };

        this.http.post('https://localhost:8015/api/rates/descriptions', payload).subscribe(
          () => {
            alert('Saved successfully!');
            this.fetchDescriptions();
            // Auto-select the newly created description
            mapping.columnMappings['RATEDESCRIPTION'] = result.rateDescription;
            this.onRateDescriptionChange(mapping, result.rateDescription);
          },
          err => {
            console.error('Creation error:', err);
            alert('Creation failed! ' + (err.error || err.message));
          }
        );
      }
    });
  }

  onRateDescriptionChange(mapping: SheetMapping, desc: string) {
    if (!desc) {
      mapping.criteriaLabels = {};
      return;
    }
    this.http.get<any>(`https://localhost:8015/api/rates/description-details?rateDesc=${encodeURIComponent(desc)}`).subscribe(
      res => {
        mapping.criteriaLabels = {
          'CRITERIA1': res.criteria1,
          'CRITERIA2': res.criteria2,
          'CRITERIA3': res.criteria3,
          'CRITERIA4': res.criteria4,
          'CRITERIA5': res.criteria5,
          'CRITERIA6': res.criteria6,
          'CRITERIA7': res.criteria7,
          'CRITERIA8': res.criteria8,
          'CRITERIA9': res.criteria9,
          'CRITERIA10': res.criteria10,
          'INTEGERCRITERIA': res.integerCriteria
        };
      },
      err => {
        mapping.criteriaLabels = {};
      }
    );
  }

  onFileChange(event: any) {
    const target: DataTransfer = <DataTransfer>(event.target);
    if (target.files.length !== 1) {
      return;
    }
    const file = target.files[0];
    this.fileObj = file;
    this.fileName = file.name;
    this.uploadSessionId = '';
    
    // Read the file locally for mapping
    const reader: FileReader = new FileReader();
    reader.onload = (e: any) => {
      const bstr: string = e.target.result;
      this.workbook = XLSX.read(bstr, { type: 'binary' });
      this.sheetNames = this.workbook.SheetNames;
      this.mappings = []; // reset mappings on new file
    };
    reader.readAsBinaryString(file);

    // Upload to server immediately
    this.isUploadingFile = true;
    const formData = new FormData();
    formData.append('file', file);
    this.http.post<{uploadSessionId: string}>('https://localhost:8015/api/rates/upload-file', formData).subscribe(
      res => {
        this.uploadSessionId = res.uploadSessionId;
        this.isUploadingFile = false;
      },
      err => {
        console.error('File upload error:', err);
        alert('Failed to upload file to the server. Please try again.');
        this.isUploadingFile = false;
      }
    );
  }

  addMapping() {
    this.mappings.push({
      sheetName: '',
      sourceColumns: [],
      columnMappings: {}
    });
    this.mappingSearchTerms.push('');
    this.columnMappingSearchTerms[this.mappings.length - 1] = {};
  }

  removeMapping(index: number) {
    this.mappings.splice(index, 1);
    this.mappingSearchTerms.splice(index, 1);
    delete this.columnMappingSearchTerms[index];
  }

  onSheetSelect(mapping: SheetMapping) {
    if (this.workbook && mapping.sheetName) {
      const ws = this.workbook.Sheets[mapping.sheetName];
      const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[];
      mapping.sourceColumns = headers || [];
      mapping.columnMappings = {};
    }
  }

  submit() {
    this.isSubmitted = true;
    this.generatedScripts = '';
    this.executeStatus = '';
  }

  viewScripts() {
    if (!this.fileObj || !this.uploadSessionId) {
      alert(this.isUploadingFile ? 'Please wait for file upload to finish.' : 'File not uploaded yet.');
      return;
    }
    const formData = new FormData();
    formData.append('mappings', JSON.stringify(this.mappings));
    formData.append('uploadSessionId', this.uploadSessionId);
    
    this.isGenerating = true;
    this.http.post('https://localhost:8015/api/rates/generate-script', formData, { responseType: 'text' }).subscribe(
      res => {
        this.generatedScripts = res;
        this.isGenerating = false;
        this.snackBar.open('Scripts generated successfully!', 'Close', { duration: 3000 });
      },
      err => {
        this.isGenerating = false;
        const errMsg = typeof err.error === 'string' && err.error ? err.error : (err.message || 'Unknown error occurred.');
        this.executeStatus = 'Failed to generate scripts: ' + errMsg;
        alert('Validation Error:\n' + errMsg);
      }
    );
  }

  copyToClipboard() {
    if (this.generatedScripts) {
      navigator.clipboard.writeText(this.generatedScripts).then(() => {
        this.snackBar.open('Copied to clipboard!', 'Close', { duration: 3000 });
      }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard.');
      });
    }
  }

  executeQueries() {
    if (!this.fileObj || !this.uploadSessionId) {
      alert(this.isUploadingFile ? 'Please wait for file upload to finish.' : 'File not uploaded yet.');
      return;
    }
    this.isExecuting = true;
    this.executeStatus = 'Executing...';
    const formData = new FormData();
    formData.append('mappings', JSON.stringify(this.mappings));
    formData.append('uploadSessionId', this.uploadSessionId);

    this.http.post('https://localhost:8015/api/rates/upload', formData, { responseType: 'text' }).subscribe(
      res => {
        this.executeStatus = res;
        this.isExecuting = false;
        this.executionSuccess = true;
        this.snackBar.open('Queries Executed Successfully!', 'Close', { duration: 3000 });
      },
      err => {
        this.executeStatus = 'Failed: ' + (err.error || err.message);
        this.isExecuting = false;
      }
    );
  }

  removeExportChip(desc: string) {
    this.selectedDescriptionsForExport = this.selectedDescriptionsForExport.filter(d => d !== desc);
  }

  removeDeleteChip(desc: string) {
    this.selectedDescriptionsForDelete = this.selectedDescriptionsForDelete.filter(d => d !== desc);
  }

  getFilteredExportDescriptions(): string[] {
    if (!this.exportSearchTerm) return this.availableAsRateDescriptions;
    const lowerTerm = this.exportSearchTerm.toLowerCase();
    return this.availableAsRateDescriptions.filter(desc => desc.toLowerCase().includes(lowerTerm));
  }

  getFilteredDeleteDescriptions(): string[] {
    if (!this.deleteSearchTerm) return this.availableAsRateDescriptions;
    const lowerTerm = this.deleteSearchTerm.toLowerCase();
    return this.availableAsRateDescriptions.filter(desc => desc.toLowerCase().includes(lowerTerm));
  }

  onExportSelectOpen(isOpen: boolean) {
    if (isOpen) {
      setTimeout(() => {
        if (this.exportSearchInput) {
          this.exportSearchInput.nativeElement.focus();
        }
      });
    }
  }

  onDeleteSelectOpen(isOpen: boolean) {
    if (isOpen) {
      setTimeout(() => {
        if (this.deleteSearchInput) {
          this.deleteSearchInput.nativeElement.focus();
        }
      });
    }
  }

  getFilteredMappingDescriptions(index: number): string[] {
    const val = this.mappingSearchTerms[index];
    if (!val) {
      return this.availableRateGroupDescriptions;
    }
    const lowerVal = val.toLowerCase();
    return this.availableRateGroupDescriptions.filter(desc => desc.toLowerCase().includes(lowerVal));
  }

  onMappingSelectOpen(isOpen: boolean, index: number) {
    if (isOpen) {
      setTimeout(() => {
        const input = document.getElementById('mappingSearchInput' + index);
        if (input) {
          input.focus();
        }
      });
    }
  }

  onColMappingSelectOpen(isOpen: boolean, index: number, targetName: string) {
    if (isOpen) {
      setTimeout(() => {
        const input = document.getElementById('colMappingSearchInput' + index + targetName);
        if (input) {
          input.focus();
        }
      });
    }
  }

  onMappingSelectionChange(mapping: SheetMapping, value: string) {
    if (value === 'None') {
      mapping.columnMappings['RATEDESCRIPTION'] = '';
      this.onRateDescriptionChange(mapping, '');
    } else {
      this.onRateDescriptionChange(mapping, value);
    }
  }

  onExportSelectionChange() {
    setTimeout(() => {
      if (this.exportSearchInput) {
        this.exportSearchInput.nativeElement.focus();
      }
    });
  }

  onDeleteSelectionChange() {
    setTimeout(() => {
      if (this.deleteSearchInput) {
        this.deleteSearchInput.nativeElement.focus();
      }
    });
  }

  exportScriptForSelected() {
    if (!this.selectedDescriptionsForExport.length) return;
    this.isGenerating = true;
    this.http.post('https://localhost:8015/api/rates/export-script', this.selectedDescriptionsForExport, { responseType: 'text' }).subscribe(
      res => {
        this.generatedScripts = res;
        this.isGenerating = false;
        this.snackBar.open('Scripts generated successfully!', 'Close', { duration: 3000 });
      },
      err => {
        this.isGenerating = false;
        alert('Failed to generate script: ' + (err.error || err.message));
      }
    );
  }


  deleteRates() {
    if (!this.selectedDescriptionsForDelete.length) return;
    if (!confirm('Are you sure you want to delete the selected rate descriptions?')) return;
    this.isExecuting = true;
    this.http.post('https://localhost:8015/api/rates/delete-rates', this.selectedDescriptionsForDelete, { responseType: 'text' }).subscribe(
      res => {
        this.isExecuting = false;
        this.snackBar.open(res, 'Close', { duration: 3000 });
        
        // Remove deleted descriptions from the dropdown
        this.availableAsRateDescriptions = this.availableAsRateDescriptions.filter(
          desc => !this.selectedDescriptionsForDelete.includes(desc)
        );
        this.selectedDescriptionsForExport = this.selectedDescriptionsForExport.filter(
          desc => !this.selectedDescriptionsForDelete.includes(desc)
        );
        
        this.selectedDescriptionsForDelete = [];
      },
      err => {
        this.isExecuting = false;
        alert('Failed to delete rates: ' + (err.error || err.message));
      }
    );
  }

  cancel() {
    this.isSubmitted = false;
  }

  goHome() {
    this.router.navigate(['/dashboard']);
  }
}

@Component({
  selector: 'app-create-rate-group-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDatepickerModule, MatNativeDateModule],
  template: `
    <h2 mat-dialog-title>Create Rate Description</h2>
    <mat-dialog-content style="display: flex; flex-direction: column; gap: 16px; padding-top: 16px; max-height: 60vh;">
      
      <mat-form-field appearance="outline">
        <mat-label>Rate Description *</mat-label>
        <input matInput [(ngModel)]="data.rateDescription" required>
      </mat-form-field>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <mat-form-field appearance="outline">
          <mat-label>Integer Criteria</mat-label>
          <input matInput [(ngModel)]="data.integerCriteria">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status Code</mat-label>
          <input matInput [(ngModel)]="data.statusCode">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Type Code</mat-label>
          <input matInput [(ngModel)]="data.typeCode">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Table Format</mat-label>
          <input matInput [(ngModel)]="data.tableFormat">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Secondary Index</mat-label>
          <input matInput [(ngModel)]="data.secondaryIndex">
        </mat-form-field>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <mat-form-field appearance="outline">
          <mat-label>Criteria 1</mat-label>
          <input matInput [(ngModel)]="data.criteria1">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 2</mat-label>
          <input matInput [(ngModel)]="data.criteria2">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 3</mat-label>
          <input matInput [(ngModel)]="data.criteria3">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 4</mat-label>
          <input matInput [(ngModel)]="data.criteria4">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 5</mat-label>
          <input matInput [(ngModel)]="data.criteria5">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 6</mat-label>
          <input matInput [(ngModel)]="data.criteria6">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 7</mat-label>
          <input matInput [(ngModel)]="data.criteria7">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 8</mat-label>
          <input matInput [(ngModel)]="data.criteria8">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 9</mat-label>
          <input matInput [(ngModel)]="data.criteria9">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Criteria 10</mat-label>
          <input matInput [(ngModel)]="data.criteria10">
        </mat-form-field>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <mat-form-field appearance="outline" (click)="picker1.open()">
          <mat-label>Effective Date</mat-label>
          <input matInput [matDatepicker]="picker1" [(ngModel)]="data.effectiveDate" readonly>
          <mat-datepicker-toggle matSuffix [for]="picker1"></mat-datepicker-toggle>
          <mat-datepicker #picker1></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" (click)="picker2.open()">
          <mat-label>Active From Date</mat-label>
          <input matInput [matDatepicker]="picker2" [(ngModel)]="data.activeFromDate" readonly>
          <mat-datepicker-toggle matSuffix [for]="picker2"></mat-datepicker-toggle>
          <mat-datepicker #picker2></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" (click)="picker3.open()">
          <mat-label>Active To Date</mat-label>
          <input matInput [matDatepicker]="picker3" [(ngModel)]="data.activeToDate" readonly>
          <mat-datepicker-toggle matSuffix [for]="picker3"></mat-datepicker-toggle>
          <mat-datepicker #picker3></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" (click)="picker4.open()">
          <mat-label>Expiration Date</mat-label>
          <input matInput [matDatepicker]="picker4" [(ngModel)]="data.expirationDate" readonly>
          <mat-datepicker-toggle matSuffix [for]="picker4"></mat-datepicker-toggle>
          <mat-datepicker #picker4></mat-datepicker>
        </mat-form-field>
      </div>

    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="data" [disabled]="!data.rateDescription">Save</button>
    </mat-dialog-actions>
  `
})
export class CreateRateGroupDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<CreateRateGroupDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}
}
