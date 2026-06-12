import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-sql-confirm-dialog',
  templateUrl: './sql-confirm-dialog.component.html',
  styleUrls: ['./sql-confirm-dialog.component.scss']
})
export class SqlConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SqlConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string; subtitle: string; script: string; confirmLabel?: string }
  ) {}
}
