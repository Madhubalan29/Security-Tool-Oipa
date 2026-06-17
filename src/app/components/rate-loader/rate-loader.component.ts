import { Component } from '@angular/core';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';

interface TargetColumn {
  name: string;
  mandatory: boolean;
}

interface SheetMapping {
  sheetName: string;
  sourceColumns: string[];
  columnMappings: { [key: string]: string };
}

@Component({
  selector: 'app-rate-loader',
  templateUrl: './rate-loader.component.html',
  styleUrls: ['./rate-loader.component.scss']
})
export class RateLoaderComponent {
  isSubmitted = false;
  fileName = '';
  sheetNames: string[] = [];
  mappings: SheetMapping[] = [];
  workbook: XLSX.WorkBook | null = null;

  targetColumns: TargetColumn[] = [
    { name: 'RATEDESCRIPTION', mandatory: true },
    { name: 'DATECRITERIA', mandatory: false },
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

  constructor(private router: Router) {}

  onFileChange(event: any) {
    const target: DataTransfer = <DataTransfer>(event.target);
    if (target.files.length !== 1) {
      return;
    }
    const file = target.files[0];
    this.fileName = file.name;
    const reader: FileReader = new FileReader();
    reader.onload = (e: any) => {
      const bstr: string = e.target.result;
      this.workbook = XLSX.read(bstr, { type: 'binary' });
      this.sheetNames = this.workbook.SheetNames;
      this.mappings = []; // reset mappings on new file
    };
    reader.readAsBinaryString(file);
  }

  addMapping() {
    this.mappings.push({
      sheetName: '',
      sourceColumns: [],
      columnMappings: {}
    });
  }

  removeMapping(index: number) {
    this.mappings.splice(index, 1);
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
    // Basic validation can be done here.
    // For now, assume it's valid and show success screen.
    this.isSubmitted = true;
  }

  cancel() {
    this.isSubmitted = false;
  }

  goHome() {
    this.router.navigate(['/dashboard']);
  }
}
