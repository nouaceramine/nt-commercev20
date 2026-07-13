/**
 * BackupRestoreCard - Backup and restore operations
 * Extracted from SystemTab.js (Refactoring: Extract Component)
 */
import { Database, Download, Upload, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export default function BackupRestoreCard({
  backupList, loading,
  onDownload, onSaveToServer, onRestore,
  language,
}) {
  const ar = language === 'ar';

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-600">
          <Database className="h-5 w-5" />
          {ar ? 'النسخ الاحتياطي واستعادة البيانات' : 'Backup & Restore'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={onDownload} disabled={loading} data-testid="download-backup-btn">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {ar ? 'تحميل نسخة احتياطية' : 'Download Backup'}
          </Button>
          <Button variant="outline" className="gap-2" onClick={onSaveToServer} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            {ar ? 'حفظ على السيرفر' : 'Save to Server'}
          </Button>
          <label className="cursor-pointer">
            <input type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onRestore(e.target.files[0]); }} disabled={loading} />
            <Button variant="outline" className="gap-2 pointer-events-none" disabled={loading}>
              <Upload className="h-4 w-4" />{ar ? 'استعادة من ملف' : 'Restore from File'}
            </Button>
          </label>
        </div>
        {backupList.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="font-medium mb-2">{ar ? 'النسخ الاحتياطية المحفوظة' : 'Saved Backups'}</h4>
            <div className="space-y-2 max-h-40 overflow-auto">
              {backupList.map(backup => (
                <div key={backup.id} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                  <span>{backup.filename}</span>
                  <span className="text-muted-foreground">{new Date(backup.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
