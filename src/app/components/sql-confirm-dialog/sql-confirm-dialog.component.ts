import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-sql-confirm-dialog',
  templateUrl: './sql-confirm-dialog.component.html',
  styleUrls: ['./sql-confirm-dialog.component.scss']
})
export class SqlConfirmDialogComponent implements OnInit {
  formattedScript = '';
  copied = false;

  constructor(
    public dialogRef: MatDialogRef<SqlConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string; subtitle: string; script: string; confirmLabel?: string }
  ) {}

  ngOnInit(): void {
    this.formattedScript = this.formatSql(this.data.script);
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

  copyToClipboard(): void {
    if (!this.data.script) return;
    navigator.clipboard.writeText(this.data.script).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    });
  }
}
