import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-coa-view-summary-dialog',
  templateUrl: './coa-view-summary-dialog.component.html',
  styleUrls: ['./coa-view-summary-dialog.component.scss']
})
export class CoaViewSummaryDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<CoaViewSummaryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  close(): void {
    this.dialogRef.close();
  }

  get hasWriteAccounting(): boolean {
    return this.data.criteriaList && this.data.criteriaList.some((c: any) => c.criteria === 'WriteAccounting' && c.value === '01');
  }
}
